#!/usr/bin/env node
/**
 * TLS terminator + username/password gateway in front of official `dsh web`.
 * Auth lives here; core remains @deepseek-ai/dsh. Forwards Host/Origin as the
 * browser sent them so --trusted-host matches. WebSocket upgrades require a
 * valid gateway session before connecting upstream.
 */
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { URL } from 'node:url'
import * as store from './auth/store.mjs'
import {
  loadOrCreateSecret,
  getSessionFromRequest,
  createSessionToken,
  sessionSetCookie,
  sessionClearCookie,
  clearDshAuthCookies,
  SESSION_COOKIE,
} from './auth/session.mjs'
import { setupPage, loginPage, adminPage } from './auth/pages.mjs'
import {
  readLaunchToken,
  browserHasDshAuthCookie,
  exchangeDshToken,
} from './auth/dsh-token.mjs'

const listenHost = process.env.PROXY_LISTEN_HOST || '0.0.0.0'
const listenPort = Number(process.env.HTTPS_PORT || 8443)
const targetHost = process.env.DSH_HOST || '127.0.0.1'
const targetPort = Number(process.env.DSH_PORT || 3080)
const cert = process.env.TLS_CERT || new URL('../data/cert.pem', import.meta.url).pathname
const key = process.env.TLS_KEY || new URL('../data/key.pem', import.meta.url).pathname

const sessionSecret = loadOrCreateSecret()

const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer'])

function forwardHeaders(src) {
  const out = {}
  for (const [k, v] of Object.entries(src)) {
    if (v == null) continue
    if (HOP.has(k.toLowerCase())) continue
    out[k] = v
  }
  return out
}

function sendHtml(res, status, html, extraHeaders = {}) {
  const body = Buffer.from(html, 'utf8')
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  res.end(body)
}

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  res.end(body)
}

function redirect(res, location, extraHeaders = {}) {
  res.writeHead(303, {
    location,
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  res.end()
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { code: 'BODY_TOO_LARGE' }))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseForm(buf) {
  const params = new URLSearchParams(buf.toString('utf8'))
  const out = {}
  for (const [k, v] of params) out[k] = v
  return out
}

function pathnameOf(req) {
  try {
    return new URL(req.url || '/', 'https://gateway.local').pathname
  } catch {
    return '/'
  }
}

function requireSession(req) {
  const session = getSessionFromRequest(req, sessionSecret)
  if (!session) return null
  const user = store.findUser(session.username)
  if (!user || user.disabled) return null
  return { ...session, user }
}

function isAuthPublicPath(pathname) {
  return (
    pathname === '/auth/login' ||
    pathname === '/auth/setup' ||
    pathname === '/auth/logout' ||
    pathname.startsWith('/auth/static/')
  )
}

async function handleAuth(req, res) {
  const pathname = pathnameOf(req)
  const method = req.method || 'GET'

  // --- setup ---
  if (pathname === '/auth/setup') {
    if (store.hasUsers()) {
      return redirect(res, '/auth/login')
    }
    if (method === 'GET') {
      return sendHtml(res, 200, setupPage())
    }
    if (method === 'POST') {
      try {
        const form = parseForm(await readBody(req))
        if (form.password !== form.password2) {
          return sendHtml(res, 400, setupPage({ error: '两次密码不一致', username: form.username || '' }))
        }
        const admin = await store.createAdmin(form.username, form.password)
        const token = createSessionToken(admin, sessionSecret)
        return redirect(res, '/auth/admin', { 'set-cookie': sessionSetCookie(token) })
      } catch (err) {
        return sendHtml(res, 400, setupPage({ error: err.message || '创建失败', username: '' }))
      }
    }
    res.writeHead(405)
    return res.end()
  }

  // PLACEHOLDER_CONTINUE
}

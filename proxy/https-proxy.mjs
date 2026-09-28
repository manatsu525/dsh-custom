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

  // --- login ---
  if (pathname === '/auth/login') {
    if (!store.hasUsers()) return redirect(res, '/auth/setup')
    if (method === 'GET') {
      const next = new URL(req.url || '/', 'https://gateway.local').searchParams.get('next') || '/'
      return sendHtml(res, 200, loginPage({ next }))
    }
    if (method === 'POST') {
      try {
        const form = parseForm(await readBody(req))
        const result = await store.authenticate(form.username, form.password)
        if (!result.ok) {
          const msg = result.reason === 'disabled' ? '账号已禁用' : '用户名或密码错误'
          return sendHtml(res, 401, loginPage({ error: msg, username: form.username || '', next: form.next || '/' }))
        }
        const token = createSessionToken(result.user, sessionSecret)
        let next = form.next || '/'
        if (!next.startsWith('/') || next.startsWith('//')) next = '/'
        return redirect(res, next, { 'set-cookie': sessionSetCookie(token) })
      } catch (err) {
        return sendHtml(res, 500, loginPage({ error: err.message || '登录失败' }))
      }
    }
    res.writeHead(405)
    return res.end()
  }

  // --- logout ---
  if (pathname === '/auth/logout' && (method === 'POST' || method === 'GET')) {
    const clears = [sessionClearCookie(), ...clearDshAuthCookies(req)]
    return redirect(res, '/auth/login', { 'set-cookie': clears })
  }

  // --- admin UI + actions ---
  if (pathname === '/auth/admin' || pathname.startsWith('/auth/admin/')) {
    const auth = requireSession(req)
    if (!auth) return redirect(res, '/auth/login?next=/auth/admin')
    if (auth.user.role !== 'admin') {
      return sendHtml(res, 403, loginPage({ error: '需要管理员权限' }))
    }

    if (pathname === '/auth/admin' && method === 'GET') {
      return sendHtml(res, 200, adminPage({ users: store.listUsers(), me: auth.user.username }))
    }

    const renderAdmin = (opts) => sendHtml(res, opts.status || 200, adminPage({ users: store.listUsers(), me: auth.user.username, ...opts }))

    try {
      if (pathname === '/auth/admin/create' && method === 'POST') {
        const form = parseForm(await readBody(req))
        await store.createUser({ username: form.username, password: form.password, role: form.role || 'user' })
        return redirect(res, '/auth/admin')
      }
      if (pathname === '/auth/admin/toggle' && method === 'POST') {
        const form = parseForm(await readBody(req))
        store.setDisabled(form.username, form.disabled === '1')
        return redirect(res, '/auth/admin')
      }
      if (pathname === '/auth/admin/reset' && method === 'POST') {
        const form = parseForm(await readBody(req))
        await store.setPassword(form.username, form.password)
        return redirect(res, '/auth/admin')
      }
      if (pathname === '/auth/admin/delete' && method === 'POST') {
        const form = parseForm(await readBody(req))
        store.deleteUser(form.username)
        return redirect(res, '/auth/admin')
      }
      // JSON API for tests / automation
      if (pathname === '/auth/api/users' && method === 'GET') {
        return sendJson(res, 200, { users: store.listUsers() })
      }
      if (pathname === '/auth/api/users' && method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        const user = await store.createUser(body)
        return sendJson(res, 201, { user })
      }
    } catch (err) {
      const code = err.code === 'VALIDATION' || err.code === 'EXISTS' || err.code === 'LAST_ADMIN' || err.code === 'NOT_FOUND' ? 400 : 500
      if (pathname.startsWith('/auth/api/')) {
        return sendJson(res, code, { error: err.message })
      }
      return renderAdmin({ error: err.message, status: code })
    }

    res.writeHead(404)
    return res.end('not found')
  }

  // JSON API under /auth/api/* (admin only) — list already handled above for admin path; handle non-admin here
  if (pathname.startsWith('/auth/api/')) {
    const auth = requireSession(req)
    if (!auth) return sendJson(res, 401, { error: 'unauthorized' })
    if (auth.user.role !== 'admin') return sendJson(res, 403, { error: 'forbidden' })
    try {
      if (pathname === '/auth/api/users' && method === 'GET') {
        return sendJson(res, 200, { users: store.listUsers() })
      }
      if (pathname === '/auth/api/users' && method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        const user = await store.createUser(body)
        return sendJson(res, 201, { user })
      }
      const m = pathname.match(/^\/auth\/api\/users\/([^/]+)$/)
      if (m) {
        const username = decodeURIComponent(m[1])
        if (method === 'PATCH') {
          const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
          let user = null
          if (typeof body.disabled === 'boolean') user = store.setDisabled(username, body.disabled)
          if (typeof body.password === 'string') user = await store.setPassword(username, body.password)
          return sendJson(res, 200, { user: user || store.findUser(username) && { username, ...(store.listUsers().find((u) => u.username === username) || {}) } })
        }
        if (method === 'DELETE') {
          store.deleteUser(username)
          return sendJson(res, 200, { ok: true })
        }
      }
      return sendJson(res, 404, { error: 'not found' })
    } catch (err) {
      const code = err.code === 'VALIDATION' || err.code === 'EXISTS' || err.code === 'LAST_ADMIN' || err.code === 'NOT_FOUND' ? 400 : 500
      return sendJson(res, code, { error: err.message })
    }
  }

  res.writeHead(404)
  res.end('not found')
}

function stripTokenFromUrl(url) {
  try {
    const u = new URL(url, 'https://gateway.local')
    if (u.searchParams.has('token')) {
      u.searchParams.delete('token')
      const q = u.searchParams.toString()
      return u.pathname + (q ? `?${q}` : '') + (u.hash || '')
    }
  } catch {
    /* ignore */
  }
  return url
}

/**
 * If the browser lacks a dsh-auth-* cookie (expired or first visit after login),
 * re-exchange the process launch token while the gateway session is still valid.
 * Official dsh cookie Max-Age is shorter than our 1y gate session and we do not
 * patch @deepseek-ai; transparent re-exchange keeps the user logged in for a year.
 */
async function ensureDshCookie(req, res) {
  if (browserHasDshAuthCookie(req.headers.cookie)) return { cookies: [] }
  const launch = readLaunchToken()
  if (!launch) return { cookies: [], warning: 'no_launch_token' }
  const hostHeader = req.headers.host
  if (!hostHeader) return { cookies: [], warning: 'no_host' }
  const result = await exchangeDshToken({
    targetHost,
    targetPort,
    hostHeader,
    launchToken: launch,
  })
  if (result.error || !result.setCookies?.length) {
    return { cookies: [], warning: result.error || `exchange_status_${result.statusCode}` }
  }
  return { cookies: result.setCookies }
}

function proxyHttp(req, res, { extraSetCookies = [], rewriteUrl = null } = {}) {
  const headers = forwardHeaders(req.headers)
  const path = rewriteUrl || req.url
  const upstream = http.request(
    {
      host: targetHost,
      port: targetPort,
      method: req.method,
      path,
      headers,
      agent: false,
    },
    (up) => {
      const outHeaders = { ...up.headers }
      if (extraSetCookies.length) {
        const existing = outHeaders['set-cookie']
        const list = Array.isArray(existing) ? existing.slice() : existing ? [existing] : []
        list.push(...extraSetCookies)
        outHeaders['set-cookie'] = list
      }
      res.writeHead(up.statusCode || 502, outHeaders)
      up.pipe(res)
    },
  )
  upstream.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end(`bad gateway: ${err.message}`)
  })
  req.pipe(upstream)
}

const server = https.createServer(
  {
    cert: fs.readFileSync(cert),
    key: fs.readFileSync(key),
    minVersion: 'TLSv1.2',
  },
  async (req, res) => {
    try {
      const pathname = pathnameOf(req)

      // Auth routes never hit dsh
      if (pathname.startsWith('/auth/')) {
        return await handleAuth(req, res)
      }

      // First-run / login gate
      if (!store.hasUsers()) {
        return redirect(res, '/auth/setup')
      }
      const auth = requireSession(req)
      if (!auth) {
        const next = encodeURIComponent(req.url || '/')
        return redirect(res, `/auth/login?next=${next}`)
      }

      // Strip raw dsh ?token= from browser URLs (users should not need it)
      const cleaned = stripTokenFromUrl(req.url || '/')
      const needsRewrite = cleaned !== (req.url || '/')

      // Exchange launch token → dsh-auth cookie when missing
      let extraSetCookies = []
      const accept = req.headers.accept || ''
      const isHtmlNav =
        (req.method === 'GET' || req.method === 'HEAD') &&
        (pathname === '/' || accept.includes('text/html'))
      if (isHtmlNav || !browserHasDshAuthCookie(req.headers.cookie)) {
        const exchanged = await ensureDshCookie(req, res)
        extraSetCookies = exchanged.cookies || []
      }

      return proxyHttp(req, res, {
        extraSetCookies,
        rewriteUrl: needsRewrite ? cleaned : null,
      })
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' })
        res.end(`gateway error: ${err.message}`)
      }
    }
  },
)

server.on('upgrade', (req, socket, head) => {
  // WebSocket: require gateway session before upstream
  if (!store.hasUsers() || !requireSession(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  const headers = forwardHeaders(req.headers)
  for (const k of [
    'connection',
    'upgrade',
    'sec-websocket-key',
    'sec-websocket-version',
    'sec-websocket-protocol',
    'sec-websocket-extensions',
  ]) {
    const v = req.headers[k]
    if (v != null) headers[k] = v
  }

  // If browser lacks dsh cookie, inject launch token into WS path when possible
  let url = req.url || '/'
  if (!browserHasDshAuthCookie(req.headers.cookie)) {
    const launch = readLaunchToken()
    if (launch) {
      try {
        const u = new URL(url, 'http://dsh.invalid')
        if (!u.searchParams.has('token')) u.searchParams.set('token', launch)
        url = u.pathname + u.search
      } catch {
        /* keep url */
      }
    }
  }

  const upstream = net.connect(targetPort, targetHost)
  upstream.on('connect', () => {
    upstream.write(`${req.method} ${url} HTTP/1.1\r\n`)
    for (const [k, v] of Object.entries(headers)) {
      if (Array.isArray(v)) for (const item of v) upstream.write(`${k}: ${item}\r\n`)
      else upstream.write(`${k}: ${v}\r\n`)
    }
    upstream.write('\r\n')
    if (head?.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})

server.listen(listenPort, listenHost, () => {
  console.log(
    `https-proxy+auth listening https://${listenHost}:${listenPort} -> http://${targetHost}:${targetPort}`,
  )
  console.log(`auth: setup/login at /auth/setup /auth/login ; admin at /auth/admin`)
})

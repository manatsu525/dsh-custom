/**
 * Signed HMAC session cookies (JWT-like). No server-side session map.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const SESSION_COOKIE = 'dsh-gw-session'
/** Default gateway session lifetime: 1 year (~31536000 seconds). Override with SESSION_MAX_AGE_SEC. */
const MAX_AGE_SEC = Number(process.env.SESSION_MAX_AGE_SEC || 60 * 60 * 24 * 365)

function defaultSecretPath() {
  return process.env.SESSION_SECRET_FILE || path.join(process.env.AUTH_DIR || path.join(process.cwd(), 'data', 'auth'), 'session.secret')
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromB64url(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4)
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export function loadOrCreateSecret(secretPath = defaultSecretPath()) {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    return Buffer.from(process.env.SESSION_SECRET, 'utf8')
  }
  try {
    const existing = fs.readFileSync(secretPath)
    if (existing.length >= 32) return existing
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err
  }
  fs.mkdirSync(path.dirname(secretPath), { recursive: true, mode: 0o700 })
  const secret = crypto.randomBytes(48)
  fs.writeFileSync(secretPath, secret, { mode: 0o600 })
  return secret
}

function sign(body, secret) {
  return b64url(crypto.createHmac('sha256', secret).update(body).digest())
}

export function createSessionToken(user, secret, maxAgeSec = MAX_AGE_SEC) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    v: 1,
    u: user.username,
    r: user.role,
    iat: now,
    exp: now + maxAgeSec,
  }
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `v1.${body}.${sign(body, secret)}`
}

export function verifySessionToken(token, secret) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const [, body, sig] = parts
  const expected = sign(body, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let payload
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'))
  } catch {
    return null
  }
  if (!payload || payload.v !== 1 || typeof payload.u !== 'string' || typeof payload.r !== 'string') return null
  if (!Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null
  return { username: payload.u, role: payload.r, iat: payload.iat, exp: payload.exp }
}

export function parseCookies(headerValue) {
  const out = {}
  if (!headerValue) return out
  for (const part of String(headerValue).split(';')) {
    const at = part.indexOf('=')
    if (at === -1) continue
    const k = part.slice(0, at).trim()
    const v = part.slice(at + 1).trim()
    if (k) out[k] = v
  }
  return out
}

export function getSessionFromRequest(req, secret) {
  const cookies = parseCookies(req.headers?.cookie)
  const token = cookies[SESSION_COOKIE]
  if (!token) return null
  return verifySessionToken(token, secret)
}

export function sessionSetCookie(token, maxAgeSec = MAX_AGE_SEC) {
  const expires = new Date(Date.now() + maxAgeSec * 1000).toUTCString()
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    `Max-Age=${maxAgeSec}`,
    `Expires=${expires}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ]
  return parts.join('; ')
}

export function sessionClearCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`
}

/** Clear dsh-auth-* cookies (names unknown; clear common pattern via expire with empty). */
export function clearDshAuthCookies(req) {
  const cookies = parseCookies(req.headers?.cookie)
  const clears = []
  for (const name of Object.keys(cookies)) {
    if (name.startsWith('dsh-auth-')) {
      clears.push(`${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`)
    }
  }
  return clears
}

export { MAX_AGE_SEC }

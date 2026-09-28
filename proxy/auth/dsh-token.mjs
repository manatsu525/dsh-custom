/**
 * Read official dsh process launch token and exchange it for browser dsh-auth cookie.
 */
import fs from 'node:fs'
import http from 'node:http'

function defaultTokenPath() {
  return process.env.DSH_TOKEN_FILE || new URL('../../data/dsh-launch.token', import.meta.url).pathname
}

export function readLaunchToken(tokenPath = defaultTokenPath()) {
  try {
    const t = fs.readFileSync(tokenPath, 'utf8').trim()
    return t || null
  } catch {
    return null
  }
}

/**
 * Capture `dsh web: http://.../?token=XXX` lines from stdout and write token file (mode 600).
 */
export function writeLaunchTokenFromLine(line, tokenPath = defaultTokenPath()) {
  const m = String(line).match(/dsh web:\s*https?:\/\/\S+\?token=([A-Za-z0-9_-]+)/)
  if (!m) return null
  const token = m[1]
  const dir = tokenPath.includes('/') ? tokenPath.replace(/\/[^/]+$/, '') : '.'
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(tokenPath, token + '\n', { mode: 0o600 })
  try {
    fs.chmodSync(tokenPath, 0o600)
  } catch {
    /* ignore */
  }
  return token
}

export function browserHasDshAuthCookie(cookieHeader) {
  if (!cookieHeader) return false
  return String(cookieHeader)
    .split(';')
    .some((p) => p.trim().startsWith('dsh-auth-'))
}

/**
 * GET upstream /?token=<launch> with browser Host, collect Set-Cookie headers.
 * Returns { statusCode, setCookies, location } or { error }.
 */
export function exchangeDshToken({ targetHost, targetPort, hostHeader, launchToken, timeoutMs = 8000 }) {
  return new Promise((resolve) => {
    const path = `/?token=${encodeURIComponent(launchToken)}`
    const req = http.request(
      {
        host: targetHost,
        port: targetPort,
        method: 'GET',
        path,
        headers: {
          host: hostHeader,
          accept: 'text/html',
          'user-agent': 'dsh-gw-token-exchange/1',
        },
        agent: false,
      },
      (res) => {
        const raw = res.headers['set-cookie']
        const setCookies = Array.isArray(raw) ? raw : raw ? [raw] : []
        // Drain body
        res.resume()
        resolve({
          statusCode: res.statusCode || 0,
          setCookies,
          location: res.headers.location || null,
        })
      },
    )
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      resolve({ error: 'timeout' })
    })
    req.on('error', (err) => resolve({ error: err.message }))
    req.end()
  })
}

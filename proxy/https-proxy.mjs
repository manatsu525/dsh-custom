#!/usr/bin/env node
/**
 * TLS terminator in front of official `dsh web` (127.0.0.1:DSH_PORT).
 * Forwards Host/Origin as the browser sent them so --trusted-host matches.
 * WebSocket upgrades are piped raw (required by dsh Host API).
 */
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { URL } from 'node:url'

const listenHost = process.env.PROXY_LISTEN_HOST || '0.0.0.0'
const listenPort = Number(process.env.HTTPS_PORT || 8443)
const targetHost = process.env.DSH_HOST || '127.0.0.1'
const targetPort = Number(process.env.DSH_PORT || 3080)
const cert = process.env.TLS_CERT || new URL('../data/cert.pem', import.meta.url).pathname
const key = process.env.TLS_KEY || new URL('../data/key.pem', import.meta.url).pathname

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

const server = https.createServer(
  {
    cert: fs.readFileSync(cert),
    key: fs.readFileSync(key),
    minVersion: 'TLSv1.2',
  },
  (req, res) => {
    const headers = forwardHeaders(req.headers)
    const upstream = http.request(
      {
        host: targetHost,
        port: targetPort,
        method: req.method,
        path: req.url,
        headers,
        agent: false,
      },
      (up) => {
        res.writeHead(up.statusCode || 502, up.headers)
        up.pipe(res)
      },
    )
    upstream.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
      res.end(`bad gateway: ${err.message}`)
    })
    req.pipe(upstream)
  },
)

server.on('upgrade', (req, socket, head) => {
  // Keep hop-by-hop Upgrade headers — forwardHeaders strips them for normal HTTP.
  const headers = forwardHeaders(req.headers)
  for (const k of ['connection', 'upgrade', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions']) {
    const v = req.headers[k]
    if (v != null) headers[k] = v
  }
  const upstream = net.connect(targetPort, targetHost)
  upstream.on('connect', () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n`)
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
  console.log(`https-proxy listening https://${listenHost}:${listenPort} -> http://${targetHost}:${targetPort}`)
})

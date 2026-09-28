#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const partsDir = path.join(dir, '_parts')
const out = path.join(dir, 'https-proxy.mjs')
const files = fs
  .readdirSync(partsDir)
  .filter((f) => f.startsWith('https-proxy.') && f.endsWith('.txt'))
  .sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1]))
if (files.length < 5) {
  console.error(
    `[assemble-proxy] refusing to overwrite: found ${files.length} parts (need 5): ${files.join(', ')}`,
  )
  process.exit(1)
}
const body = files.map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8')).join('')
// Sanity: assembled file must look like a module
if (!body.includes('https.createServer') || !body.includes('server.listen')) {
  console.error('[assemble-proxy] assembled body looks incomplete; aborting')
  process.exit(1)
}
fs.writeFileSync(out, body)
console.log('[assemble-proxy] wrote', out, body.length, 'bytes from', files.length, 'parts')

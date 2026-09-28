#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const partsDir = path.join(dir, '_parts')
const out = path.join(dir, 'https-proxy.mjs')
const files = fs.readdirSync(partsDir).filter(f => f.startsWith('https-proxy.') && f.endsWith('.txt')).sort((a,b)=>{
  const na=Number(a.split('.')[1]), nb=Number(b.split('.')[1])
  return na-nb
})
const body = files.map(f => fs.readFileSync(path.join(partsDir, f), 'utf8')).join('')
fs.writeFileSync(out, body)
console.log('[assemble-proxy] wrote', out, body.length, 'bytes from', files.length, 'parts')

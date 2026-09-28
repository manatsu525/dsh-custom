/**
 * User store: scrypt password hashes in data/auth/users.json
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(crypto.scrypt)

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEYLEN = 64
const SALT_LEN = 16
const MIN_PASSWORD = 8
const MIN_USERNAME = 2
const MAX_USERNAME = 64
const USERNAME_RE = /^[a-zA-Z0-9._@-]{2,64}$/

export { MIN_PASSWORD }

function defaultUsersPath() {
  return process.env.AUTH_USERS_FILE || path.join(process.env.AUTH_DIR || path.join(process.cwd(), 'data', 'auth'), 'users.json')
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
}

function emptyStore() {
  return { version: 1, users: [] }
}

export function loadStore(filePath = defaultUsersPath()) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.users)) return emptyStore()
    return { version: data.version || 1, users: data.users }
  } catch (err) {
    if (err && err.code === 'ENOENT') return emptyStore()
    throw err
  }
}

function saveStore(store, filePath = defaultUsersPath()) {
  ensureDir(filePath)
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 })
  fs.renameSync(tmp, filePath)
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    /* ignore */
  }
}

export function validateUsername(username) {
  if (typeof username !== 'string') return '用户名无效'
  const u = username.trim()
  if (u.length < MIN_USERNAME || u.length > MAX_USERNAME) return `用户名长度需 ${MIN_USERNAME}–${MAX_USERNAME}`
  if (!USERNAME_RE.test(u)) return '用户名仅允许字母数字 . _ @ -'
  return null
}

export function validatePassword(password) {
  if (typeof password !== 'string') return '密码无效'
  if (password.length < MIN_PASSWORD) return `密码至少 ${MIN_PASSWORD} 位`
  if (password.length > 200) return '密码过长'
  return null
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LEN)
  const derived = await scryptAsync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${Buffer.from(derived).toString('base64')}`
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false
  const parts = stored.split('$')
  if (parts.length !== 6) return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  const derived = await scryptAsync(password, salt, expected.length, { N, r, p })
  const actual = Buffer.from(derived)
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}

function publicUser(u) {
  return {
    username: u.username,
    role: u.role,
    disabled: !!u.disabled,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }
}

export function hasUsers(filePath = defaultUsersPath()) {
  return loadStore(filePath).users.length > 0
}

export function listUsers(filePath = defaultUsersPath()) {
  return loadStore(filePath).users.map(publicUser)
}

export function findUser(username, filePath = defaultUsersPath()) {
  const u = username.trim()
  return loadStore(filePath).users.find((x) => x.username === u) || null
}

export async function createAdmin(username, password, filePath = defaultUsersPath()) {
  const store = loadStore(filePath)
  if (store.users.length > 0) {
    const err = new Error('已完成初始化，不能再创建管理员')
    err.code = 'ALREADY_SETUP'
    throw err
  }
  const ue = validateUsername(username)
  if (ue) {
    const err = new Error(ue)
    err.code = 'VALIDATION'
    throw err
  }
  const pe = validatePassword(password)
  if (pe) {
    const err = new Error(pe)
    err.code = 'VALIDATION'
    throw err
  }
  const now = new Date().toISOString()
  const user = {
    username: username.trim(),
    passwordHash: await hashPassword(password),
    role: 'admin',
    disabled: false,
    createdAt: now,
    updatedAt: now,
  }
  store.users.push(user)
  saveStore(store, filePath)
  return publicUser(user)
}

export async function createUser({ username, password, role = 'user' }, filePath = defaultUsersPath()) {
  const ue = validateUsername(username)
  if (ue) {
    const err = new Error(ue)
    err.code = 'VALIDATION'
    throw err
  }
  const pe = validatePassword(password)
  if (pe) {
    const err = new Error(pe)
    err.code = 'VALIDATION'
    throw err
  }
  if (role !== 'admin' && role !== 'user') {
    const err = new Error('角色无效')
    err.code = 'VALIDATION'
    throw err
  }
  const store = loadStore(filePath)
  const name = username.trim()
  if (store.users.some((u) => u.username === name)) {
    const err = new Error('用户名已存在')
    err.code = 'EXISTS'
    throw err
  }
  const now = new Date().toISOString()
  const user = {
    username: name,
    passwordHash: await hashPassword(password),
    role,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  }
  store.users.push(user)
  saveStore(store, filePath)
  return publicUser(user)
}

export async function authenticate(username, password, filePath = defaultUsersPath()) {
  const user = findUser(username, filePath)
  if (!user) return { ok: false, reason: 'bad_credentials' }
  if (user.disabled) return { ok: false, reason: 'disabled' }
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return { ok: false, reason: 'bad_credentials' }
  return { ok: true, user: publicUser(user) }
}

export async function setPassword(username, password, filePath = defaultUsersPath()) {
  const pe = validatePassword(password)
  if (pe) {
    const err = new Error(pe)
    err.code = 'VALIDATION'
    throw err
  }
  const store = loadStore(filePath)
  const u = store.users.find((x) => x.username === username.trim())
  if (!u) {
    const err = new Error('用户不存在')
    err.code = 'NOT_FOUND'
    throw err
  }
  u.passwordHash = await hashPassword(password)
  u.updatedAt = new Date().toISOString()
  saveStore(store, filePath)
  return publicUser(u)
}

export function setDisabled(username, disabled, filePath = defaultUsersPath()) {
  const store = loadStore(filePath)
  const u = store.users.find((x) => x.username === username.trim())
  if (!u) {
    const err = new Error('用户不存在')
    err.code = 'NOT_FOUND'
    throw err
  }
  if (u.role === 'admin' && disabled) {
    const admins = store.users.filter((x) => x.role === 'admin' && !x.disabled)
    if (admins.length <= 1) {
      const err = new Error('不能禁用唯一管理员')
      err.code = 'LAST_ADMIN'
      throw err
    }
  }
  u.disabled = !!disabled
  u.updatedAt = new Date().toISOString()
  saveStore(store, filePath)
  return publicUser(u)
}

export function deleteUser(username, filePath = defaultUsersPath()) {
  const store = loadStore(filePath)
  const name = username.trim()
  const idx = store.users.findIndex((x) => x.username === name)
  if (idx === -1) {
    const err = new Error('用户不存在')
    err.code = 'NOT_FOUND'
    throw err
  }
  const u = store.users[idx]
  if (u.role === 'admin') {
    const admins = store.users.filter((x) => x.role === 'admin')
    if (admins.length <= 1) {
      const err = new Error('不能删除唯一管理员')
      err.code = 'LAST_ADMIN'
      throw err
    }
  }
  store.users.splice(idx, 1)
  saveStore(store, filePath)
  return true
}

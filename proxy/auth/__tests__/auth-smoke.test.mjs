/**
 * Auth store + session smoke tests (no dsh process required).
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import * as store from '../store.mjs'
import {
  createSessionToken,
  verifySessionToken,
  loadOrCreateSecret,
  sessionSetCookie,
  parseCookies,
} from '../session.mjs'
import { writeLaunchTokenFromLine, readLaunchToken } from '../dsh-token.mjs'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-auth-test-'))
const usersFile = path.join(tmpRoot, 'users.json')
const secretFile = path.join(tmpRoot, 'session.secret')
const tokenFile = path.join(tmpRoot, 'dsh-launch.token')

describe('auth store', () => {
  it('empty store has no users', () => {
    assert.equal(store.hasUsers(usersFile), false)
    assert.deepEqual(store.listUsers(usersFile), [])
  })

  it('create admin on empty store', async () => {
    const admin = await store.createAdmin('admin', 'password123', usersFile)
    assert.equal(admin.username, 'admin')
    assert.equal(admin.role, 'admin')
    assert.equal(store.hasUsers(usersFile), true)
  })

  it('reject short password', async () => {
    await assert.rejects(() => store.createUser({ username: 'u2', password: 'short' }, usersFile), /至少/)
  })

  it('login ok / bad password fails', async () => {
    const ok = await store.authenticate('admin', 'password123', usersFile)
    assert.equal(ok.ok, true)
    assert.equal(ok.user.username, 'admin')

    const bad = await store.authenticate('admin', 'wrong-password', usersFile)
    assert.equal(bad.ok, false)
    assert.equal(bad.reason, 'bad_credentials')
  })

  it('create user, disable, reset, delete', async () => {
    const u = await store.createUser({ username: 'alice', password: 'alicepass1' }, usersFile)
    assert.equal(u.role, 'user')

    store.setDisabled('alice', true, usersFile)
    const disabled = await store.authenticate('alice', 'alicepass1', usersFile)
    assert.equal(disabled.ok, false)
    assert.equal(disabled.reason, 'disabled')

    store.setDisabled('alice', false, usersFile)
    await store.setPassword('alice', 'newpass123', usersFile)
    const after = await store.authenticate('alice', 'newpass123', usersFile)
    assert.equal(after.ok, true)

    store.deleteUser('alice', usersFile)
    assert.equal(store.findUser('alice', usersFile), null)
  })

  it('cannot delete last admin', () => {
    assert.throws(() => store.deleteUser('admin', usersFile), /唯一管理员/)
  })

  it('second createAdmin fails when users exist', async () => {
    await assert.rejects(() => store.createAdmin('other', 'password123', usersFile), /已完成初始化/)
  })
})

describe('session cookies', () => {
  let secret
  before(() => {
    secret = loadOrCreateSecret(secretFile)
  })

  it('round-trip sign/verify', () => {
    const token = createSessionToken({ username: 'admin', role: 'admin' }, secret)
    const payload = verifySessionToken(token, secret)
    assert.equal(payload.username, 'admin')
    assert.equal(payload.role, 'admin')
  })

  it('tampered token fails', () => {
    const token = createSessionToken({ username: 'admin', role: 'admin' }, secret)
    const bad = token.slice(0, -4) + 'xxxx'
    assert.equal(verifySessionToken(bad, secret), null)
  })

  it('set-cookie includes HttpOnly Secure and 1y Max-Age', () => {
    const c = sessionSetCookie('v1.abc.def')
    assert.match(c, /HttpOnly/)
    assert.match(c, /Secure/)
    assert.match(c, /dsh-gw-session=/)
    assert.match(c, /Max-Age=31536000/)
    assert.match(c, /Expires=/)
    const parsed = parseCookies(c.split(';')[0])
    assert.ok(parsed['dsh-gw-session'])
  })

  it('session token exp is ~1 year ahead', () => {
    const secret = loadOrCreateSecret(secretFile)
    const token = createSessionToken({ username: 'admin', role: 'admin' }, secret)
    const payload = verifySessionToken(token, secret)
    const ttl = payload.exp - payload.iat
    assert.equal(ttl, 31536000)
  })
})

describe('dsh token file', () => {
  it('parses launch line and reads back', () => {
    const line = 'dsh web: http://127.0.0.1:3080/?token=wiLRovCUGSdu04NzxKthUvsbUbnNHc9ynku1dAXPujU'
    const t = writeLaunchTokenFromLine(line, tokenFile)
    assert.equal(t, 'wiLRovCUGSdu04NzxKthUvsbUbnNHc9ynku1dAXPujU')
    assert.equal(readLaunchToken(tokenFile), t)
    const st = fs.statSync(tokenFile)
    // mode 600 when supported
    assert.equal(st.mode & 0o777, 0o600)
  })
})

describe('admin API authorization (in-memory rules)', () => {
  it('non-admin role is not admin', async () => {
    await store.createUser({ username: 'bob', password: 'bobpass12', role: 'user' }, usersFile)
    const bob = store.findUser('bob', usersFile)
    assert.equal(bob.role, 'user')
    const secret = loadOrCreateSecret(secretFile)
    const token = createSessionToken({ username: 'bob', role: 'user' }, secret)
    const session = verifySessionToken(token, secret)
    assert.equal(session.role, 'user')
    // gateway must reject admin APIs when role !== admin
    assert.notEqual(session.role, 'admin')
  })
})

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

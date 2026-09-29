import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  amrIncludesPassword,
  decodeJwtPayload,
  sessionHasPassword,
  stillMustSetPassword,
} from '../src/lib/passwordSet.ts'

function token(payload: Record<string, unknown>) {
  const json = JSON.stringify(payload)
  const body = btoa(json).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `header.${body}.sig`
}

test('AMR password is recognised in both JWT shapes', () => {
  assert.equal(amrIncludesPassword([{ method: 'password', timestamp: 1 }]), true)
  assert.equal(amrIncludesPassword(['otp', 'password']), true)
  assert.equal(amrIncludesPassword([{ method: 'otp' }]), false)
  assert.equal(amrIncludesPassword(['magiclink']), false)
  assert.equal(amrIncludesPassword(null), false)
  const jwt = token({ amr: [{ method: 'password', timestamp: 10 }] })
  assert.equal(sessionHasPassword(jwt), true)
  assert.deepEqual(decodeJwtPayload(jwt)?.amr, [{ method: 'password', timestamp: 10 }])
  assert.equal(sessionHasPassword(token({ amr: ['otp'] })), false)
  assert.equal(sessionHasPassword('not-a-jwt'), false)
  assert.equal(sessionHasPassword(null, [{ method: 'password' }]), true)
})

test('a password session clears the nag even when the member column is still true', () => {
  const password = token({ amr: [{ method: 'password' }] })
  const invite = token({ amr: [{ method: 'otp' }] })
  assert.equal(stillMustSetPassword(true, password), false)
  assert.equal(stillMustSetPassword(true, invite), true)
  assert.equal(stillMustSetPassword(false, invite), false)
  assert.equal(stillMustSetPassword(true, null), true)
})

test('password sign-in and the member shell record or derive the flag', () => {
  const login = readFileSync(new URL('../src/pages/LoginPage.tsx', import.meta.url), 'utf8')
  const layout = readFileSync(new URL('../src/pages/dashboard/DashboardLayout.tsx', import.meta.url), 'utf8')
  const confirm = readFileSync(new URL('../src/pages/AuthConfirmPage.tsx', import.meta.url), 'utf8')
  assert.match(login, /signInWithPassword/)
  assert.match(login, /clearPasswordFlag\(data\.user\.id\)/)
  assert.match(layout, /stillMustSetPassword/)
  assert.match(layout, /clearPasswordFlag\(user\.id\)/)
  assert.match(confirm, /clearPasswordFlag/)
  assert.equal((login + layout + confirm).includes('\u2014'), false)
})

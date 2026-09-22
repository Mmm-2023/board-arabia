import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readRecoveryLocation } from '../src/lib/recovery.ts'

test('hash access token on the site root is sent to the confirm route', () => {
  const hash = '#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=recovery'
  const parsed = readRecoveryLocation(`https://boardarabia.com/${hash}`)
  assert.equal(parsed.recovery, true)
  assert.equal(parsed.onRecoveryRoute, false)
  assert.equal(parsed.accessToken, 'abc')
  assert.equal(parsed.refreshToken, 'def')
  assert.equal(parsed.redirectTo, `/auth/confirm${hash}`)
  assert.equal(parsed.redirectTo?.includes('\u2014'), false)
})

test('ACCESS_TOKEN in the hash is read', () => {
  const parsed = readRecoveryLocation(
    'https://boardarabia.com/auth/confirm#ACCESS_TOKEN=abc&REFRESH_TOKEN=def&type=recovery',
  )
  assert.equal(parsed.onRecoveryRoute, true)
  assert.equal(parsed.redirectTo, null)
  assert.equal(parsed.accessToken, 'abc')
  assert.equal(parsed.refreshToken, 'def')
})

test('query token_hash on confirm and reset stays on that route', () => {
  for (const path of ['/auth/confirm', '/auth/reset']) {
    const parsed = readRecoveryLocation(
      `https://boardarabia.com${path}?token_hash=example&type=recovery`,
    )
    assert.equal(parsed.recovery, true)
    assert.equal(parsed.onRecoveryRoute, true)
    assert.equal(parsed.redirectTo, null)
    assert.equal(parsed.tokenHash, 'example')
    assert.equal(parsed.type, 'recovery')
  }
})

test('a normal login URL is not a recovery', () => {
  const parsed = readRecoveryLocation('https://boardarabia.com/login')
  assert.equal(parsed.recovery, false)
  assert.equal(parsed.redirectTo, null)
  assert.equal(parsed.accessToken, '')
})

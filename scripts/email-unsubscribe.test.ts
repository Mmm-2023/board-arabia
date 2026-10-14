import assert from 'node:assert/strict'
import test from 'node:test'
import { ONE_CLICK_BODY } from '../supabase/functions/_shared/bulk_mail_copy.ts'
import { handleUnsubscribe } from '../supabase/functions/email-unsubscribe/handle.ts'

async function call(input: { method: string; token?: string; body?: string; limit?: 'ok' | 'limited' | 'error'; site?: string }) {
  const calls: string[] = []
  const result = await handleUnsubscribe({
    method: input.method,
    url: `https://example.com/functions/v1/email-unsubscribe?t=${encodeURIComponent(input.token || '')}`,
    body: input.body ?? '',
    siteOrigin: input.site || 'https://example.com',
    limit: async () => input.limit || 'ok',
    unsubscribe: async (token) => {
      calls.push(token)
    },
  })
  return { result, calls }
}

test('one-click POST unsubscribes without a login and bad tokens look the same', async () => {
  const good = await call({ method: 'POST', token: 'good-token', body: ONE_CLICK_BODY })
  const bad = await call({ method: 'POST', token: 'bad-token', body: ONE_CLICK_BODY })
  assert.equal(good.result.status, 200)
  assert.equal(bad.result.status, 200)
  assert.equal(good.result.body, '')
  assert.equal(bad.result.body, '')
  assert.deepEqual(good.calls, ['good-token'])
  assert.deepEqual(bad.calls, ['bad-token'])
  assert.equal(good.result.location, undefined)
  assert.equal(bad.result.location, undefined)
})

test('GET does not unsubscribe and a limited POST does not either', async () => {
  const read = await call({ method: 'GET', token: 'good-token' })
  assert.equal(read.result.status, 302)
  assert.equal(read.result.location, 'https://example.com/email/unsubscribe?t=good-token')
  assert.deepEqual(read.calls, [])
  const plain = await call({ method: 'POST', token: 'good-token', body: 'please' })
  assert.equal(plain.result.status, 200)
  assert.deepEqual(plain.calls, [])
  const limited = await call({ method: 'POST', token: 'good-token', body: ONE_CLICK_BODY, limit: 'limited' })
  assert.equal(limited.result.status, 429)
  assert.deepEqual(limited.calls, [])
  const broken = await call({ method: 'POST', token: 'good-token', body: ONE_CLICK_BODY, limit: 'error' })
  assert.equal(broken.result.status, 429)
  assert.deepEqual(broken.calls, [])
})

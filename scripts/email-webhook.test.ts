import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { addressHash } from '../supabase/functions/_shared/bulk_mail.ts'
import { handleWebhook, type ProviderCall } from '../supabase/functions/email-webhook/handle.ts'

const secretBytes = Buffer.from('example-signing-key')
const secret = `whsec_${secretBytes.toString('base64')}`
const nowMs = 1_700_000_000_000
const timestamp = String(Math.floor(nowMs / 1000))

function sign(body: string, key = secretBytes, stamp = timestamp): string {
  const mac = createHmac('sha256', key).update(`${'msg_1'}.${stamp}.${body}`).digest('base64')
  return `v1,${mac}`
}

function payload(type: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    type,
    created_at: '2026-10-14T08:00:00.000Z',
    data: {
      email_id: 'msg-provider-1',
      to: ['member.one@example.com'],
      ...extra,
    },
  })
}

async function post(
  body: string,
  headers: { id?: string | null; timestamp?: string | null; signature?: string | null; secret?: string } = {},
) {
  const calls: ProviderCall[] = []
  const result = await handleWebhook({
    secret: headers.secret === undefined ? secret : headers.secret,
    headers: {
      id: headers.id === undefined ? 'msg_1' : headers.id,
      timestamp: headers.timestamp === undefined ? timestamp : headers.timestamp,
      signature: headers.signature === undefined ? sign(body) : headers.signature,
    },
    body,
    nowMs,
    record: async (event) => {
      calls.push(event)
    },
  })
  return { result, calls }
}

test('a valid signature stores opened, clicked, delivered, bounced and complained events', async () => {
  const cases = [
    payload('email.opened', { open: { timestamp: '2026-10-14T08:01:00.000Z', ipAddress: '203.0.113.5', userAgent: 'hidden' } }),
    payload('email.clicked', { click: { link: 'https://example.com/story', timestamp: '2026-10-14T08:02:00.000Z', ipAddress: '203.0.113.5' } }),
    payload('email.delivered'),
    payload('email.bounced', { bounce: { type: 'Permanent', message: 'gone' } }),
    payload('email.complained'),
  ]
  const expected = ['opened', 'clicked', 'delivered', 'hard_bounce', 'complaint']
  for (let index = 0; index < cases.length; index += 1) {
    const { result, calls } = await post(cases[index])
    assert.equal(result.status, 204, expected[index])
    assert.equal(result.wrote, 1, expected[index])
    assert.equal(calls.length, 1, expected[index])
    assert.equal(calls[0].type, expected[index])
    assert.equal(calls[0].messageId, 'msg-provider-1')
    assert.equal(calls[0].emailHash, await addressHash('member.one@example.com'))
    assert.equal(JSON.stringify(calls[0]).includes('203.0.113.5'), false)
    assert.equal(JSON.stringify(calls[0]).includes('hidden'), false)
  }
  const clicked = await post(cases[1])
  assert.equal(clicked.calls[0].url, 'https://example.com/story')
  assert.equal(clicked.calls[0].occurredAt, '2026-10-14T08:02:00.000Z')
  const soft = await post(payload('email.bounced', { bounce: { type: 'Transient' } }))
  assert.equal(soft.calls[0].type, 'soft_bounce')
  assert.equal(soft.calls[0].url, null)
})

test('a bad signature, wrong secret, missing secret, or old timestamp writes nothing', async () => {
  const body = payload('email.complained')
  const tampered = await post(`${body} `, { signature: sign(body) })
  const wrong = await post(body, { secret: `whsec_${Buffer.from('other-example-key').toString('base64')}` })
  const missing = await post(body, { secret: '' })
  const stale = await post(body, { timestamp: String(Math.floor(nowMs / 1000) - 6 * 60), signature: sign(body, secretBytes, String(Math.floor(nowMs / 1000) - 6 * 60)) })
  const bare = await post(body, { id: null })
  for (const item of [tampered, wrong, missing, stale, bare]) {
    assert.equal(item.result.status, 401)
    assert.equal(item.result.wrote, 0)
    assert.equal(item.calls.length, 0)
  }
})

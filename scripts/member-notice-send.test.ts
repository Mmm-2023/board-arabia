import assert from 'node:assert/strict'
import test from 'node:test'
import { memberNoticeMail } from '../supabase/functions/_shared/member_notice_copy.ts'
import { deliverMemberNotices, MEMBER_NOTICE_PROVIDER_URL, type NoticeToSend } from '../supabase/functions/_shared/member_notice_send.ts'

const contact = 'notices@example.com'
const site = 'https://example.com'

function notice(typeKey: string, index: number, essential = false): NoticeToSend {
  const unsubscribeUrl = essential ? null : `https://example.com/functions/v1/email-unsubscribe?t=${typeKey}-${index}`
  const mail = memberNoticeMail({ typeKey, contactEmail: contact, site, unsubscribeUrl })
  return {
    outboxId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    typeKey,
    userId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    refId: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
    address: `member.${index}@example.com`,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    essential: mail.essential,
    unsubscribeUrl,
  }
}

function callsOf(fetchImpl: typeof fetch) {
  const calls: Array<{ url: string; headers: Headers; body: string }> = []
  const wrapped: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    })
    return fetchImpl(input, init)
  }
  return { calls, wrapped }
}

test('master off and a missing key do not call the provider', async () => {
  let called = 0
  const fetchImpl: typeof fetch = async () => {
    called += 1
    return new Response('{}', { status: 200 })
  }
  const off = await deliverMemberNotices({
    notices: [notice('welcome', 1)],
    masterEnabled: false,
    batchSize: 50,
    pauseMs: 1500,
    apiKey: 'test-key',
    fromMailbox: 'news@example.com',
    replyTo: contact,
    fetchImpl,
  })
  assert.equal(off.blocked, 'master_off')
  assert.equal(off.calls, 0)
  assert.equal(off.sent, 0)
  const closed = await deliverMemberNotices({
    notices: [notice('welcome', 1)],
    masterEnabled: true,
    batchSize: 50,
    pauseMs: 1500,
    apiKey: '',
    fromMailbox: 'news@example.com',
    replyTo: contact,
    fetchImpl,
  })
  assert.equal(closed.blocked, 'not_configured')
  assert.equal(closed.calls, 0)
  const noFrom = await deliverMemberNotices({
    notices: [notice('security_signin', 2, true)],
    masterEnabled: true,
    batchSize: 50,
    pauseMs: 1500,
    apiKey: 'test-key',
    fromMailbox: '',
    replyTo: contact,
    fetchImpl,
  })
  assert.equal(noFrom.blocked, 'not_configured')
  assert.equal(called, 0)
})

test('non-essential mail carries per-type unsubscribe headers and essential mail does not', async () => {
  const { calls, wrapped } = callsOf(async () => Response.json({ id: 'msg_1' }))
  const welcome = notice('welcome', 3)
  const security = notice('security_deletion', 4, true)
  const result = await deliverMemberNotices({
    notices: [welcome, security],
    masterEnabled: true,
    batchSize: 50,
    pauseMs: 0,
    apiKey: 'test-key',
    fromMailbox: 'news@example.com',
    replyTo: contact,
    fetchImpl: wrapped,
  })
  assert.equal(result.sent, 2)
  assert.equal(result.calls, 2)
  assert.equal(calls[0].url, MEMBER_NOTICE_PROVIDER_URL)
  const first = JSON.parse(calls[0].body) as { headers: Record<string, string>; from: string; reply_to: string }
  const second = JSON.parse(calls[1].body) as { headers?: Record<string, string> }
  assert.equal(first.from, 'Board Arabia <news@example.com>')
  assert.equal(first.reply_to, contact)
  assert.match(first.headers['List-Unsubscribe'], /email-unsubscribe\?t=welcome-3/)
  assert.match(first.headers['List-Unsubscribe'], new RegExp(`mailto:${contact.replace('.', '\\.')}\\?subject=unsubscribe`))
  assert.equal(first.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
  assert.match(welcome.text, /Turn off Welcome emails/)
  assert.match(welcome.text, /\/dashboard\/privacy/)
  assert.equal(second.headers, undefined)
  assert.match(security.text, /cannot be turned off/)
  assert.equal(calls[0].headers.get('Idempotency-Key'), `${welcome.typeKey}:${welcome.refId}:${welcome.userId}`)
  assert.equal(calls[1].headers.get('Idempotency-Key'), `${security.typeKey}:${security.refId}:${security.userId}`)
})

test('batches pause and a 429 waits before a retry', async () => {
  const pauses: number[] = []
  let hits = 0
  const fetchImpl: typeof fetch = async () => {
    hits += 1
    if (hits === 1) return new Response('slow', { status: 429, headers: { 'retry-after': '2' } })
    return Response.json({ id: `msg_${hits}` })
  }
  const result = await deliverMemberNotices({
    notices: [notice('invite', 5), notice('invite', 6), notice('event_reminder', 7)],
    masterEnabled: true,
    batchSize: 2,
    pauseMs: 1500,
    apiKey: 'test-key',
    fromMailbox: 'news@example.com',
    replyTo: contact,
    fetchImpl,
    sleep: async (ms) => {
      pauses.push(ms)
    },
  })
  assert.equal(result.sent, 3)
  assert.equal(result.failed, 0)
  assert.equal(result.calls, 4)
  assert.deepEqual(pauses, [2000, 1500])
})

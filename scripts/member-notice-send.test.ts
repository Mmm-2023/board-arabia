import assert from 'node:assert/strict'
import test from 'node:test'
import { BULK_BATCH_URL } from '../supabase/functions/_shared/bulk_mail.ts'
import { enqueueMemberNotice } from '../supabase/functions/_shared/member_notice.ts'
import { memberNoticeMail } from '../supabase/functions/_shared/member_notice_copy.ts'
import { deliverMemberNotices, noticeStreamConfig, type NoticeToSend } from '../supabase/functions/_shared/member_notice_send.ts'

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
    fromMailbox: 'letters@mail.boardarabia.com',
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
    fromMailbox: 'letters@mail.boardarabia.com',
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

test('transactional mail has tracking off and no List-Unsubscribe header', async () => {
  const { calls, wrapped } = callsOf(async () => Response.json({ id: 'msg_1' }))
  const welcome = notice('welcome', 3)
  const security = notice('security_deletion', 4, true)
  const result = await deliverMemberNotices({
    notices: [welcome, security],
    masterEnabled: true,
    batchSize: 50,
    pauseMs: 0,
    apiKey: 'test-key',
    fromMailbox: 'letters@mail.boardarabia.com',
    replyTo: contact,
    fetchImpl: wrapped,
  })
  assert.equal(result.sent, 2)
  assert.equal(result.calls, 1)
  assert.equal(calls[0].url, BULK_BATCH_URL)
  const posted = JSON.parse(calls[0].body) as Array<{
    headers?: Record<string, string>
    from: string
    reply_to: string
    open_tracking?: boolean
    click_tracking?: boolean
  }>
  const first = posted[0]
  const second = posted[1]
  assert.equal(first.from, '"Board Arabia" <letters@mail.boardarabia.com>')
  assert.equal(first.reply_to, contact)
  assert.equal(first.headers, undefined)
  assert.equal(JSON.stringify(first).includes('List-Unsubscribe'), false)
  assert.equal(first.open_tracking, false)
  assert.equal(first.click_tracking, false)
  assert.equal(second.open_tracking, false)
  assert.equal(second.click_tracking, false)
  assert.equal(second.headers, undefined)
  assert.match(welcome.text, /Turn off Welcome emails/)
  assert.match(welcome.text, /\/dashboard\/privacy/)
  assert.match(security.text, /cannot be turned off/)
  assert.match(calls[0].headers.get('Idempotency-Key') || '', /^live:/)
})

test('a queue timeout fails open so the existing letter can still go out', async () => {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const previousTimeout = AbortSignal.timeout
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-example'
  const original = globalThis.fetch
  let waitedMs = 0
  AbortSignal.timeout = (ms: number) => {
    waitedMs = ms
    const controller = new AbortController()
    controller.abort()
    return controller.signal
  }
  globalThis.fetch = async (_input, init) => {
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
    throw new Error('the queue call should have been aborted')
  }
  try {
    await enqueueMemberNotice({
      typeKey: 'welcome',
      userId: '11111111-1111-4111-8111-111111111111',
      refId: '22222222-2222-4222-8222-222222222222',
      payload: { user_id: '11111111-1111-4111-8111-111111111111' },
    })
    assert.equal(waitedMs, 3000)
  } finally {
    globalThis.fetch = original
    AbortSignal.timeout = previousTimeout
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
  }
})

test('batches pause and a 429 waits before a retry', async () => {
  const pauses: number[] = []
  let hits = 0
  const fetchImpl: typeof fetch = async () => {
    hits += 1
    if (hits === 1) return new Response('slow', { status: 429, headers: { 'retry-after': '2' } })
    const count = hits === 2 ? 2 : 1
    return Response.json({ data: Array.from({ length: count }, (_, index) => ({ id: `msg_${hits}_${index}` })) })
  }
  const result = await deliverMemberNotices({
    notices: [notice('invite', 5), notice('invite', 6), notice('event_reminder', 7)],
    masterEnabled: true,
    batchSize: 2,
    pauseMs: 1500,
    apiKey: 'test-key',
    fromMailbox: 'letters@mail.boardarabia.com',
    replyTo: contact,
    fetchImpl,
    sleep: async (ms) => {
      pauses.push(ms)
    },
  })
  assert.equal(result.sent, 3)
  assert.equal(result.failed, 0)
  assert.equal(result.calls, 3)
  assert.deepEqual(pauses, [2000, 1500])
})

test('the mail stream does not fall back to the newsletter key', () => {
  const mail = noticeStreamConfig({
    RESEND_API_KEY: 'news-key',
    EMAIL_FROM: 'news@example.com',
    RESEND_API_KEY_MAIL: '',
    EMAIL_FROM_MAIL: '',
  })
  assert.equal(mail.apiKey, '')
  assert.equal(mail.fromMailbox, '')
  const ready = noticeStreamConfig({
    RESEND_API_KEY_MAIL: 'mail-key',
    EMAIL_FROM_MAIL: 'letters@mail.boardarabia.com',
  })
  assert.equal(ready.apiKey, 'mail-key')
  assert.equal(ready.fromMailbox, 'letters@mail.boardarabia.com')
})

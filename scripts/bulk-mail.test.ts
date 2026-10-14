import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { addressHash, batchIdempotencyKey, buildOutbound, BULK_BATCH_URL, deliverBatches, type PreparedSend } from '../supabase/functions/_shared/bulk_mail.ts'
import { FOOTER_CREDIT, renderBulkLetter } from '../supabase/functions/_shared/bulk_mail_copy.ts'
import { handleEmailSend, type SendDeps, type SendGate } from '../supabase/functions/email-send/handle.ts'
import { strayPublicNammco } from './public-nammco.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationName = '20261221120000_newsletter_events.sql'
const campaignId = '11111111-1111-4111-8111-111111111111'
const staffId = '22222222-2222-4222-8222-222222222222'
const releasedHash = 'ab'.repeat(32)

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function gate(overrides: Partial<SendGate> = {}): SendGate {
  return {
    found: true,
    status: 'test_sent',
    kind: 'campaign',
    category: 'news_invitations',
    subject: 'A note for members',
    preheader: 'This week',
    body_text: 'Hello from Board Arabia.',
    body_html: '<p>Hello from Board Arabia.</p>',
    master_enabled: true,
    batch_size: 50,
    batch_pause_ms: 1500,
    issue_status: null,
    issue_mail_ready: false,
    issue_send_enabled: false,
    content_hash: releasedHash,
    test_content_hash: releasedHash,
    test_sent_by: staffId,
    ...overrides,
  }
}

function recipient(index: number) {
  return {
    userId: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
    address: `member.${index}@example.com`,
    unsubscribeToken: `tok-${index}`,
  }
}

function harness(overrides: Partial<SendDeps> = {}) {
  const fetches: { url: string; headers: Record<string, string>; body: string }[] = []
  const sleeps: number[] = []
  const logs: unknown[] = []
  const deps: SendDeps = {
    role: 'master',
    userId: staffId,
    staffAddress: 'staff.one@example.com',
    apiKey: 'test-key',
    fromAddress: 'news@news.boardarabia.test',
    sendingParent: 'boardarabia.test',
    contactEmail: 'contact@example.com',
    siteOrigin: 'https://example.com',
    functionsOrigin: 'https://example.com',
    now: () => 1_700_000_000_000,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    fetchImpl: async (url, init) => {
      fetches.push({ url, headers: init.headers, body: init.body })
      const count = JSON.parse(init.body).length
      return {
        status: 200,
        headers: { get: () => null },
        json: async () => ({ data: Array.from({ length: count }, (_, index) => ({ id: `msg_${fetches.length}_${index}` })) }),
      }
    },
    loadGate: async () => gate(),
    loadRecipients: async () => [recipient(1)],
    isSuppressed: async () => false,
    logSend: async (row) => {
      logs.push(row)
      return { ok: true, id: `send-${logs.length}`, status: row.status, send: row.sendId ? false : true }
    },
    setProgress: async () => true,
    ...overrides,
  }
  return { deps, fetches, sleeps, logs }
}

test('live send is refused while the master switch is off', async () => {
  const { deps, fetches } = harness({
    loadGate: async () => gate({ master_enabled: false }),
  })
  const result = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, deps)
  assert.equal(result.status, 409)
  assert.equal(result.body.error, 'master_off')
  assert.equal(fetches.length, 0)
})

test('a missing provider key fails closed', async () => {
  const { deps, fetches } = harness({ apiKey: '   ' })
  const result = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, deps)
  assert.equal(result.status, 503)
  assert.equal(result.body.error, 'not_configured')
  assert.equal(fetches.length, 0)
})

test('a test send goes to the caller address only and ignores the master switch', async () => {
  let listed = false
  const { deps, fetches, logs } = harness({
    role: 'staff',
    loadGate: async () => gate({ master_enabled: false }),
    loadRecipients: async () => {
      listed = true
      return [recipient(1), recipient(2)]
    },
  })
  const result = await handleEmailSend({ campaign_id: campaignId, mode: 'test' }, deps)
  assert.equal(result.status, 200)
  assert.equal(result.body.sent, 1)
  assert.equal(listed, false)
  assert.equal(fetches.length, 1)
  const payload = JSON.parse(fetches[0].body) as { to: string[]; subject: string }[]
  assert.equal(payload.length, 1)
  assert.deepEqual(payload[0].to, ['staff.one@example.com'])
  assert.equal(payload[0].subject.startsWith('Test:'), true)
  assert.equal(logs.some((row) => (row as { isTest?: boolean }).isTest === true), true)
  assert.equal(logs.some((row) => (row as { isTest?: boolean }).isTest === false), false)
})

test('a suppressed recipient is skipped at send time', async () => {
  const blocked = await addressHash('member.2@example.com')
  const { deps, fetches, logs } = harness({
    loadRecipients: async () => [recipient(1), recipient(2)],
  })
  deps.isSuppressed = async (hash) => hash === blocked
  const result = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, deps)
  assert.equal(result.status, 200)
  assert.equal(result.body.sent, 1)
  assert.equal(result.body.skipped, 1)
  const payload = JSON.parse(fetches[0].body) as { to: string[] }[]
  assert.deepEqual(payload.map((item) => item.to[0]), ['member.1@example.com'])
  assert.equal(logs.some((row) => (row as { skipReason?: string }).skipReason === 'suppressed'), true)
})

test('headers are present and the batch key, size and pause are honoured', async () => {
  const { deps, fetches, sleeps } = harness({
    loadGate: async () => gate({ batch_size: 2, batch_pause_ms: 40 }),
    loadRecipients: async () => [1, 2, 3, 4, 5].map(recipient),
  })
  const result = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, deps)
  assert.equal(result.body.sent, 5)
  assert.equal(fetches.length, 3)
  assert.deepEqual(fetches.map((call) => JSON.parse(call.body).length), [2, 2, 1])
  assert.deepEqual(sleeps, [40, 40])
  assert.deepEqual(
    fetches.map((call) => call.headers['Idempotency-Key']),
    await Promise.all([
      batchIdempotencyKey('live', ['send-1', 'send-2']),
      batchIdempotencyKey('live', ['send-3', 'send-4']),
      batchIdempotencyKey('live', ['send-5']),
    ]),
  )
  assert.equal(fetches.every((call) => call.url === BULK_BATCH_URL), true)
  assert.equal(fetches.every((call) => call.headers.Authorization === 'Bearer test-key'), true)
  const first = JSON.parse(fetches[0].body)[0]
  assert.equal(first.from, '"Board Arabia" <news@news.boardarabia.test>')
  assert.equal(first.reply_to, 'contact@example.com')
  assert.equal(first.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
  assert.match(
    first.headers['List-Unsubscribe'],
    /^<https:\/\/example\.com\/functions\/v1\/email-unsubscribe\?t=tok-1>$/,
  )
  assert.match(first.text, /Unsubscribe: https:\/\/example\.com\/email\/unsubscribe\?t=tok-1/)
  assert.match(first.text, /Manage email preferences: https:\/\/example\.com\/dashboard\/privacy/)
  assert.match(first.html, /href="https:\/\/example\.com\/email\/unsubscribe\?t=tok-1"/)
})

test('a 429 waits for the rate-limit header and retries the same batch', async () => {
  const prepared: PreparedSend[] = [{
    sendId: 'send-1',
    userId: '33333333-3333-4333-8333-000000000001',
    hash: 'ab',
    message: buildOutbound({
      fromMailbox: 'news@news.boardarabia.test',
      contactEmail: 'contact@example.com',
      to: 'member.1@example.com',
      subject: 'Hello',
      preheader: '',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      unsubscribeUrl: 'https://example.com/email/unsubscribe?t=tok',
      preferencesUrl: 'https://example.com/dashboard/privacy',
      oneClickUrl: 'https://example.com/functions/v1/email-unsubscribe?t=tok',
      test: false,
    }),
  }]
  const sleeps: number[] = []
  let calls = 0
  const keys: string[] = []
  const results = await deliverBatches({
    campaignId,
    mode: 'live',
    prepared,
    batchSize: 50,
    pauseMs: 1500,
    apiKey: 'test-key',
    sendingParent: 'boardarabia.test',
    now: () => 1_700_000_000_000,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    fetchImpl: async (_url, init) => {
      calls += 1
      keys.push(init.headers['Idempotency-Key'])
      if (calls === 1) {
        return { status: 429, headers: { get: (name) => (name === 'retry-after' ? '2' : null) }, json: async () => ({}) }
      }
      return { status: 200, headers: { get: () => null }, json: async () => ({ data: [{ id: 'msg_ok' }] }) }
    },
  })
  assert.equal(calls, 2)
  assert.deepEqual(sleeps, [2000])
  const expectedKey = await batchIdempotencyKey('live', ['send-1'])
  assert.deepEqual(keys, [expectedKey, expectedKey])
  assert.equal(results[0].ok, true)
  assert.equal(results[0].rows[0].providerId, 'msg_ok')
})

function onePrepared(sendId: string): PreparedSend {
  return {
    sendId,
    userId: '33333333-3333-4333-8333-000000000001',
    hash: 'ab',
    message: buildOutbound({
      fromMailbox: 'news@news.boardarabia.test',
      contactEmail: 'contact@example.com',
      to: 'member.1@example.com',
      subject: 'Hello',
      preheader: '',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      unsubscribeUrl: 'https://example.com/email/unsubscribe?t=tok',
      preferencesUrl: 'https://example.com/dashboard/privacy',
      oneClickUrl: 'https://example.com/functions/v1/email-unsubscribe?t=tok',
      test: false,
    }),
  }
}

async function postedKeys(mode: 'test' | 'live', rows: PreparedSend[]): Promise<string[]> {
  const seen: string[] = []
  await deliverBatches({
    campaignId,
    mode,
    prepared: rows,
    batchSize: 2,
    pauseMs: 0,
    apiKey: 'test-key',
    sendingParent: 'boardarabia.test',
    now: () => 0,
    sleep: async () => {},
    fetchImpl: async (_url, init) => {
      seen.push(init.headers['Idempotency-Key'])
      const count = JSON.parse(init.body).length
      return {
        status: 200,
        headers: { get: () => null },
        json: async () => ({ data: Array.from({ length: count }, () => ({ id: 'msg' })) }),
      }
    },
  })
  return seen
}

test('a test send and a later live send do not share an idempotency key, and a resume does', async () => {
  const rows = [onePrepared('send-a'), onePrepared('send-b'), onePrepared('send-c')]
  const live = await postedKeys('live', rows)
  const testRun = await postedKeys('test', rows)
  const resume = await postedKeys('live', [onePrepared('send-c')])
  const retry = await postedKeys('live', [onePrepared('send-c')])
  assert.equal(live.length, 2)
  assert.equal(testRun.length, 2)
  assert.notEqual(testRun[0], live[0])
  assert.equal(testRun[0].startsWith('test:'), true)
  assert.equal(live[0].startsWith('live:'), true)
  assert.equal(resume[0], live[1])
  assert.equal(retry[0], resume[0])
  assert.notEqual(resume[0], live[0])
})

test('live send is refused until the owner has tested this version', async () => {
  const open = gate({
    status: 'approved',
    content_hash: releasedHash,
    test_content_hash: null,
    test_sent_by: null,
  })
  const untouched = harness({ loadGate: async () => open })
  const noTest = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, untouched.deps)
  assert.equal(noTest.status, 409)
  assert.equal(noTest.body.error, 'not_tested')
  assert.equal(untouched.fetches.length, 0)

  let stamped = 0
  const admin = harness({
    role: 'staff',
    loadGate: async () => open,
    markTest: async () => {
      stamped += 1
      return true
    },
  })
  const adminTest = await handleEmailSend({ campaign_id: campaignId, mode: 'test' }, admin.deps)
  assert.equal(adminTest.status, 200)
  assert.equal(stamped, 0)
  admin.deps.role = 'master'
  const afterAdmin = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, admin.deps)
  assert.equal(afterAdmin.status, 409)
  assert.equal(afterAdmin.body.error, 'not_tested')

  const otherOwner = gate({
    status: 'test_sent',
    content_hash: releasedHash,
    test_content_hash: releasedHash,
    test_sent_by: '99999999-9999-4999-8999-999999999999',
  })
  const wrongOwner = harness({ loadGate: async () => otherOwner })
  const wrong = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, wrongOwner.deps)
  assert.equal(wrong.status, 409)
  assert.equal(wrong.body.error, 'not_tested')
  assert.equal(wrongOwner.fetches.length, 0)

  const edited = gate({
    status: 'approved',
    content_hash: 'cd'.repeat(32),
    test_content_hash: null,
    test_sent_by: null,
  })
  const afterEdit = harness({ loadGate: async () => edited })
  const editedLive = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, afterEdit.deps)
  assert.equal(editedLive.status, 409)
  assert.equal(editedLive.body.error, 'not_tested')
  assert.equal(afterEdit.fetches.length, 0)

  const state = {
    current: gate({
      status: 'approved',
      content_hash: releasedHash,
      test_content_hash: null,
      test_sent_by: null,
    }),
  }
  const owner = harness({
    role: 'master',
    loadGate: async () => state.current,
    markTest: async () => {
      state.current = {
        ...state.current,
        status: 'test_sent',
        test_content_hash: releasedHash,
        test_sent_by: staffId,
      }
      return true
    },
  })
  const ownerTest = await handleEmailSend({ campaign_id: campaignId, mode: 'test' }, owner.deps)
  assert.equal(ownerTest.status, 200)
  assert.equal(state.current.status, 'test_sent')
  const released = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, owner.deps)
  assert.equal(released.status, 200)
  assert.equal(released.body.sent, 1)
})

test('letter copy stays plain', () => {
  const letter = renderBulkLetter({
    subject: 'A note for members',
    preheader: 'This week',
    bodyText: 'Hello from Board Arabia.',
    bodyHtml: '<p>Hello from Board Arabia.</p>',
    unsubscribeUrl: 'https://example.com/email/unsubscribe?t=tok',
    preferencesUrl: 'https://example.com/dashboard/privacy',
    test: true,
  })
  const combined = `${letter.subject}\n${letter.text}\n${letter.html}`
  assert.equal(letter.subject.startsWith('Test:'), true)
  assert.equal(combined.includes('\u2014') || combined.includes('\u2013'), false)
  assert.equal(/\bsponsor\b/i.test(combined), false)
  assert.equal(/(?:\$|£|€)\s?\d|\b\d+(?:\.\d+)?\s?(?:usd|sar|aed|gbp)\b/i.test(combined), false)
  assert.equal(/\b(resend|gmail|google|svix|supabase|sendgrid|postmark|mailgun)\b/i.test(combined), false)
  assert.equal(strayPublicNammco(combined), false)
  assert.match(combined, new RegExp(FOOTER_CREDIT))
  const copy = read('supabase/functions/_shared/bulk_mail_copy.ts')
  assert.equal(copy.includes('\u2014') || copy.includes('\u2013'), false)
  assert.equal(/\b(resend|gmail|google|svix)\b/i.test(copy), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(copy), false)
})

test('the send migration is named, forced, and does not assume it is newest', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261220120000_email_core.sql'))
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(sql.includes('\u2014') || sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/pg_cron|cron\.schedule|pg_net|net\.http/i.test(sql), false)
  assert.match(sql, /alter table public\.newsletter_events enable row level security/)
  assert.match(sql, /alter table public\.newsletter_events force row level security/)
  assert.match(sql, /revoke all on table public\.newsletter_events from public/)
  assert.match(sql, /revoke all on table public\.newsletter_events from anon, authenticated, service_role/)
  assert.match(sql, /create index if not exists email_preferences_category_idx/)
  assert.match(sql, /create index if not exists email_consent_log_category_idx/)
  assert.match(sql, /create index if not exists email_campaigns_category_idx/)
  assert.match(sql, /create index if not exists email_sends_user_idx/)
  assert.match(sql, /create index if not exists email_sends_campaign_idx/)
  assert.match(sql, /'delivered'/)
  assert.match(sql, /'opened'/)
  assert.match(sql, /'clicked'/)
  assert.match(sql, /p_url text default null/)
  assert.match(sql, /p_occurred_at timestamptz default null/)
  assert.match(sql, /set search_path = ''/)
  const grants = sql.replace(/--.*$/gm, '').split(';').filter((statement) => /^\s*grant\b/i.test(statement))
  assert.equal(grants.some((statement) => /\bto\s+anon\b/i.test(statement)), false)
  const authenticatedGrants = grants.filter((statement) => /\bto\s+authenticated\b/i.test(statement))
  assert.equal(authenticatedGrants.length, 1)
  assert.match(authenticatedGrants[0], /staff_upsert_campaign/)
  const chunks = sql.split(/create or replace function /i).slice(1)
  assert.ok(chunks.length >= 8)
  for (const chunk of chunks) {
    const header = chunk.slice(0, chunk.search(/as\s+\$/i))
    assert.match(header, /security definer/i)
    assert.match(header, /set search_path = ''/)
  }
})

test('the newsletter migration does not create or alter public.email_events', () => {
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(/\bemail_events\b/i.test(sql), false)
  assert.equal(/create\s+table\s+(if\s+not\s+exists\s+)?public\.email_events\b/i.test(sql), false)
  assert.equal(/alter\s+table\s+(if\s+exists\s+)?public\.email_events\b/i.test(sql), false)
  assert.equal(/drop\s+table\s+(if\s+exists\s+)?public\.email_events\b/i.test(sql), false)
})

test('no workflow or SQL invokes the sender, and no provider key is in the new files', () => {
  const invoke = /functions\/v1\/email-(send|webhook|unsubscribe)/i
  const workflows = readdirSync(path.join(root, '.github/workflows')).filter((name) => name.endsWith('.yml'))
  for (const name of workflows) {
    assert.equal(invoke.test(read(`.github/workflows/${name}`)), false, name)
    assert.equal(/email-send|email-webhook|email-unsubscribe/.test(read(`.github/workflows/${name}`)), false, name)
  }
  const migrations = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'))
  for (const name of migrations) {
    assert.equal(invoke.test(read(`supabase/migrations/${name}`)), false, name)
  }
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(/pg_cron|cron\.schedule|pg_net|net\.http/i.test(sql), false)
  const files = [
    'supabase/functions/_shared/bulk_mail.ts',
    'supabase/functions/_shared/bulk_mail_copy.ts',
    'supabase/functions/email-send/handle.ts',
    'supabase/functions/email-send/index.ts',
    'supabase/functions/email-webhook/handle.ts',
    'supabase/functions/email-webhook/verify.ts',
    'supabase/functions/email-webhook/index.ts',
    'supabase/functions/email-unsubscribe/handle.ts',
    'supabase/functions/email-unsubscribe/index.ts',
    `supabase/migrations/${migrationName}`,
    'supabase/config.toml',
  ]
  const secret = /\bre_[A-Za-z0-9]{8,}\b|whsec_[A-Za-z0-9+/]{8,}/
  for (const file of files) {
    const text = read(file)
    assert.equal(secret.test(text), false, file)
    assert.equal(text.includes('\u2014') || text.includes('\u2013'), false, file)
  }
  const config = read('supabase/config.toml')
  assert.match(config, /\[functions\.email-send\]\s+verify_jwt = true/)
  assert.match(config, /\[functions\.email-webhook\]\s+verify_jwt = false/)
  assert.match(config, /\[functions\.email-unsubscribe\]\s+verify_jwt = false/)
  assert.equal(/schedule:|cron:/i.test(config.slice(config.indexOf('[functions.email-send]'))), false)
})

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import {
  buildOutbound,
  deliverBatches,
  pauseDecision,
  resolveMailStream,
  sendingFromAllowed,
  type PreparedSend,
} from '../supabase/functions/_shared/bulk_mail.ts'
import { handleEmailSend, type SendDeps, type SendGate } from '../supabase/functions/email-send/handle.ts'
import { resolveChromePath } from './chrome-path.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationName = '20270101120000_email_deliverability.sql'
const newsFrom = 'news@news.boardarabia.com'
const mailFrom = 'letters@mail.boardarabia.com'
const campaignId = '11111111-1111-4111-8111-111111111111'
const staffId = '22222222-2222-4222-8222-222222222222'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function gate(): SendGate {
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
    batch_size: 1,
    batch_pause_ms: 0,
    issue_status: null,
    issue_mail_ready: false,
    issue_send_enabled: false,
    content_hash: 'ab'.repeat(32),
    test_content_hash: 'ab'.repeat(32),
    test_sent_by: staffId,
  }
}

function prepared(sendId: string, from = newsFrom, streamHeaders = true): PreparedSend {
  const message = buildOutbound({
    fromMailbox: from,
    contactEmail: 'contact@example.com',
    to: 'member.1@example.com',
    subject: 'Hello',
    preheader: '',
    bodyText: 'Hello',
    bodyHtml: '<p>Hello</p>',
    unsubscribeUrl: 'https://example.com/email/unsubscribe?t=tok',
    preferencesUrl: 'https://example.com/dashboard/privacy',
    oneClickUrl: 'https://example.com/functions/v1/email-unsubscribe?t=tok',
    unsubMailto: streamHeaders ? '' : undefined,
    test: false,
  })
  return {
    sendId,
    userId: '33333333-3333-4333-8333-000000000001',
    hash: 'ab',
    message,
  }
}

test('the From guard allows only a subdomain of the sending parent', () => {
  assert.equal(sendingFromAllowed(newsFrom), true)
  assert.equal(sendingFromAllowed(mailFrom), true)
  assert.equal(sendingFromAllowed('news@boardarabia.com'), false)
  assert.equal(sendingFromAllowed('news@example.com'), false)
  assert.equal(sendingFromAllowed('news@notboardarabia.com'), false)
  assert.equal(sendingFromAllowed('news@boardarabia.com.evil.com'), false)
  const account = read('supabase/functions/_shared/mail.ts')
  assert.equal(account.includes('bulk_mail'), false)
  assert.equal(account.includes('sendingFromAllowed'), false)
})

test('news and mail streams come from config and fail closed', () => {
  const news = resolveMailStream('news', {
    RESEND_API_KEY_NEWS: 'news-key',
    EMAIL_FROM_NEWS: newsFrom,
    RESEND_API_KEY: 'old-key',
    EMAIL_FROM: 'old@news.boardarabia.com',
  })
  assert.equal(news.apiKey, 'news-key')
  assert.equal(news.fromMailbox, newsFrom)
  const fallback = resolveMailStream('news', {
    RESEND_API_KEY: 'old-key',
    EMAIL_FROM: 'old@news.boardarabia.com',
  })
  assert.equal(fallback.apiKey, 'old-key')
  assert.equal(fallback.fromMailbox, 'old@news.boardarabia.com')
  const root = resolveMailStream('news', { EMAIL_FROM: 'news@boardarabia.com', RESEND_API_KEY: 'old-key' })
  assert.equal(root.fromMailbox, '')
  const mail = resolveMailStream('mail', {
    RESEND_API_KEY: 'news-key',
    EMAIL_FROM: newsFrom,
    RESEND_API_KEY_MAIL: '',
    EMAIL_FROM_MAIL: '',
  })
  assert.equal(mail.apiKey, '')
  assert.equal(mail.fromMailbox, '')
  const ready = resolveMailStream('mail', {
    RESEND_API_KEY_MAIL: 'mail-key',
    EMAIL_FROM_MAIL: mailFrom,
  })
  assert.equal(ready.apiKey, 'mail-key')
  assert.equal(ready.fromMailbox, mailFrom)
  assert.equal(resolveMailStream('mail', { EMAIL_FROM_MAIL: 'letters@example.com', RESEND_API_KEY_MAIL: 'mail-key' }).fromMailbox, '')
})

test('pause thresholds are 0.1 percent complaints or 4 percent bounces after 100 delivered', () => {
  assert.deepEqual(pauseDecision({ delivered: 99, complaints: 99, bounces: 99 }), { pause: false, reason: '' })
  assert.deepEqual(pauseDecision({ delivered: 100, complaints: 0, bounces: 3 }), { pause: false, reason: '' })
  assert.deepEqual(pauseDecision({ delivered: 100, complaints: 1, bounces: 0 }), { pause: true, reason: 'complaint_rate' })
  assert.deepEqual(pauseDecision({ delivered: 100, complaints: 0, bounces: 4 }), { pause: true, reason: 'bounce_rate' })
  assert.deepEqual(pauseDecision({ delivered: 1000, complaints: 1, bounces: 0 }), { pause: true, reason: 'complaint_rate' })
  assert.deepEqual(pauseDecision({ delivered: 1000, complaints: 0, bounces: 39 }), { pause: false, reason: '' })
  assert.deepEqual(pauseDecision({ delivered: 1000, complaints: 0, bounces: 40 }), { pause: true, reason: 'bounce_rate' })
  assert.deepEqual(pauseDecision({ delivered: 100, complaints: 1, bounces: 4 }), { pause: true, reason: 'complaint_rate' })
})

test('newsletter headers stay RFC 8058 and transactional mail drops them', async () => {
  const withMailto = buildOutbound({
    fromMailbox: newsFrom,
    contactEmail: 'contact@example.com',
    to: 'member.1@example.com',
    subject: 'Hello',
    preheader: '',
    bodyText: 'Hello',
    bodyHtml: '<p>Hello</p>',
    unsubscribeUrl: 'https://example.com/email/unsubscribe?t=tok',
    preferencesUrl: 'https://example.com/dashboard/privacy',
    oneClickUrl: 'https://example.com/functions/v1/email-unsubscribe?t=tok',
    unsubMailto: 'unsubscribe@example.com',
    test: false,
  })
  assert.equal(
    withMailto.headers?.['List-Unsubscribe'],
    '<https://example.com/functions/v1/email-unsubscribe?t=tok>, <mailto:unsubscribe@example.com>',
  )
  assert.equal(withMailto.headers?.['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
  assert.match(withMailto.text, /Unsubscribe: https:\/\/example.com\/email\/unsubscribe\?t=tok/)
  const plain = prepared('send-plain').message
  assert.equal(plain.headers?.['List-Unsubscribe'], '<https://example.com/functions/v1/email-unsubscribe?t=tok>')
  assert.equal(plain.open_tracking, undefined)

  const bodies: string[] = []
  await deliverBatches({
    campaignId,
    mode: 'live',
    stream: 'mail',
    prepared: [prepared('send-mail', mailFrom)],
    batchSize: 1,
    pauseMs: 0,
    apiKey: 'test-key',
    now: () => 0,
    sleep: async () => undefined,
    fetchImpl: async (_url, init) => {
      bodies.push(init.body)
      return { status: 200, headers: { get: () => null }, json: async () => ({ data: [{ id: 'msg_1' }] }) }
    },
  })
  const posted = JSON.parse(bodies[0])[0]
  assert.equal(posted.open_tracking, false)
  assert.equal(posted.click_tracking, false)
  assert.equal(Object.hasOwn(posted, 'headers'), false)
  assert.equal(JSON.stringify(posted).includes('List-Unsubscribe'), false)

  const newsBodies: string[] = []
  await deliverBatches({
    campaignId,
    mode: 'live',
    stream: 'news',
    prepared: [prepared('send-news')],
    batchSize: 1,
    pauseMs: 0,
    apiKey: 'test-key',
    now: () => 0,
    sleep: async () => undefined,
    fetchImpl: async (_url, init) => {
      newsBodies.push(init.body)
      return { status: 200, headers: { get: () => null }, json: async () => ({ data: [{ id: 'msg_1' }] }) }
    },
  })
  const newsPosted = JSON.parse(newsBodies[0])[0]
  assert.equal(Object.hasOwn(newsPosted, 'open_tracking'), false)
  assert.equal(Object.hasOwn(newsPosted, 'click_tracking'), false)
  assert.match(newsPosted.headers['List-Unsubscribe'], /^<https:\/\/example\.com\/functions\/v1\/email-unsubscribe\?t=tok>$/)
})

test('Reply-To is required and may be the root inbox', async () => {
  const { deps, fetches } = (() => {
    const calls: string[] = []
    return {
      fetches: calls,
      deps: {
        role: 'master' as const,
        userId: staffId,
        staffAddress: 'staff.one@example.com',
        apiKey: 'test-key',
        fromAddress: newsFrom,
        contactEmail: '',
        siteOrigin: 'https://example.com',
        functionsOrigin: 'https://example.com',
        now: () => 0,
        sleep: async () => undefined,
        fetchImpl: async (_url: string, init: { body: string }) => {
          calls.push(init.body)
          return { status: 200, headers: { get: () => null }, json: async () => ({ data: [{ id: 'msg' }] }) }
        },
        loadGate: async () => gate(),
        loadRecipients: async () => [
          { userId: '33333333-3333-4333-8333-000000000001', address: 'member.1@example.com', unsubscribeToken: 'tok-1' },
        ],
        isSuppressed: async () => false,
        logSend: async (row: { status: string }) => ({ ok: true, id: 'send-1', status: row.status, send: true }),
        setProgress: async () => true,
      },
    }
  })()
  const missing = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, deps)
  assert.equal(missing.status, 503)
  assert.equal(fetches.length, 0)
  const sent = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, {
    ...deps,
    contactEmail: 'hello@example.com',
  })
  assert.equal(sent.status, 200)
  assert.equal(JSON.parse(fetches[0])[0].reply_to, 'hello@example.com')
  const bare = prepared('send-bare')
  bare.message.reply_to = ''
  let called = 0
  const refused = await deliverBatches({
    campaignId,
    mode: 'live',
    prepared: [bare],
    batchSize: 1,
    pauseMs: 0,
    apiKey: 'test-key',
    now: () => 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      called += 1
      return { status: 200, headers: { get: () => null }, json: async () => ({ data: [{ id: 'msg' }] }) }
    },
  })
  assert.equal(called, 0)
  assert.equal(refused[0].status, 503)
  assert.match(read('supabase/functions/email-send/index.ts'), /EMAIL_REPLY_TO/)
  assert.match(read('supabase/functions/member-notice-send/index.ts'), /EMAIL_REPLY_TO/)
  assert.equal(read('supabase/functions/_shared/bulk_mail.ts').includes('hello@'), false)
  assert.equal(read('supabase/functions/email-send/index.ts').includes('hello@'), false)
  assert.match(read('supabase/functions/_shared/mail.ts'), /GMAIL_FROM/)
  assert.match(read('supabase/functions/_shared/mail.ts'), /Reply-To/)
})

test('a root From is refused before the provider is called', async () => {
  let called = 0
  const results = await deliverBatches({
    campaignId,
    mode: 'live',
    prepared: [prepared('send-root', 'news@boardarabia.com')],
    batchSize: 1,
    pauseMs: 0,
    apiKey: 'test-key',
    now: () => 0,
    sleep: async () => undefined,
    fetchImpl: async () => {
      called += 1
      return { status: 200, headers: { get: () => null }, json: async () => ({ data: [{ id: 'msg' }] }) }
    },
  })
  assert.equal(called, 0)
  assert.equal(results[0].status, 503)
  assert.equal(results[0].ok, false)
})

test('a live send fails closed when the news stream is missing and skips a later suppressed batch', async () => {
  const fetches: string[] = []
  const deps: SendDeps = {
    role: 'master',
    userId: staffId,
    staffAddress: 'staff.one@example.com',
    apiKey: 'test-key',
    fromAddress: newsFrom,
    contactEmail: 'contact@example.com',
    siteOrigin: 'https://example.com',
    functionsOrigin: 'https://example.com',
    now: () => 0,
    sleep: async () => undefined,
    fetchImpl: async (_url, init) => {
      fetches.push(init.body)
      return { status: 200, headers: { get: () => null }, json: async () => ({ data: [{ id: 'msg' }] }) }
    },
    loadGate: async () => gate(),
    loadRecipients: async () => [
      { userId: '33333333-3333-4333-8333-000000000001', address: 'member.1@example.com', unsubscribeToken: 'tok-1' },
      { userId: '33333333-3333-4333-8333-000000000002', address: 'member.2@example.com', unsubscribeToken: 'tok-2' },
    ],
    isSuppressed: async () => fetches.length > 0,
    logSend: async (row) => ({ ok: true, id: `send-${fetches.length + 1}-${row.status}`, status: row.status, send: true }),
    setProgress: async () => true,
    streamEnv: { RESEND_API_KEY: '', EMAIL_FROM: '', RESEND_API_KEY_NEWS: '', EMAIL_FROM_NEWS: '' },
  }
  const missing = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, deps)
  assert.equal(missing.status, 503)
  assert.equal(fetches.length, 0)

  const rootFrom = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, {
    ...deps,
    streamEnv: undefined,
    fromAddress: 'news@boardarabia.com',
  })
  assert.equal(rootFrom.status, 503)

  const sent = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, {
    ...deps,
    streamEnv: { RESEND_API_KEY_NEWS: 'news-key', EMAIL_FROM_NEWS: newsFrom },
    apiKey: '',
    fromAddress: 'news@example.com',
  })
  assert.equal(sent.status, 200)
  assert.equal(sent.body.sent, 1)
  assert.equal(sent.body.skipped, 1)
  assert.equal(fetches.length, 1)
  assert.equal(JSON.parse(fetches[0])[0].from, `"Board Arabia" <${newsFrom}>`)
})

test('auto-pause stops the next batch at the complaint threshold', async () => {
  let calls = 0
  const reasons: string[] = []
  const results = await deliverBatches({
    campaignId,
    mode: 'live',
    prepared: [prepared('send-1'), prepared('send-2')],
    batchSize: 1,
    pauseMs: 25,
    apiKey: 'test-key',
    now: () => 0,
    sleep: async () => undefined,
    rateCheck: async () => {
      calls += 1
      if (calls === 1) return { delivered: 100, complaints: 0, bounces: 0 }
      return { delivered: 100, complaints: 1, bounces: 0 }
    },
    onPause: async (reason) => {
      reasons.push(reason)
    },
    fetchImpl: async (_url, init) => {
      const count = JSON.parse(init.body).length
      return { status: 200, headers: { get: () => null }, json: async () => ({ data: Array.from({ length: count }, () => ({ id: 'msg' })) }) }
    },
  })
  assert.equal(results.length, 1)
  assert.deepEqual(reasons, ['complaint_rate'])
  assert.equal(calls >= 2, true)
})

test('the deliverability migration stays off, has no cron, and does not require a second factor', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'))
  assert.equal(names.filter((name) => name.startsWith('20270101120000')).length, 1)
  assert.equal(names.filter((name) => name.startsWith('20261231120000')).length, 1)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261231120000_newsletter_analytics.sql'))
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(sql.includes("'aal2'"), false)
  assert.equal(/pg_cron|cron\.schedule|pg_net|net\.http/i.test(sql), false)
  assert.equal(/master_enabled\s*=\s*true/.test(sql), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.match(sql, /alter table public\.email_pause_log enable row level security/)
  assert.match(sql, /alter table public\.email_pause_log force row level security/)
  assert.match(sql, /revoke all on table public\.email_pause_log from anon, authenticated, service_role/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /grant execute on function public\.staff_resume_email_pause\(\) to authenticated/)
  assert.equal(/grant execute on function public\.staff_resume_email_pause\(\) to anon/.test(sql), false)
  assert.match(sql, /private\.email_pause_reason/)
  assert.equal(sql.includes('RESEND_API_KEY_NEWS_TRACKED'), false)
  assert.equal(sql.includes('EMAIL_FROM_NEWS_TRACKED'), false)
  const streams = read('supabase/functions/email-streams/index.ts')
  assert.equal(streams.includes('RESEND_API_KEY_NEWS_TRACKED'), false)
  assert.match(read('supabase/config.toml'), /\[functions\.email-streams\]\s+verify_jwt = true/)
  assert.match(read('supabase/functions/email-send/index.ts'), /RESEND_API_KEY_NEWS_TRACKED/)
})

test('the admin email screen shows the pause banner and read-only stream addresses', { timeout: 120000 }, async (t) => {
  const executablePath = resolveChromePath()
    || (existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : null)
    || (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : null)
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
  const shotDir = path.join('/opt/cursor/artifacts', 'em-1f-deliverability')
  mkdirSync(shotDir, { recursive: true })
  const vite = await createServer({
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      const page = await browser.newPage({ viewport: { width, height } })
      await page.goto(`http://127.0.0.1:${port}/scripts/smoke/email-campaign.html?view=paused`, { waitUntil: 'networkidle' })
      await page.locator('[data-pause="complaint_rate"]').waitFor({ state: 'visible' })
      const text = await page.locator('[data-pause="complaint_rate"]').innerText()
      assert.match(text, /complaints reached 0\.1% of delivered mail/)
      assert.match(text, /Only the owner can resume/)
      assert.equal(await page.getByRole('button', { name: 'Resume' }).isEnabled(), true)
      assert.equal(await page.locator('[data-stream="news"] input').count(), 0)
      assert.equal(await page.locator('[data-stream="mail"] input').count(), 0)
      assert.match(await page.locator('[data-stream="news"]').innerText(), /news@news\.example\.com/)
      assert.match(await page.locator('[data-stream="mail"]').innerText(), /letters@mail\.example\.com/)
      await page.getByRole('button', { name: 'Resume' }).click()
      assert.equal(await page.locator('body').getAttribute('data-resumed'), '1')
      const file = path.join(shotDir, `pause-${width}.png`)
      await page.screenshot({ path: file, fullPage: true })
      assert.equal(existsSync(file), true)
      await page.close()
    }
    const staff = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await staff.goto(`http://127.0.0.1:${port}/scripts/smoke/email-campaign.html?view=paused-staff`, { waitUntil: 'networkidle' })
    await staff.locator('[data-pause="complaint_rate"]').waitFor({ state: 'visible' })
    assert.equal(await staff.getByRole('button', { name: 'Resume' }).count(), 0)
    await staff.close()
    const quiet = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await quiet.goto(`http://127.0.0.1:${port}/scripts/smoke/email-campaign.html?view=release-off`, { waitUntil: 'networkidle' })
    const quietText = await quiet.locator('body').innerText()
    assert.equal(quietText.includes('@'), false)
    assert.match(quietText, /Not configured/)
    await quiet.close()
  } finally {
    await browser.close()
    await vite.close()
  }
})

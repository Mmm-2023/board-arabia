import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { resolveChromePath } from './chrome-path.ts'
import { handleEmailSend, type SendDeps, type SendGate } from '../supabase/functions/email-send/handle.ts'

const root = path.resolve(new URL('..', import.meta.url).pathname)

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function chromePath() {
  return resolveChromePath()
    || (existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : null)
    || (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : null)
}

const migrationName = '20261223120000_email_campaign_ui.sql'

test('campaign migration stays off, names the file, and does not schedule a send', () => {
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/eyJ|sk_live|service_role_key|BEGIN PRIVATE KEY|RESEND_/i.test(sql), false)
  assert.equal(sql.toLowerCase().includes('the desk'), false)
  assert.equal(/\bsponsor\b/i.test(sql), false)
  assert.equal(/pg_cron|cron\.schedule|pg_net|net\.http/i.test(sql), false)
  assert.equal(/master_enabled\s*=\s*true/.test(sql), false)
  assert.equal(/news_invitations_opt_in|apply_form/.test(sql), false)
  assert.match(sql, /function private\.email_plain_html/)
  assert.match(sql, /when p_body_html is null then private\.email_plain_html\(v_body\)/)
  assert.match(sql, /function public\.staff_upsert_campaign/)
  assert.match(sql, /test_sent_by = null/)
  assert.match(sql, /test_sent_at = null/)
  assert.match(sql, /test_content_hash = null/)
  assert.match(sql, /content_hash = v_hash/)
  assert.match(sql, /c\.test_sent_by/)
  assert.match(sql, /c\.content_hash/)
  assert.match(sql, /c\.test_content_hash/)
  assert.match(sql, /auth\.uid\(\)/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /if not private\.is_staff\(\)/)
  assert.match(sql, /private\.is_owner\(\)/)
  assert.match(sql, /public\.newsletter_events/)
  assert.equal(/email_events/.test(sql), false)
  assert.match(sql, /revoke all on function public\.staff_email_screen\(\) from public, anon/)
  assert.match(sql, /grant execute on function public\.staff_email_screen\(\) to authenticated/)
  assert.equal(/grant execute on function public\.staff_email_screen\(\) to anon/.test(sql), false)
})

test('release stays closed until the owner test, the master switch, and approval line up', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  const mod = await vite.ssrLoadModule('/src/lib/emailCampaign.ts')
  const { confirmMatches, releaseReady } = mod
  const open: ReleaseGate = {
    ready: false,
    isOwner: true,
    masterEnabled: false,
    approved: true,
    testSentByOwner: false,
    versionMatches: false,
    eligible: 4,
  }
  assert.equal(releaseReady(open), false)
  assert.equal(releaseReady({ ...open, ready: true }), true)
  assert.equal(confirmMatches('4', 4), true)
  assert.equal(confirmMatches(' 4 ', 4), true)
  assert.equal(confirmMatches('04', 4), false)
  assert.equal(confirmMatches('four', 4), false)
  await vite.close()
})

test('the screen calls email-send by name and the confirm page waits for the click', () => {
  const send = read('src/lib/emailSend.ts')
  const panel = read('src/pages/admin/EmailCampaignPanel.tsx')
  const page = read('src/pages/EmailUnsubscribePage.tsx')
  const app = read('src/App.tsx')
  const digest = read('src/pages/admin/DigestIssuePanel.tsx')
  const privacy = read('src/components/privacy/PrivacyPanelView.tsx')
  assert.match(send, /invoke\('email-send'/)
  assert.match(send, /'test' \| 'live'/)
  assert.match(panel, /requestCampaignSend\(draft\.id, 'test'\)/)
  assert.match(panel, /requestCampaignSend\(draft\.id, 'live'\)/)
  assert.equal(/staff_record_campaign_test/.test(panel), false)
  assert.match(panel, /staff_email_release_gate',\s*\{\s*p_campaign_id:\s*draft\.id\s*\}/)
  assert.equal(/staff_email_release_gate',\s*\{\s*p_id:/.test(panel), false)
  assert.match(panel, /p_body_html:\s*null/)
  assert.equal(/p_body_html:\s*next\.bodyText/.test(panel), false)
  assert.equal(/@example\.com|RESEND_|sk_live/.test(panel + send + page), false)
  assert.equal(page.includes('useEffect'), false)
  const confirmAt = page.indexOf('async function confirm')
  assert.ok(confirmAt > 0)
  assert.equal(/email_unsubscribe/.test(page.slice(0, confirmAt)), false)
  assert.match(page.slice(confirmAt), /email_unsubscribe/)
  assert.match(app, /path="\/email\/unsubscribe"/)
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.match(digest, /to="\/admin\/email#email-campaign"/)
  assert.match(digest, /Email this digest/)
  assert.match(privacy, /News and invitations/)
  assert.match(privacy, /It is not connected yet/)
  assert.match(privacy, /data-email-connected/)
  assert.equal(privacy.includes('\u2014'), false)
  assert.equal(page.includes('\u2014'), false)
  assert.equal(page.toLowerCase().includes('the desk'), false)
  assert.equal(/\b(resend|gmail|google)\b/i.test(page), false)
  const unsub = read('src/pages/EmailUnsubscribeView.tsx')
  const copy = read('src/lib/emailCampaign.ts')
  assert.match(unsub, /You are unsubscribed\. You can turn emails back on in/)
  assert.match(unsub, /href="\/dashboard\/privacy"|to="\/dashboard\/privacy"/)
  assert.match(unsub, /UNSUBSCRIBE_RETRY/)
  assert.match(copy, /You are unsubscribed\. You can turn emails back on in Your privacy\./)
  assert.match(copy, /Could not unsubscribe\. Retry\./)
  const failedAt = page.indexOf('if (failed)')
  const doneAt = page.indexOf('setDone(true)')
  assert.ok(failedAt > 0 && doneAt > failedAt)
  assert.match(page.slice(failedAt, doneAt), /setError\(true\)/)
  assert.match(page.slice(failedAt, doneAt), /return/)
  assert.equal(unsub.includes('supabase'), false)
  assert.equal(unsub.includes('useEffect'), false)
})

test('the release call uses the SQL argument name', () => {
  const sql = read(`supabase/migrations/${migrationName}`)
  const panel = read('src/pages/admin/EmailCampaignPanel.tsx')
  const types = read('src/lib/database.types.ts')
  const signature = sql.match(/function public\.staff_email_release_gate\(([a-z0-9_]+) uuid\)/)
  assert.ok(signature)
  const arg = signature[1]
  assert.equal(arg, 'p_campaign_id')
  assert.match(panel, new RegExp(`staff_email_release_gate', \\{ ${arg}: draft\\.id \\}`))
  const gateTypes = types.slice(types.indexOf('staff_email_release_gate:'))
  assert.match(gateTypes, new RegExp(`Args: \\{ ${arg}: string \\}`))
  assert.equal(new RegExp(`staff_email_release_gate', \\{ p_id:`).test(panel), false)
})

test('an unsubscribe error shows a retry and never the success sentence', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  const viewMod = await vite.ssrLoadModule('/src/pages/EmailUnsubscribeView.tsx')
  const UnsubscribeConfirm = viewMod.UnsubscribeConfirm
  const props = { tokenPresent: true, onConfirm: () => undefined }
  const failed = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(UnsubscribeConfirm, { ...props, done: true, error: true })),
  )
  assert.match(failed, /data-unsubscribe="error"/)
  assert.match(failed, /Could not unsubscribe\. Retry\./)
  assert.match(failed, />Unsubscribe</)
  assert.equal(/You are unsubscribed/.test(failed), false)
  const confirm = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(UnsubscribeConfirm, { ...props, done: false, error: false })),
  )
  assert.match(confirm, /data-unsubscribe="confirm"/)
  assert.match(confirm, />Unsubscribe</)
  assert.equal(/You are unsubscribed/.test(confirm), false)
  await vite.close()
})

test('release control renders closed and open, and the master switch is owner only', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  const viewMod = await vite.ssrLoadModule('/src/pages/admin/EmailCampaignView.tsx')
  const EmailCampaignView = viewMod.EmailCampaignView
  const gateOff = {
    ready: false,
    isOwner: true,
    masterEnabled: false,
    approved: true,
    testSentByOwner: false,
    versionMatches: false,
    eligible: 3,
  }
  const letter = {
    id: 'letter-1',
    kind: 'campaign' as const,
    category: 'news_invitations' as const,
    subject: 'October note',
    preheader: '',
    bodyText: 'Hello members.',
    tiers: ['founding'],
    status: 'approved' as const,
    digestIssueId: null,
    audience: {
      eligible: 3,
      not_opted_in: 1,
      suppressed: 0,
      demo: 0,
      anonymised: 0,
      inactive: 0,
      no_address: 0,
      hidden: 0,
    },
    release: gateOff,
    log: {
      queued: 0,
      skipped: 0,
      sent: 0,
      delivered: 0,
      bounced: 0,
      complained: 0,
      failed: 0,
      test: 0,
      events: [],
    },
  }
  const noop = () => undefined
  const shared = {
    state: 'ready' as const,
    draft: letter,
    digestReady: true,
    onSelect: noop,
    onNew: noop,
    onDigest: noop,
    onDraft: noop,
    onToggleTier: noop,
    onSave: noop,
    onApprove: noop,
    onTest: noop,
    onMaster: noop,
    onOpenConfirm: noop,
    onConfirmText: noop,
    onRelease: noop,
    onRetry: noop,
  }
  const closed = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(EmailCampaignView, {
      ...shared,
      screen: { masterEnabled: false, isOwner: false, campaigns: [{ ...letter, release: { ...gateOff, isOwner: false } }] },
      selected: { ...letter, release: { ...gateOff, isOwner: false } },
    })),
  )
  assert.match(closed, /data-release="disabled"/)
  assert.match(closed, /data-master-control="hidden"/)
  assert.match(closed, /The master switch is off/)
  assert.match(closed, /Only the owner can release/)
  assert.equal(closed.includes('@'), false)
  const owner = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(EmailCampaignView, {
      ...shared,
      screen: { masterEnabled: true, isOwner: true, campaigns: [{
        ...letter,
        status: 'test_sent',
        release: {
          ready: true,
          isOwner: true,
          masterEnabled: true,
          approved: true,
          testSentByOwner: true,
          versionMatches: true,
          eligible: 3,
        },
      }] },
      selected: {
        ...letter,
        status: 'test_sent',
        release: {
          ready: true,
          isOwner: true,
          masterEnabled: true,
          approved: true,
          testSentByOwner: true,
          versionMatches: true,
          eligible: 3,
        },
      },
      draft: { ...letter, status: 'test_sent' },
      confirmOpen: true,
      confirmText: '3',
    })),
  )
  assert.match(owner, /data-release="enabled"/)
  assert.match(owner, /data-master-control="owner"/)
  assert.match(owner, /Type 3 to confirm/)
  assert.match(owner, /Confirm release/)
  assert.match(owner, /Send test to me/)
  assert.equal(owner.includes('@'), false)
  await vite.close()
})

const ownerId = '22222222-2222-4222-8222-222222222222'
const campaignId = '11111111-1111-4111-8111-111111111111'
const sameHash = 'ab'.repeat(32)

function sendGate(overrides: Partial<SendGate> = {}): SendGate {
  return {
    found: true,
    status: 'approved',
    kind: 'campaign',
    category: 'news_invitations',
    subject: 'A note for members',
    preheader: 'This week',
    body_text: 'Hello from Board Arabia.',
    body_html: '<p>Hello from Board Arabia.</p>',
    master_enabled: true,
    batch_size: 50,
    batch_pause_ms: 0,
    issue_status: null,
    issue_mail_ready: false,
    issue_send_enabled: false,
    content_hash: sameHash,
    test_content_hash: null,
    test_sent_by: null,
    ...overrides,
  }
}

function sendHarness(state: { current: SendGate }, role: SendDeps['role'] = 'master') {
  const fetches: string[] = []
  const deps: SendDeps = {
    role,
    userId: ownerId,
    staffAddress: 'owner.one@example.com',
    apiKey: 'test-key',
    fromAddress: 'news@example.com',
    contactEmail: 'contact@example.com',
    siteOrigin: 'https://example.com',
    functionsOrigin: 'https://example.com',
    now: () => 1_700_000_000_000,
    sleep: async () => undefined,
    fetchImpl: async (_url, init) => {
      fetches.push(init.body)
      const count = JSON.parse(init.body).length
      return {
        status: 200,
        headers: { get: () => null },
        json: async () => ({ data: Array.from({ length: count }, () => ({ id: 'msg_1' })) }),
      }
    },
    loadGate: async () => state.current,
    loadRecipients: async () => [
      {
        userId: '33333333-3333-4333-8333-000000000001',
        address: 'member.1@example.com',
        unsubscribeToken: 'tok-1',
      },
    ],
    isSuppressed: async () => false,
    logSend: async (row) => ({ ok: true, id: `send-${fetches.length + 1}`, status: row.status, send: true }),
    setProgress: async (_id, status) => {
      state.current = { ...state.current, status }
      return true
    },
    markTest: async () => {
      state.current = {
        ...state.current,
        status: 'test_sent',
        test_content_hash: state.current.content_hash,
        test_sent_by: ownerId,
      }
      return true
    },
  }
  return { deps, fetches }
}

test('the email-send handler accepts an owner test and then release, and an edit blocks the live send', async () => {
  const state = { current: sendGate() }
  const owner = sendHarness(state)
  const tested = await handleEmailSend({ campaign_id: campaignId, mode: 'test' }, owner.deps)
  assert.equal(tested.status, 200)
  assert.equal(tested.body.ok, true)
  assert.equal(state.current.status, 'test_sent')
  assert.equal(state.current.test_sent_by, ownerId)
  assert.equal(state.current.test_content_hash, state.current.content_hash)
  const released = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, owner.deps)
  assert.equal(released.status, 200)
  assert.equal(released.body.sent, 1)
  assert.ok(owner.fetches.length > 0)

  const edited = sendHarness({
    current: sendGate({
      status: 'approved',
      content_hash: 'cd'.repeat(32),
      test_content_hash: null,
      test_sent_by: null,
      master_enabled: true,
    }),
  })
  const blocked = await handleEmailSend({ campaign_id: campaignId, mode: 'live' }, edited.deps)
  assert.equal(blocked.status, 409)
  assert.equal(blocked.body.error, 'not_tested')
  assert.equal(edited.fetches.length, 0)
})

test('campaign, preference, and unsubscribe shots at 1440 and 390', { timeout: 180000 }, async (t) => {
  const executablePath = chromePath()
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
  const shotDir = path.join('/opt/cursor/artifacts', 'em-1c-campaign-ui')
  mkdirSync(shotDir, { recursive: true })
  const vite = await createServer({
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const origin = `http://127.0.0.1:${port}`
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const shots: Array<[string, string, number, number]> = [
      ['release-off', 'release-off', 1440, 900],
      ['release-off', 'release-off', 390, 844],
      ['release-on', 'release-on', 1440, 900],
      ['release-on', 'release-on', 390, 844],
      ['preferences', 'preferences', 1440, 900],
      ['preferences', 'preferences', 390, 844],
      ['unsubscribe', 'unsubscribe', 1440, 900],
      ['unsubscribe', 'unsubscribe', 390, 844],
      ['unsubscribe-error', 'unsubscribe-error', 1440, 900],
      ['unsubscribe-error', 'unsubscribe-error', 390, 844],
    ]
    for (const [name, viewName, width, height] of shots) {
      const page = await browser.newPage({ viewport: { width, height } })
      await page.goto(`${origin}/scripts/smoke/email-campaign.html?view=${viewName}`, { waitUntil: 'networkidle' })
      if (viewName === 'release-off') {
        assert.equal(await page.locator('[data-release]').getAttribute('data-release'), 'disabled')
        assert.equal(await page.getByRole('button', { name: 'Release', exact: true }).isDisabled(), true)
        assert.equal(await page.locator('body').innerText().then((text) => text.includes('@')), false)
      }
      if (viewName === 'release-on') {
        assert.equal(await page.locator('[data-release]').getAttribute('data-release'), 'enabled')
        assert.equal(await page.getByRole('button', { name: 'Release', exact: true }).isDisabled(), false)
        assert.equal(await page.getByRole('button', { name: 'Confirm release' }).isDisabled(), false)
        assert.match(await page.locator('[data-release]').innerText(), /12 members/)
      }
      if (viewName === 'preferences') {
        const text = await page.locator('[data-screen="your-privacy"]').innerText()
        assert.match(text, /Weekly email/)
        assert.match(text, /News and invitations/)
        assert.match(text, /not connected yet/)
        assert.equal(await page.locator('[data-news-email]').getAttribute('data-news-email'), 'off')
      }
      if (viewName === 'unsubscribe' || viewName === 'unsubscribe-error') {
        const state = viewName === 'unsubscribe-error' ? 'error' : 'confirm'
        const text = await page.locator('main').innerText()
        assert.equal(await page.locator('[data-unsubscribe]').getAttribute('data-unsubscribe'), state)
        assert.equal(await page.getByRole('button', { name: 'Unsubscribe' }).isDisabled(), false)
        assert.equal(/You are unsubscribed/.test(text), false)
        if (state === 'error') assert.match(text, /Could not unsubscribe\. Retry\./)
        if (state === 'confirm') assert.match(text, /This stops Board Arabia email for this link/)
      }
      const file = path.join(shotDir, `${name}-${width}.png`)
      await page.screenshot({ path: file, fullPage: true })
      assert.equal(existsSync(file), true)
      await page.close()
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})

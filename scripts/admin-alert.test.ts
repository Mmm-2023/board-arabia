import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import { handleMandateIntro } from '../supabase/functions/request-mandate-intro/handle.ts'
import { handleReIntro } from '../supabase/functions/request-re-intro/handle.ts'
import {
  ADMIN_ALERT_TIMEOUT_MS,
  adminAlertSettled,
  deliverAdminAlert,
  formatAdminAlert,
  formatRiyadhStamp,
  missingAdminAlertSecrets,
  notifyAdmin,
  type AdminAlertInput,
} from '../supabase/functions/_shared/notify_admin.ts'

const SECRET_KEYS = [
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_SERVICE_ACCOUNT_JSON',
  'GMAIL_FROM',
  'GMAIL_IMPERSONATE',
  'ADMIN_NOTIFY_EMAIL',
  'PUBLIC_SITE_URL',
]

const PLACEHOLDER_FROM = 'ops@example.com'
const PLACEHOLDER_STAFF = 'staff@example.com'
const originalFetch = globalThis.fetch
const originalWarn = console.warn

const sample: AdminAlertInput = {
  requesterName: 'Example Person',
  requesterKind: 'member',
  requested: 'mandate access',
  item: 'Energy transition, Growth equity',
  approvePath: '/admin#mandate-intro-queue',
  occurredAt: new Date('2026-09-29T14:19:00.000Z'),
}

function clearMailEnv() {
  for (const key of SECRET_KEYS) delete process.env[key]
}

function setRefreshSecrets() {
  clearMailEnv()
  process.env.GMAIL_CLIENT_ID = 'client-example'
  process.env.GMAIL_CLIENT_SECRET = 'secret-example'
  process.env.GMAIL_REFRESH_TOKEN = 'refresh-example'
  process.env.GMAIL_FROM = PLACEHOLDER_FROM
  process.env.ADMIN_NOTIFY_EMAIL = PLACEHOLDER_STAFF
  process.env.PUBLIC_SITE_URL = 'https://boardarabia.com'
}

afterEach(async () => {
  await adminAlertSettled()
  clearMailEnv()
  globalThis.fetch = originalFetch
  console.warn = originalWarn
})

function mandateRequest() {
  return new Request('https://boardarabia.com/functions/v1/request-mandate-intro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: JSON.stringify({ mandate_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
  })
}

function opened(opts?: { prior?: boolean; rpcError?: string; status?: string; item?: string }) {
  return {
    open: async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      rpc: async () => {
        if (opts?.rpcError) return { data: null, error: { message: opts.rpcError } }
        return { data: { status: opts?.status ?? 'pending' }, error: null }
      },
      context: async () => ({
        alreadyQueued: Boolean(opts?.prior),
        requesterName: 'Example Person',
        requesterKind: 'member' as const,
        item: opts?.item ?? 'Energy transition, Growth equity',
      }),
    }),
  }
}

test('Riyadh stamp uses AST, UTC+3', () => {
  assert.equal(formatRiyadhStamp(new Date('2026-09-29T14:19:00.000Z')), '29 Sep 2026, 17:19 AST (UTC+3)')
  assert.equal(ADMIN_ALERT_TIMEOUT_MS <= 2000, true)
})

test('alert letter names the requester, the request, the item, the time, and the admin page', () => {
  clearMailEnv()
  process.env.PUBLIC_SITE_URL = 'https://boardarabia.com'
  const message = formatAdminAlert({
    ...sample,
    requesterName: 'Example Sponsor',
    requesterKind: 'sponsor',
  })
  assert.match(message.text, /Example Sponsor \(sponsor\) requested mandate access\./)
  assert.match(message.text, /Item: Energy transition, Growth equity/)
  assert.match(message.text, /Time: 29 Sep 2026, 17:19 AST \(UTC\+3\)/)
  assert.match(message.text, /Review: https:\/\/boardarabia.com\/admin#mandate-intro-queue/)
  assert.match(message.html, /Open the admin page/)
  assert.equal(message.text.includes('\u2014'), false)
  assert.equal(message.html.includes('<Example'), false)
  const escaped = formatAdminAlert({ ...sample, requesterName: '<Example>' })
  assert.match(escaped.html, /&lt;Example&gt;/)
  assert.equal(escaped.html.includes('<Example>'), false)
})

test('unset ADMIN_NOTIFY_EMAIL or any OAuth secret logs a warning and does not send', async () => {
  clearMailEnv()
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    throw new Error('should not send')
  }
  const lines: string[] = []
  const skipped = await notifyAdmin(sample, { log: (line) => lines.push(line) })
  assert.equal(skipped.status, 'skipped')
  assert.match(skipped.detail, /ADMIN_NOTIFY_EMAIL/)
  assert.match(skipped.detail, /GMAIL_CLIENT_ID/)
  assert.match(skipped.detail, /GMAIL_CLIENT_SECRET/)
  assert.match(skipped.detail, /GMAIL_REFRESH_TOKEN/)
  assert.equal(calls, 0)
  assert.match(lines.join('\n'), /admin_alert warning:/)
  assert.equal(lines.join('\n').includes('@'), false)
  assert.equal(skipped.detail.includes('@'), false)

  for (const name of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'] as const) {
    setRefreshSecrets()
    delete process.env[name]
    const missingOne = await notifyAdmin(sample, { log: (line) => lines.push(line) })
    assert.equal(missingOne.status, 'skipped')
    assert.match(missingOne.detail, new RegExp(name))
    assert.equal(missingOne.detail.includes('secret-example'), false)
    assert.equal(missingOne.detail.includes(PLACEHOLDER_STAFF), false)
  }
  assert.equal(calls, 0)

  setRefreshSecrets()
  delete process.env.ADMIN_NOTIFY_EMAIL
  const missingTo = await notifyAdmin(sample, { log: (line) => lines.push(line) })
  assert.equal(missingTo.status, 'skipped')
  assert.match(missingTo.detail, /ADMIN_NOTIFY_EMAIL/)
  assert.equal(missingTo.detail.includes('refresh-example'), false)
  assert.equal(calls, 0)
})

test('a service account does not replace the OAuth trio', async () => {
  clearMailEnv()
  process.env.GMAIL_FROM = PLACEHOLDER_FROM
  process.env.ADMIN_NOTIFY_EMAIL = PLACEHOLDER_STAFF
  process.env.GMAIL_SERVICE_ACCOUNT_JSON = '{"client_email":"not-a-mailbox","private_key":"secret"}'
  process.env.GMAIL_IMPERSONATE = PLACEHOLDER_FROM
  const missing = missingAdminAlertSecrets()
  assert.ok(missing.includes('GMAIL_CLIENT_ID'))
  assert.ok(missing.includes('GMAIL_CLIENT_SECRET'))
  assert.ok(missing.includes('GMAIL_REFRESH_TOKEN'))
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    throw new Error('should not send')
  }
  const skipped = await notifyAdmin(sample, { log: () => {} })
  assert.equal(skipped.status, 'skipped')
  assert.equal(calls, 0)
})

test('a send failure is logged and does not throw', async () => {
  setRefreshSecrets()
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'ya29.test-token' }), { status: 200 })
    }
    throw new Error('network down')
  }
  const lines: string[] = []
  const failed = await notifyAdmin(sample, { log: (line) => lines.push(line) })
  assert.equal(failed.status, 'error')
  assert.match(failed.detail, /network down/)
  assert.match(lines.join('\n'), /admin_alert warning:/)
  assert.equal(lines.join('\n').includes('refresh-example'), false)
  assert.equal(lines.join('\n').includes('ya29.test-token'), false)
  assert.equal(failed.detail.includes(PLACEHOLDER_STAFF), false)
  assert.equal(lines.join('\n').includes('@'), false)
})

test('a hanging send stops at the short timeout', async () => {
  setRefreshSecrets()
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch
  const started = Date.now()
  const failed = await notifyAdmin(sample, { timeoutMs: 40 })
  assert.equal(failed.status, 'error')
  assert.match(failed.detail, /timed out/)
  assert.ok(Date.now() - started < 1000)
})

test('the saved request is returned before the alert finishes', async () => {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const started = Date.now()
  const saved = deliverAdminAlert({ ok: true, id: 'app-1' }, sample, async () => {
    await gate
    throw new Error('smtp down')
  })
  assert.deepEqual(saved, { ok: true, id: 'app-1' })
  assert.ok(Date.now() - started < 50)
  release()
  await adminAlertSettled()
})

test('mandate intro still succeeds when secrets are unset', async () => {
  clearMailEnv()
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    throw new Error('should not send')
  }
  const res = await handleMandateIntro(mandateRequest(), opened())
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ok?: boolean; status?: string }
  assert.equal(body.ok, true)
  assert.equal(body.status, 'pending')
  await adminAlertSettled()
  assert.equal(calls, 0)
})

test('mandate intro still succeeds when the send fails', async () => {
  setRefreshSecrets()
  globalThis.fetch = async () => {
    throw new Error('network down')
  }
  const lines: string[] = []
  console.warn = (line?: unknown) => {
    lines.push(String(line ?? ''))
  }
  const res = await handleMandateIntro(mandateRequest(), opened({ item: 'Secret Company' }))
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ok?: boolean }
  assert.equal(body.ok, true)
  assert.equal(JSON.stringify(body).includes('Secret Company'), false)
  await adminAlertSettled()
  assert.match(lines.join('\n'), /admin_alert warning:/)
  assert.equal(lines.join('\n').includes(PLACEHOLDER_STAFF), false)
})

test('a repeat mandate intro and a failed intro do not send', async () => {
  setRefreshSecrets()
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    throw new Error('should not send')
  }
  const repeat = await handleMandateIntro(mandateRequest(), opened({ prior: true }))
  assert.equal(repeat.status, 200)
  const denied = await handleMandateIntro(mandateRequest(), opened({ rpcError: 'not_allowed' }))
  assert.equal(denied.status, 403)
  await adminAlertSettled()
  assert.equal(calls, 0)
})

function reRequest() {
  return new Request('https://boardarabia.com/functions/v1/request-re-intro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: JSON.stringify({ opportunity_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
  })
}

function reOpened(opts?: { prior?: boolean; rpcError?: string; status?: string; item?: string }) {
  return {
    open: async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      rpc: async () => {
        if (opts?.rpcError) return { data: null, error: { message: opts.rpcError } }
        return { data: { status: opts?.status ?? 'pending' }, error: null }
      },
      context: async () => ({
        alreadyQueued: Boolean(opts?.prior),
        requesterName: 'Example Person',
        requesterKind: 'member' as const,
        item: opts?.item ?? 'Housing, Riyadh',
      }),
    }),
  }
}

test('a real estate intro still succeeds when secrets are unset and when the send fails', async () => {
  clearMailEnv()
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    throw new Error('should not send')
  }
  const quiet = await handleReIntro(reRequest(), reOpened({ item: 'Secret Counterparty' }))
  assert.equal(quiet.status, 200)
  const quietBody = (await quiet.json()) as { ok?: boolean }
  assert.equal(quietBody.ok, true)
  assert.equal(JSON.stringify(quietBody).includes('Secret Counterparty'), false)
  await adminAlertSettled()
  assert.equal(calls, 0)

  setRefreshSecrets()
  const lines: string[] = []
  console.warn = (line?: unknown) => {
    lines.push(String(line ?? ''))
  }
  globalThis.fetch = async () => {
    throw new Error('network down')
  }
  const failed = await handleReIntro(reRequest(), reOpened())
  assert.equal(failed.status, 200)
  assert.equal(((await failed.json()) as { ok?: boolean }).ok, true)
  const repeat = await handleReIntro(reRequest(), reOpened({ prior: true }))
  assert.equal(repeat.status, 200)
  await adminAlertSettled()
  assert.match(lines.join('\n'), /admin_alert warning:/)
  assert.equal(lines.join('\n').includes(PLACEHOLDER_STAFF), false)
})

test('queue paths call the shared helper and the mandate page is anchored', () => {
  const root = new URL('..', import.meta.url)
  const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
  const notify = read('supabase/functions/_shared/notify_admin.ts')
  assert.equal(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(notify), false)
  assert.equal(notify.includes('\u2014'), false)
  for (const path of [
    'supabase/functions/submit-application/index.ts',
    'supabase/functions/majlis-apply/index.ts',
    'supabase/functions/due-diligence-start/handle.ts',
    'supabase/functions/request-mandate-intro/handle.ts',
    'supabase/functions/request-re-intro/handle.ts',
  ]) {
    const source = read(path)
    assert.match(source, /deliverAdminAlert/)
    assert.equal(source.includes('\u2014'), false)
  }
  assert.match(read('supabase/functions/request-mandate-intro/index.ts'), /request_mandate_intro/)
  assert.equal(read('supabase/functions/request-mandate-intro/index.ts').includes('require_user'), false)
  assert.match(read('supabase/config.toml'), /\[functions\.request-mandate-intro\]/)
  assert.match(read('src/pages/admin/AdminHome.tsx'), /id="mandate-intro-queue"/)
  assert.match(read('src/lib/supabase.ts'), /request-mandate-intro/)
  assert.equal(read('src/lib/demoFetch.ts').includes('request_mandate_intro'), false)
  assert.equal(read('src/lib/demoFetch.ts').includes('request_re_opportunity_intro'), false)
  assert.match(read('supabase/functions/request-re-intro/index.ts'), /request_re_opportunity_intro/)
  assert.equal(read('supabase/functions/request-re-intro/index.ts').includes('require_user'), false)
  assert.match(read('supabase/config.toml'), /\[functions\.request-re-intro\]/)
  assert.match(read('src/lib/supabase.ts'), /request-re-intro/)
  const applied = read('supabase/migrations/20260929230000_real_estate_inventory.sql')
  assert.match(applied, /ADMIN_ALERT_TODO/)
  assert.equal(/gmail|messages\/send/i.test(applied.slice(applied.indexOf('note_re_intro_admin_alert'), applied.indexOf('staff_list_re_opportunity_intros'))), false)
  assert.match(read('supabase/functions/submit-application/index.ts'), /\/admin\/applications/)
  assert.match(read('supabase/functions/majlis-apply/index.ts'), /\/admin\/majlis#admin-majlis-pending/)
  assert.match(read('supabase/functions/due-diligence-start/handle.ts'), /an AI Due Diligence run/)
  assert.match(notify, /adminNotifyEmail/)
  assert.match(notify, /GMAIL_CLIENT_ID/)
  assert.match(notify, /GMAIL_CLIENT_SECRET/)
  assert.match(notify, /GMAIL_REFRESH_TOKEN/)
  assert.match(notify, /ADMIN_NOTIFY_EMAIL/)
  const allowed = new Set(['ADMIN_NOTIFY_EMAIL', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'])
  clearMailEnv()
  for (const name of missingAdminAlertSecrets()) assert.equal(allowed.has(name), true)
})

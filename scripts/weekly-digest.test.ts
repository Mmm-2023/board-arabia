import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement, isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoutesFromElements, matchRoutes } from 'react-router-dom'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { hasBoardFooter, marketingSignatureHit } from '../supabase/functions/_shared/mail.ts'
import {
  digestIssueSendable,
  weeklyDigestMail,
} from '../supabase/functions/_shared/weekly_digest_copy.ts'
import { emailEventLabel } from '../src/lib/emailEventLabel.ts'
import { formatUkDateTime } from '../src/lib/ukDate.ts'
import { DIGEST_AUDIENCE_LABELS } from '../src/lib/digestAudience.ts'
import { presentDigestIssue, presentDigestSources, presentWeeklyDigest } from '../src/lib/weeklyDigest.ts'
import { shellSectionTitle, MEMBER_ACCOUNT, MEMBER_DESTINATIONS } from '../src/shell/destinations.ts'
import { resolveChromePath } from './chrome-path.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationName = '20261212120000_weekly_digest.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function chromePath() {
  const resolved = resolveChromePath()
  if (resolved) return resolved
  if (existsSync('/usr/local/bin/google-chrome')) return '/usr/local/bin/google-chrome'
  if (existsSync('/opt/google/chrome/chrome')) return '/opt/google/chrome/chrome'
  return null
}

test('weekly digest migration is the free slot and does not send', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  assert.ok(names.includes(migrationName))
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261210120000_sectors_city_about.sql'))
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/search_path\s*=\s*public/i.test(sql), false)
  assert.equal(/sendEmail|pg_cron|cron\.schedule/i.test(sql), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/nammco/i.test(sql), false)
  assert.equal(sql.toLowerCase().includes('the desk'), false)
  assert.match(sql, /force row level security/)
  assert.match(sql, /send_enabled boolean not null default false/)
  assert.match(sql, /digest_email_opt_in boolean not null default false/)
  assert.match(sql, /status in \('draft', 'approved', 'withdrawn'\)/)
  assert.match(sql, /private\.is_staff\(\)/)
  assert.match(sql, /mail_ready', false/)
  assert.match(sql, /status = 'approved'/)
  assert.match(sql, /coalesce\(i\.payload ->> 'mail_ready', 'false'\) = 'true'/)
  assert.equal(/intro_suggestions/.test(functionBody(sql, 'public.staff_create_digest_draft')), false)
  assert.match(sql, /revoke all on function public\.my_weekly_digest\(\) from public, anon/)
  assert.equal(/grant execute on function public\.my_weekly_digest\(\) to anon/.test(sql), false)
  assert.match(sql, /where user_id = auth\.uid\(\)/)
  const headers = sql.split(/create or replace function /i).slice(1).map((chunk) => chunk.slice(0, bodyStart(chunk)))
  assert.ok(headers.length >= 10)
  for (const header of headers) {
    assert.match(header, /security definer/i)
    assert.match(header, /set search_path = ''/)
  }
})

test('review migration keeps mail off and does not depend on live stamps', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const review = '20261214120000_digest_review_tiers.sql'
  assert.ok(names.includes(review))
  assert.ok(names.indexOf(review) > names.indexOf('20261212120000_weekly_digest.sql'))
  const sql = read(`supabase/migrations/${review}`)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(/schema_migrations|supabase_migrations/.test(sql), false)
  assert.equal(/sendEmail|pg_cron|cron\.schedule/i.test(sql), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.match(sql, /audience_required/)
  assert.match(sql, /This week''s update is ready/)
  assert.match(sql, /'mail_ready', false/)
  assert.match(sql, /'sendable', false/)
  assert.match(sql, /force row level security/)
  assert.match(sql, /revoke all on function public\.my_digest_notices\(\) from public, anon/)
  assert.match(sql, /revoke all on function public\.staff_save_digest_draft\(jsonb, text\[\]\) from public, anon/)
  assert.equal(/grant execute on function public\.staff_digest_mail_plan\(uuid\) to anon/.test(sql), false)
  const pf3 = read('scripts/pf3-sectors-city-about.test.ts')
  assert.match(pf3, /20261210120000_sectors_city_about\.sql/)
  assert.match(pf3, /20261209140000_deal_room_documents\.sql/)
  assert.equal(pf3.includes('names.at(-1)'), false)
  assert.equal(/schema_migrations|supabase_migrations/.test(pf3), false)
})

test('audience labels are Basic, Founding member, and Partner', () => {
  assert.deepEqual(DIGEST_AUDIENCE_LABELS, {
    member: 'Basic',
    founding: 'Founding member',
    sponsor: 'Partner',
  })
  const editor = read('src/components/digest/DigestDraftEditor.tsx')
  assert.match(editor, /Choose at least one tier before you approve\./)
  assert.match(editor, /Remove company/)
  assert.match(editor, /Remove region/)
  assert.match(editor, /Add a mandate/)
  assert.equal(editor.toLowerCase().includes('sponsor'), false)
  assert.equal(editor.includes('\u2014'), false)
  assert.equal(/\bSAR\b|\bpackage\b/i.test(editor), false)
  const sources = presentDigestSources({
    members: [{ id: '11111111-1111-1111-1111-111111111111', full_name: 'Example Member C', headline: 'Director', company: 'Example Company C' }],
    mandates: [{ sector: 'Energy', deal_type: 'Growth equity', ticket_band: 'Mid band', geography: 'KSA', one_liner: 'A clear example mandate for members.' }],
    events: [{ title: 'Example gathering', starts_at: '16 Oct 2026, 18:00', region: 'Riyadh', host_name: 'Board Arabia' }],
  })
  assert.equal(sources.members[0]?.fullName, 'Example Member C')
  assert.equal(sources.members[0]?.id, '11111111-1111-1111-1111-111111111111')
  assert.equal(sources.mandates[0]?.oneLiner, 'A clear example mandate for members.')
  assert.equal(sources.events[0]?.hostName, 'Board Arabia')
})

test('dashboard digest route loads DigestPage and not the catch-all', async () => {
  const appSource = read('src/App.tsx')
  const applyLine = appSource.split('\n').find((line) => line.includes('path="/apply"'))
  assert.equal(applyLine?.trim(), '<Route path="/apply" element={<ApplyPage />} />')
  const aiStart = appSource.indexOf('<Route path="ai" element={<AiToolsLayout />}>')
  const aiEnd = appSource.indexOf('<Route path="profile/leave"', aiStart)
  const aiBlock = appSource.slice(aiStart, aiEnd)
  const due = aiBlock.indexOf('path="due-diligence" element={<DueDiligencePage />}')
  const tool = aiBlock.indexOf('path=":toolSlug" element={<AiToolPage />}')
  const job = aiBlock.indexOf('path=":toolSlug/:jobId" element={<AiToolPage />}')
  const catchAll = aiBlock.indexOf('path="*" element={<RedirectKeep />}')
  assert.ok(due > 0 && tool > due && job > tool && catchAll > job)

  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
    const appMod = await vite.ssrLoadModule('/src/App.tsx')
    const tree = appMod.default()
    const routesElement = findElement(tree, (node) => node.type?.name === 'Routes' || node.type?.displayName === 'Routes')
    assert.ok(routesElement)
    const matched = matchRoutes(createRoutesFromElements(routesElement.props.children), '/dashboard/digest')
    assert.ok(matched)
    assert.equal(matched.at(-1)?.route.path, 'digest')
    const loaded = await loadLazy(matched.at(-1)?.route.element)
    assert.equal(loaded.name, 'DigestPage')

    const missed = matchRoutes(createRoutesFromElements(routesElement.props.children), '/dashboard/not-a-page')
    assert.ok(missed)
    assert.equal(missed.at(-1)?.route.path, '*')
    assert.equal(missed.at(-1)?.route.element?.type?.name, 'RedirectKeep')
    assert.notEqual(missed.at(-1)?.route.element?.type, matched.at(-1)?.route.element?.type)
  } finally {
    await vite.close()
  }
})

test('digest files do not import sendEmail and no workflow schedules a digest', () => {
  const files = [
    'supabase/functions/_shared/weekly_digest_copy.ts',
    'src/lib/weeklyDigest.ts',
    'src/components/digest/WeeklyDigestView.tsx',
    'src/pages/dashboard/DigestPage.tsx',
    'src/pages/admin/DigestIssuePanel.tsx',
    'src/pages/admin/EmailPage.tsx',
    `supabase/migrations/${migrationName}`,
  ]
  for (const file of files) {
    assert.equal(read(file).includes('sendEmail'), false, file)
    assert.equal(read(file).includes('\u2014'), false, file)
  }
  for (const name of readdirSync(path.join(root, '.github/workflows'))) {
    const text = read(path.join('.github/workflows', name))
    assert.equal(/weekly_digest|digest_issue|my_weekly_digest/.test(text), false, name)
  }
  const app = read('src/App.tsx')
  assert.match(app, /path="digest" element=\{<DigestPage/)
  assert.match(app, /path="digest\/unsubscribe" element=\{<DigestUnsubscribePage/)
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.equal(shellSectionTitle('/dashboard/digest', MEMBER_DESTINATIONS, MEMBER_ACCOUNT), 'This week')
  assert.equal(shellSectionTitle('/dashboard/digest/unsubscribe', MEMBER_DESTINATIONS, MEMBER_ACCOUNT), 'This week')
})

test('the letter stays unsent and the guard refuses a non-approved issue', () => {
  const letter = weeklyDigestMail(
    {
      newMembers: [{ fullName: 'Example Member B', headline: 'Director', company: 'Example Company B' }],
      newMandates: [
        {
          sector: 'Energy',
          dealType: 'Growth equity',
          ticketBand: 'Mid band',
          geography: 'KSA',
          oneLiner: 'A clear regional mandate for members.',
        },
      ],
      upcomingEvents: [
        {
          title: 'Riyadh gathering',
          when: '16 Oct 2026, 18:00',
          region: 'Riyadh',
          hostName: 'Example Member A',
          venueAddress: null,
        },
      ],
      introductions: [
        {
          fullName: 'Example Member A',
          headline: 'Board director',
          company: 'Example Company A',
          reason: 'Example introduction for this preview.',
        },
      ],
    },
    'https://example.com',
  )
  assert.equal(letter.mail_ready, false)
  assert.equal(letter.subject, 'This week at Board Arabia')
  assert.equal(marketingSignatureHit(letter.text, letter.html), null)
  assert.equal(hasBoardFooter(letter.text, letter.html), true)
  assert.match(letter.text, /https:\/\/example\.com\/dashboard\/digest\/unsubscribe/)
  assert.match(letter.html, /Weekly email preferences/)
  assert.equal(letter.text.includes('\u2014'), false)
  assert.equal(letter.html.includes('\u2014'), false)
  assert.equal(/nammco/i.test(letter.text + letter.html), false)
  assert.equal(letter.html.includes('<img'), false)
  assert.equal(letter.text.includes('@'), false)
  assert.equal(digestIssueSendable({ status: 'draft', sendEnabled: true, mailReady: true }), false)
  assert.equal(digestIssueSendable({ status: 'withdrawn', sendEnabled: true, mailReady: true }), false)
  assert.equal(digestIssueSendable({ status: 'approved', sendEnabled: false, mailReady: true }), false)
  assert.equal(digestIssueSendable({ status: 'approved', sendEnabled: true, mailReady: false }), false)
  assert.equal(digestIssueSendable({ status: 'approved', sendEnabled: true, mailReady: true }), true)

  const empty = weeklyDigestMail(
    { newMembers: [], newMandates: [], upcomingEvents: [], introductions: [] },
    'https://example.com',
  )
  assert.equal(empty.mail_ready, false)
  assert.match(empty.text, /Nothing new is listed for this week/)
  assert.equal(hasBoardFooter(empty.text, empty.html), true)
})

test('presented digest drops contact fields and keeps only the caller introductions', () => {
  const presented = presentWeeklyDigest({
    mail_ready: true,
    new_members: [
      { full_name: 'Example Member B', headline: 'Director', company: 'Example Company B', email: 'member.b@example.com' },
      { full_name: 'hidden@example.com', headline: 'Director', company: 'Hidden Co' },
    ],
    new_mandates: [
      {
        sector: 'Energy',
        deal_type: 'Growth equity',
        ticket_band: 'Mid band',
        geography: 'KSA',
        one_liner: 'A clear regional mandate for members.',
        contact_email: 'admin@example.com',
        contact_phone: '+966 50 123 4567',
      },
    ],
    upcoming_events: [
      {
        title: 'Riyadh gathering',
        starts_at: '2026-10-16T15:00:00.000Z',
        region: 'Riyadh',
        host_name: 'Example Member A',
        venue_address: '0501234567',
      },
    ],
    suggestions: [{ full_name: 'Example Member C', headline: 'Director', company: 'Example Company C', reason: 'Both are in the example city.' }],
    preview_intros: [{ full_name: 'Example Member A', headline: 'Board director', company: 'Example Company A', reason: 'Example.' }],
  })
  assert.ok(presented)
  assert.equal(presented?.mailReady, false)
  assert.equal(JSON.stringify(presented).includes('@'), false)
  assert.equal(/[0-9][0-9 ()+.-]{6,}[0-9]/.test(JSON.stringify(presented)), false)
  assert.equal(presented?.newMembers[0]?.fullName, 'Example Member B')
  assert.equal(presented?.introductions.some((row) => row.fullName === 'Example Member A'), false)
  assert.equal(presented?.upcomingEvents[0]?.venueAddress, null)
  assert.equal(presented?.upcomingEvents[0]?.when, '16 Oct 2026, 18:00')

  const issue = presentDigestIssue({
    send_enabled: false,
    mail_ready: true,
    live: { suggestions: [{ full_name: 'Real Member', headline: 'Director', company: 'Real Co', reason: 'Private.' }] },
    issue: {
      status: 'draft',
      payload: {
        new_members: [{ full_name: 'Example Member B', headline: 'Director', company: 'Example Company B' }],
        preview_intros: [
          {
            full_name: 'Example Member A',
            headline: 'Board director',
            company: 'Example Company A',
            reason: 'Example introduction for this preview.',
          },
        ],
        suggestions: [{ full_name: 'Real Member', headline: 'Director', company: 'Real Co', reason: 'Private.' }],
      },
      log: [{ action: 'created', created_at: '2026-10-13T09:15:00.000Z' }],
    },
  })
  assert.equal(issue?.sendEnabled, false)
  assert.equal(issue?.mailReady, false)
  assert.equal(issue?.status, 'draft')
  assert.equal(issue?.preview.introductions[0]?.fullName, 'Example Member A')
  assert.equal(issue?.preview.introductions[0]?.example, true)
  assert.equal(JSON.stringify(issue?.preview.introductions).includes('Real Member'), false)
})

test('email events use the Riyadh date and a plain label', async () => {
  assert.equal(formatUkDateTime('2026-09-22T11:49:44.000Z'), '22 Sept 2026, 14:49')
  assert.equal(emailEventLabel('desk_note'), 'Member note')
  assert.equal(emailEventLabel('applicant_ack'), 'Admission email')
  assert.equal(emailEventLabel('sponsor_invite'), 'Partner invite')
  assert.equal(emailEventLabel('raw_code_xyz'), 'Email')
  const stored = `Stored subject ${String.fromCharCode(0x2014)} kept`
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  let html = ''
  try {
    const page = await vite.ssrLoadModule('/src/pages/admin/EmailPage.tsx')
    html = renderToStaticMarkup(
    createElement(page.EmailEventList, {
      events: [
        {
          id: 'event-1',
          created_at: '2026-09-22T11:49:44.000Z',
          kind: 'desk_note',
          recipient: 'member@example.com',
          subject: stored,
          status: 'sent',
          detail: 'A short note for the member.',
        },
        {
          id: 'event-2',
          created_at: '2026-09-22T11:49:44.000Z',
          kind: 'raw_code_xyz',
          recipient: 'other@example.com',
          subject: 'Second subject',
          status: 'dry_run',
        },
      ],
    }),
  )
  } finally {
    await vite.close()
  }
  assert.match(html, /22 Sept 2026, 14:49/)
  assert.match(html, /Member note/)
  assert.match(html, /Email/)
  assert.match(html, new RegExp(stored.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(html.includes('member@example.com'), false)
  assert.equal(html.includes('other@example.com'), false)
  assert.equal(html.includes('desk_note'), false)
  assert.equal(html.includes('raw_code_xyz'), false)
  const page = read('src/pages/admin/EmailPage.tsx')
  assert.equal(page.includes('toLocaleString()'), false)
  assert.equal(page.includes('event.recipient'), false)
  const home = read('src/pages/dashboard/HomeSnapshotView.tsx')
  assert.match(home, /data-tap="got-it"/)
  assert.match(home, /data-tap="details"/)
  assert.match(home, /data-tap="open"/)
  assert.match(home, /to="\/dashboard\/digest"/)
  assert.match(home, /min-h-11 min-w-11/)
})

test('home tap targets are at least 44px at 390 and digest shots exist', async (t) => {
  const executablePath = chromePath()
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
  const shotDir = path.join('/opt/cursor/artifacts', 'weekly-digest')
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
      ['member', 'full', 1280, 900],
      ['member', 'full', 390, 844],
      ['home-link', 'home', 1280, 900],
      ['home-link', 'home', 390, 844],
      ['admin-prepare', 'prepare', 1280, 1100],
      ['admin-prepare', 'prepare', 390, 844],
      ['admin-preview', 'preview', 1280, 1100],
      ['admin-preview', 'preview', 390, 844],
      ['admin-approved', 'approved', 1280, 1100],
      ['admin-approved', 'approved', 390, 844],
      ['admin-withdrawn', 'withdrawn', 1280, 1100],
      ['admin-withdrawn', 'withdrawn', 390, 844],
      ['admin-edit', 'edit', 1280, 1100],
      ['admin-edit', 'edit', 390, 844],
      ['admin-audience', 'audience', 1280, 1100],
      ['admin-audience', 'audience', 390, 844],
      ['admin-blocked', 'blocked', 1280, 1100],
      ['admin-blocked', 'blocked', 390, 844],
      ['member-notice', 'notice', 1280, 900],
      ['member-notice', 'notice', 390, 844],
      ['member-in-tier', 'in-tier', 1280, 900],
      ['member-in-tier', 'in-tier', 390, 844],
      ['member-out-of-tier', 'out-of-tier', 1280, 900],
      ['member-out-of-tier', 'out-of-tier', 390, 844],
    ]
    for (const [name, viewName, width, height] of shots) {
      const page = await browser.newPage({ viewport: { width, height } })
      await page.goto(`${origin}/scripts/smoke/weekly-digest.html?view=${viewName}`, { waitUntil: 'networkidle' })
      if (viewName === 'home' && width === 390) {
        const boxes = await page.locator('[data-tap]').evaluateAll((nodes) =>
          nodes.map((node) => {
            const rect = node.getBoundingClientRect()
            return {
              tap: node.getAttribute('data-tap'),
              width: rect.width,
              height: rect.height,
            }
          }),
        )
        const wanted = ['got-it', 'details', 'open', 'digest']
        for (const tap of wanted) {
          const hit = boxes.find((box) => box.tap === tap)
          assert.ok(hit, tap)
          assert.ok(hit.width >= 44, `${tap} width ${hit.width}`)
          assert.ok(hit.height >= 44, `${tap} height ${hit.height}`)
        }
      }
      if (viewName === 'preview') {
        const text = await page.locator('[data-preview]').innerText()
        assert.match(text, /22 Sept 2026, 14:49/)
        assert.match(text, /Sending is off\. Email is not connected\./)
        assert.match(text, /Member note/)
        assert.equal(text.includes('member@example.com'), false)
        assert.match(text, /Example Member A/)
        assert.match(text, /Example\. Not a member record\./)
      }
      if (viewName === 'prepare') {
        assert.equal(await page.locator('[data-issue-status]').getAttribute('data-issue-status'), 'none')
      }
      if (viewName === 'approved') {
        assert.equal(await page.locator('[data-issue-status]').getAttribute('data-issue-status'), 'approved')
      }
      if (viewName === 'withdrawn') {
        assert.equal(await page.locator('[data-issue-status]').getAttribute('data-issue-status'), 'withdrawn')
      }
      if (viewName === 'edit') {
        const text = await page.locator('[data-preview]').innerText()
        assert.match(text, /Example Member B/)
        assert.equal(text.includes('Example Company B'), false)
        assert.match(text, /remove company/i)
        assert.match(text, /Example note for members/)
      }
      if (viewName === 'audience') {
        const text = await page.locator('[data-audience-picker]').innerText()
        assert.match(text, /Basic/)
        assert.match(text, /Founding member/)
        assert.match(text, /Partner/)
        assert.equal(text.toLowerCase().includes('sponsor'), false)
      }
      if (viewName === 'blocked') {
        const text = await page.locator('[data-approve-block]').innerText()
        assert.match(text, /Choose at least one tier before you approve\./)
        assert.equal(await page.getByRole('button', { name: 'Approve' }).isDisabled(), true)
      }
      if (viewName === 'notice') {
        const text = await page.locator('[data-digest-notice]').innerText()
        assert.match(text, /This week's update is ready/)
        assert.equal(await page.locator('[data-tap="digest-notice"]').getAttribute('href'), '/dashboard/digest')
      }
      if (viewName === 'in-tier') {
        assert.match(await page.locator('[data-digest="full"]').innerText(), /Example Member B/)
      }
      if (viewName === 'out-of-tier') {
        assert.match(await page.locator('[data-digest="empty"]').innerText(), /Nothing new this week\./)
      }
      const file = path.join(shotDir, `digest-${name}-${width}.png`)
      await page.screenshot({ path: file, fullPage: true })
      assert.equal(existsSync(file), true)
      await page.close()
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})

function findElement(node, pred) {
  if (!isValidElement(node)) return null
  if (pred(node)) return node
  const children = node.props?.children
  const list = Array.isArray(children) ? children : [children]
  for (const child of list) {
    const found = findElement(child, pred)
    if (found) return found
  }
  return null
}

async function loadLazy(element) {
  const type = element?.type
  const payload = type?._payload
  assert.equal(typeof payload?._result, 'function')
  const loaded = await payload._result()
  assert.equal(typeof loaded.default, 'function')
  return loaded.default
}

function bodyStart(chunk: string) {
  const fn = chunk.indexOf('as $fn$')
  const plain = chunk.indexOf('as $$')
  const cuts = [fn, plain].filter((index) => index >= 0)
  return cuts.length ? Math.min(...cuts) : chunk.length
}

function functionBody(sql: string, name: string) {
  const marker = `function ${name}`
  const start = sql.indexOf(marker)
  assert.ok(start >= 0, name)
  const bodyAt = start + bodyStart(sql.slice(start))
  const endMark = sql.startsWith('as $fn$', bodyAt) ? '$fn$;' : '\n$$;'
  const end = sql.indexOf(endMark, bodyAt)
  assert.ok(end > bodyAt, name)
  return sql.slice(bodyAt, end)
}

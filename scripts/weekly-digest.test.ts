import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { hasBoardFooter, marketingSignatureHit } from '../supabase/functions/_shared/mail.ts'
import {
  digestIssueSendable,
  weeklyDigestMail,
} from '../supabase/functions/_shared/weekly_digest_copy.ts'
import { emailEventLabel } from '../src/lib/emailEventLabel.ts'
import { formatUkDateTime } from '../src/lib/ukDate.ts'
import { presentDigestIssue, presentWeeklyDigest } from '../src/lib/weeklyDigest.ts'
import { shellSectionTitle, MEMBER_ACCOUNT, MEMBER_DESTINATIONS } from '../src/shell/destinations.ts'
import { resolveChromePath } from './chrome-path.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationName = '20261209130000_weekly_digest.sql'

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
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261209120000_application_answers_at_admission.sql'))
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
      newMembers: [{ fullName: 'Layla Al Diriyah', headline: 'Director', company: 'Diriyah Works' }],
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
          hostName: 'Huda Al Harbi',
          venueAddress: null,
        },
      ],
      introductions: [
        {
          fullName: 'Preview member',
          headline: 'Board director',
          company: 'Preview Works',
          reason: 'A sample introduction for this preview.',
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
      { full_name: 'Layla Al Diriyah', headline: 'Director', company: 'Diriyah Works', email: 'layla@example.com' },
      { full_name: 'hidden@example.com', headline: 'Director', company: 'Hidden Co' },
    ],
    new_mandates: [
      {
        sector: 'Energy',
        deal_type: 'Growth equity',
        ticket_band: 'Mid band',
        geography: 'KSA',
        one_liner: 'A clear regional mandate for members.',
        contact_email: 'desk@example.com',
        contact_phone: '+966 50 123 4567',
      },
    ],
    upcoming_events: [
      {
        title: 'Riyadh gathering',
        starts_at: '2026-10-16T15:00:00.000Z',
        region: 'Riyadh',
        host_name: 'Huda Al Harbi',
        venue_address: '0501234567',
      },
    ],
    suggestions: [{ full_name: 'Noura Al Wahat', headline: 'Director', company: 'Wahat Counsel', reason: 'Both are in Riyadh.' }],
    preview_intros: [{ full_name: 'Preview member', headline: 'Board director', company: 'Preview Works', reason: 'Sample.' }],
  })
  assert.ok(presented)
  assert.equal(presented?.mailReady, false)
  assert.equal(JSON.stringify(presented).includes('@'), false)
  assert.equal(/[0-9][0-9 ()+.-]{6,}[0-9]/.test(JSON.stringify(presented)), false)
  assert.equal(presented?.newMembers[0]?.fullName, 'Layla Al Diriyah')
  assert.equal(presented?.introductions.some((row) => row.fullName === 'Preview member'), false)
  assert.equal(presented?.upcomingEvents[0]?.venueAddress, null)
  assert.equal(presented?.upcomingEvents[0]?.when, '16 Oct 2026, 18:00')

  const issue = presentDigestIssue({
    send_enabled: false,
    mail_ready: true,
    live: { suggestions: [{ full_name: 'Real Member', headline: 'Director', company: 'Real Co', reason: 'Private.' }] },
    issue: {
      status: 'draft',
      payload: {
        new_members: [{ full_name: 'Layla Al Diriyah', headline: 'Director', company: 'Diriyah Works' }],
        preview_intros: [
          {
            full_name: 'Preview member',
            headline: 'Board director',
            company: 'Preview Works',
            reason: 'A sample introduction for this preview.',
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
  assert.equal(issue?.preview.introductions[0]?.fullName, 'Preview member')
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
    const shots: Array<[string, number, number]> = [
      ['full', 1280, 900],
      ['full', 390, 844],
      ['empty', 1280, 900],
      ['empty', 390, 844],
      ['privacy', 1280, 900],
      ['privacy', 390, 844],
      ['admin', 1280, 1100],
      ['admin', 390, 844],
      ['home', 1280, 900],
      ['home', 390, 844],
    ]
    for (const [name, width, height] of shots) {
      const page = await browser.newPage({ viewport: { width, height } })
      await page.goto(`${origin}/scripts/smoke/weekly-digest.html?view=${name}`, { waitUntil: 'networkidle' })
      if (name === 'home' && width === 390) {
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
      if (name === 'admin') {
        const text = await page.locator('[data-preview]').innerText()
        assert.match(text, /22 Sept 2026, 14:49/)
        assert.match(text, /Sending is off\. Email is not connected\./)
        assert.match(text, /Member note/)
        assert.equal(text.includes('member@example.com'), false)
        assert.match(text, /Preview member/)
        assert.match(text, /Sample introduction for this preview/)
      }
      if (name === 'empty') {
        assert.match(await page.locator('[data-digest="empty"]').innerText(), /Nothing new this week/)
      }
      if (name === 'privacy') {
        assert.equal(await page.locator('[data-digest-email]').getAttribute('data-digest-email'), 'off')
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

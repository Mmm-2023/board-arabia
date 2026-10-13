import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { strayPublicNammco } from './public-nammco.mjs'
import { DIGEST_SECTION_ORDER, type DigestNewsItem } from '../supabase/functions/_shared/weekly_digest_copy.ts'
import {
  digestLinkedinUrl,
  presentWeeklyDigest,
  validateDigestForSave,
  visibleDigestSections,
  type WeeklyDigestModel,
} from '../src/lib/weeklyDigest.ts'

const DIGEST_CONTACT_EMAIL = 'contact@boardarabia.com'
const DIGEST_CTA_LABEL = "Review this week's mandates"
const DIGEST_FOOTER_CREDIT = 'powered by nammco'
import { resolveChromePath } from './chrome-path.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationName = '20261218120000_digest_sections.sql'
const earlier = '20261214120000_digest_review_tiers.sql'
const marketBrief = '20261215120000_daily_market_brief.sql'

const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const priceRe = /\$\s?\d|\b(?:SAR|USD|EUR|GBP)\b|\bprice\b|\bpackage\b/i

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

function news(headline: string, lens = ''): DigestNewsItem {
  return {
    headline,
    sentences: ['Example sentence one for members.', 'Example sentence two for members.'],
    boardLens: lens,
    sources: [{ label: 'Example review', url: 'https://example.org/review' }],
    people: [],
  }
}

function exampleDigest(extra: Partial<WeeklyDigestModel> = {}): WeeklyDigestModel {
  return {
    mailReady: false,
    opening: 'A short briefing on markets, mandates, and the week ahead.',
    issueNumber: '42',
    issueDate: '13 Oct 2026',
    readMinutes: 4,
    hiddenSections: [],
    notes: [],
    boardroom: [
      {
        ...news('Boards ask for a clearer capital plan', 'Ask whether the plan still matches the mandate you approved.'),
        people: [{ name: 'Example Director', linkedinUrl: 'https://www.linkedin.com/in/example-director' }],
      },
      {
        ...news('Regional markets stay selective'),
        people: [{ name: 'Example Chair', linkedinUrl: null }],
      },
    ],
    deals: [news('A growth round stays in diligence'), news('Sellers with a clean story still get meetings')],
    platformBullets: ['Introductions now show the reason on the card.', 'Majlis dates sit on your calendar after you reply.'],
    featureTip: 'Open a mandate from this briefing to read the outline first.',
    newMembers: [{ fullName: 'Example Member B', headline: 'Director', company: 'Example Company B' }],
    keyMembers: [{ fullName: 'Example Director', headline: 'Board director', company: 'Example Company A', key: true }],
    newMandates: [
      {
        sector: 'Energy',
        dealType: 'Growth equity',
        ticketBand: 'Mid band',
        geography: 'KSA',
        stage: 'Diligence',
        oneLiner: 'A clear example mandate for members.',
      },
    ],
    upcomingEvents: [
      {
        title: 'Example gathering',
        when: '16 Oct 2026, 18:00',
        region: 'Riyadh',
        hostName: 'Board Arabia',
        venueAddress: null,
      },
    ],
    diary: [
      {
        title: 'Example capital forum',
        when: '20 Oct 2026',
        sources: [{ label: 'Example diary', url: 'https://example.org/diary' }],
      },
    ],
    partnerInsight: {
      label: 'Partner content',
      sentences: [
        'A partner firm notes that boards want a shorter first meeting.',
        'The useful step is a one page brief before the room.',
      ],
      source: { label: 'Example partner note', url: 'https://example.org/partner' },
    },
    introductions: [],
    ...extra,
  }
}

function ctaCount(html: string) {
  return (html.match(/Review this week(?:'|&#x27;|&#39;)s mandates/g) ?? []).length
}

async function renderDigest(digest: WeeklyDigestModel) {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
    const view = await vite.ssrLoadModule('/src/components/digest/WeeklyDigestView.tsx')
    return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(view.WeeklyDigestView, { digest })))
  } finally {
    await vite.close()
  }
}

test('digest sections migration sorts after the named review migration', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  assert.ok(names.includes(migrationName))
  assert.ok(names.includes(earlier))
  assert.ok(names.includes(marketBrief))
  assert.ok(names.indexOf(migrationName) > names.indexOf(earlier))
  assert.ok(names.indexOf(migrationName) > names.indexOf(marketBrief))
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/sendEmail|pg_cron|cron\.schedule/i.test(sql), false)
  assert.equal(emailRe.test(sql), false)
  assert.equal(/nammco/i.test(sql), false)
  assert.equal(sql.toLowerCase().includes('the desk'), false)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /'mail_ready', false/)
  assert.match(sql, /private\.digest_member_visible/)
  assert.match(sql, /private\.caller_sees_member_card/)
  assert.match(sql, /is_demo = false/)
  assert.equal(/names\.at\(-1\)/.test(read('scripts/digest-sections.test.ts')), false)
  assert.equal(/names\.at\(-1\)/.test(read('scripts/digest-sections-db.test.ts')), false)
})

test('six sections stay in order and a hidden section does not render', async () => {
  const html = await renderDigest(exampleDigest())
  const ids = [...html.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(ids, DIGEST_SECTION_ORDER.map((section) => section.id))
  assert.match(html, /In this issue/)
  assert.match(html, /Issue 42/)
  assert.match(html, /13 Oct 2026/)
  assert.match(html, /4 min read/)
  assert.equal((html.match(/data-digest-cta=/g) ?? []).length, 1)
  assert.equal(ctaCount(html), 1)
  assert.match(html, /href="\/dashboard\/deals\/mandates"/)
  assert.equal(html.includes('Mid band'), false)
  assert.equal(html.includes('Example Counterparty'), false)

  const hidden = await renderDigest(exampleDigest({ hiddenSections: ['partner', 'deals'] }))
  const hiddenIds = [...hidden.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(hiddenIds, ['boardroom', 'platform', 'database', 'majlis'])
  assert.equal(hidden.includes('data-section="partner"'), false)
  assert.equal(hidden.includes('data-section="deals"'), false)
  assert.equal((hidden.match(/data-digest-cta=/g) ?? []).length, 1)
  assert.deepEqual(visibleDigestSections(exampleDigest({ hiddenSections: ['database'] })), [
    'boardroom',
    'deals',
    'platform',
    'majlis',
    'partner',
  ])
})

test('news items need a headline and a source, and the board lens renders when present', async () => {
  const model = exampleDigest()
  assert.equal(validateDigestForSave(model), null)
  const html = await renderDigest(model)
  assert.match(html, /Board lens: Ask whether the plan still matches the mandate you approved\./)
  assert.equal((html.match(/data-board-lens=/g) ?? []).length, 1)
  assert.match(html, /href="https:\/\/www\.linkedin\.com\/in\/example-director"/)
  assert.match(html, />Example Chair</)
  assert.equal(html.includes('href="https://www.linkedin.com/in/example-chair"'), false)

  const missingHeadline = exampleDigest()
  missingHeadline.boardroom = [{ ...news(''), headline: '   ' }, news('Second item')]
  assert.equal(validateDigestForSave(missingHeadline), 'A news item needs a headline.')

  const missingSource = exampleDigest()
  missingSource.deals = [news('First item'), { ...news('Second item'), sources: [] }]
  assert.equal(validateDigestForSave(missingSource), 'A news item needs a source.')

  const badLink = exampleDigest()
  badLink.boardroom = [news('First item'), { ...news('Second item'), sources: [{ label: 'Bad', url: 'javascript:alert(1)' }] }]
  assert.equal(validateDigestForSave(badLink), 'Source links must use http or https.')

  const badLinkedin = exampleDigest()
  badLinkedin.boardroom = [
    news('First item'),
    { ...news('Second item'), people: [{ name: 'Example Director', linkedinUrl: 'https://evil.example/in/someone' }] },
  ]
  assert.equal(validateDigestForSave(badLinkedin), 'LinkedIn links must use linkedin.com.')
  assert.equal(digestLinkedinUrl('http://linkedin.com/in/example'), '')
  assert.equal(digestLinkedinUrl('https://www.linkedin.com/in/example-director'), 'https://www.linkedin.com/in/example-director')

  const oneItem = exampleDigest()
  oneItem.deals = [news('Only one')]
  assert.equal(validateDigestForSave(oneItem), 'News sections need 2 to 4 items.')

  const presented = presentWeeklyDigest({
    boardroom: [
      {
        headline: 'Example headline',
        sentences: ['First example sentence.', 'Second example sentence.'],
        board_lens: 'A board lens line.',
        sources: [{ label: 'Example review', url: 'javascript:alert(1)' }],
        people: [{ name: 'Example Director', linkedin_url: 'https://evil.example/in/someone' }],
      },
    ],
    new_mandates: [
      {
        sector: 'Energy',
        deal_type: 'Growth equity',
        ticket_band: 'Mid band',
        geography: 'KSA',
        one_liner: 'A clear example mandate for members.',
        company_name: 'Example Counterparty',
      },
    ],
  })
  assert.equal(presented?.boardroom?.length ?? 0, 0)
  assert.equal(JSON.stringify(presented).includes('Example Counterparty'), false)
  assert.equal(JSON.stringify(presented).includes('company_name'), false)
})

test('digest copy keeps one contact, the footer credit, and no prices', async () => {
  const html = await renderDigest(exampleDigest())
  const found = html.match(emailRe) ?? []
  assert.ok(found.length > 0)
  assert.ok(found.every((address) => address === DIGEST_CONTACT_EMAIL))
  assert.equal(html.includes(DIGEST_FOOTER_CREDIT), true)
  assert.equal(strayPublicNammco(html), false)
  assert.equal(/\bsponsor/i.test(html), false)
  assert.equal(html.includes('\u2014'), false)
  assert.equal(html.includes('\u2013'), false)
  assert.equal(priceRe.test(html), false)
  assert.match(html, /data-partner-content/)
  assert.match(html, /Partner content/)

  const files = [
    'src/components/digest/WeeklyDigestView.tsx',
    'src/components/digest/DigestDraftEditor.tsx',
    'src/pages/dashboard/DigestPage.tsx',
    'src/pages/admin/DigestIssuePanel.tsx',
    'src/lib/weeklyDigest.ts',
    'supabase/functions/_shared/weekly_digest_copy.ts',
  ]
  for (const file of files) {
    const source = read(file)
    assert.equal(source.includes('\u2014'), false, file)
    assert.equal(source.includes('\u2013'), false, file)
    assert.equal(source.toLowerCase().includes('the desk'), false, file)
    assert.equal(priceRe.test(source), false, file)
    emailRe.lastIndex = 0
    const addresses = source.match(emailRe) ?? []
    if (file.endsWith('WeeklyDigestView.tsx')) {
      assert.ok(addresses.every((address) => address === DIGEST_CONTACT_EMAIL), file)
    } else {
      assert.deepEqual(addresses, [], file)
    }
    if (file.endsWith('WeeklyDigestView.tsx')) {
      assert.equal(strayPublicNammco(source), false, file)
    } else {
      assert.equal(/nammco/i.test(source), false, file)
    }
  }
  assert.equal(read('src/components/digest/DigestDraftEditor.tsx').toLowerCase().includes('sponsor'), false)
  assert.equal(read('src/pages/dashboard/HomeSnapshotView.tsx').includes('to="/dashboard/digest"'), true)
})

test('member and admin digest shots at 1440 and 390', async (t) => {
  const executablePath = chromePath()
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
  const shotDir = path.join('/opt/cursor/artifacts', 'fw4c-digest-sections')
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
    const shots: Array<[string, string, number]> = [
      ['sections', 'member', 1440],
      ['sections', 'member', 390],
      ['sections-admin', 'admin', 1440],
      ['sections-admin', 'admin', 390],
    ]
    for (const [viewName, label, width] of shots) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      await page.goto(`${origin}/scripts/smoke/weekly-digest.html?view=${viewName}`, { waitUntil: 'networkidle' })
      const rootText = viewName === 'sections'
        ? await page.locator('[data-digest="full"]').innerText()
        : await page.locator('[data-digest-editor]').innerText()
      assert.match(rootText, /Boardroom and markets/)
      assert.match(rootText, /Deals and investments/)
      assert.match(rootText, /On the platform/)
      assert.match(rootText, /New on the database/)
      assert.match(rootText, /Majlis and dates for the diary/)
      assert.match(rootText, /Partner spot/)
      if (viewName === 'sections') {
        assert.equal(await page.locator('[data-digest-cta]').count(), 1)
        assert.equal(await page.locator('[data-digest-cta]').innerText(), DIGEST_CTA_LABEL)
        assert.match(await page.locator('[data-digest-footer]').innerText(), new RegExp(DIGEST_FOOTER_CREDIT))
      }
      const file = path.join(shotDir, `digest-${label}-${width}.png`)
      await page.screenshot({ path: file, fullPage: true })
      assert.equal(existsSync(file), true)
      await page.close()
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})

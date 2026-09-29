import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  mandateHasTags,
  matchScore,
  memberAdminHref,
  presentStaffMandateList,
  presentStaffMandateMatch,
  rankMandateMatches,
  shortlistText,
  type MatchCandidate,
  type StaffMandateMatch,
} from '../src/lib/mandateMatch.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migration = 'supabase/migrations/20261021120000_admin_mandate_tag_matches.sql'

const MANDATE_ID = 'a2000001-0000-4000-8000-000000000001'
const OPEN_ID = '11111111-1111-4111-8111-111111111111'
const SELECTIVE_ID = '22222222-2222-4222-8222-222222222222'
const DEMO_ID = '33333333-3333-4333-8333-333333333333'
const CAPACITY_ID = '44444444-4444-4444-8444-444444444444'
const IDLE_ID = '55555555-5555-4555-8555-555555555555'

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function page(node: ReactNode) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

function candidate(patch: Partial<MatchCandidate> & Pick<MatchCandidate, 'userId' | 'fullName'>): MatchCandidate {
  return {
    headline: 'Chair',
    company: 'Northwind',
    seat: 'ksa',
    isDemo: false,
    status: 'active',
    availability: 'open',
    sectorTags: ['Energy transition'],
    visionThemes: ['Renewable energy'],
    ...patch,
  }
}

const energy = {
  sector: 'Energy transition',
  sectorTags: ['Energy transition'],
  visionThemes: ['Renewable energy', 'Thriving economy'],
  dealType: 'Growth equity',
}

test('score uses sector, vision, and availability weights', () => {
  assert.equal(matchScore(1, 0, 'open'), 5)
  assert.equal(matchScore(1, 2, 'open'), 9)
  assert.equal(matchScore(1, 2, 'selective'), 8)
  assert.equal(matchScore(0, 1, 'selective'), 3)
})

test('ranking keeps real available members and explains the overlap', () => {
  const ranked = rankMandateMatches(energy, [
    candidate({ userId: DEMO_ID, fullName: 'Sample Chair', isDemo: true }),
    candidate({ userId: CAPACITY_ID, fullName: 'Full Chair', availability: 'at_capacity' }),
    candidate({ userId: IDLE_ID, fullName: 'Quiet Chair', availability: null, status: 'suspended' }),
    candidate({
      userId: '66666666-6666-4666-8666-666666666666',
      fullName: 'Invited Chair',
      status: 'invited',
    }),
    candidate({
      userId: '77777777-7777-4777-8777-777777777777',
      fullName: 'Other Sector',
      sectorTags: ['Health'],
      visionThemes: ['Housing'],
    }),
    candidate({
      userId: SELECTIVE_ID,
      fullName: 'Nora Al Noor',
      availability: 'selective',
      sectorTags: ['Energy transition', 'Health'],
      visionThemes: ['Renewable energy'],
    }),
    candidate({
      userId: OPEN_ID,
      fullName: 'Sara Al Noor',
      sectorTags: ['Energy transition'],
      visionThemes: ['Renewable energy', 'Thriving economy'],
    }),
    candidate({
      userId: '88888888-8888-4888-8888-888888888888',
      fullName: 'http://not.example',
      sectorTags: ['Not a sector'],
      visionThemes: ['Not a theme'],
    }),
  ])

  assert.deepEqual(
    ranked.map((row) => row.fullName),
    ['Sara Al Noor', 'Nora Al Noor'],
  )
  assert.equal(ranked[0]?.score, 9)
  assert.deepEqual(ranked[0]?.sectorOverlap, ['Energy transition'])
  assert.deepEqual(ranked[0]?.visionOverlap, ['Renewable energy', 'Thriving economy'])
  assert.equal(ranked[1]?.score, 6)
  assert.equal(ranked[1]?.availability, 'selective')

  const text = shortlistText({ sector: energy.sector, dealType: energy.dealType }, ranked)
  assert.match(text, /^Shortlist for Energy transition, Growth equity\n1\. Sara Al Noor\. Score 9\. Open\. Sector: Energy transition\. Vision 2030: Renewable energy, Thriving economy\./)
  assert.equal(text.includes('@'), false)
  assert.equal(text.includes('\u2014'), false)
  assert.equal(text.includes('\u2013'), false)
  assert.equal(/mailto|notif/i.test(text), false)
})

test('a mandate with no known tags matches nobody', () => {
  const bare = { sector: 'General counsel', sectorTags: [], visionThemes: [] }
  assert.equal(mandateHasTags(bare), false)
  assert.deepEqual(rankMandateMatches(bare, [candidate({ userId: OPEN_ID, fullName: 'Sara Al Noor' })]), [])
  assert.equal(mandateHasTags({ sector: 'Energy transition', sectorTags: [], visionThemes: [] }), true)
})

test('ties break by name after score', () => {
  const ranked = rankMandateMatches(
    { sector: 'Health', sectorTags: ['Health'], visionThemes: [] },
    [
      candidate({ userId: SELECTIVE_ID, fullName: 'Zayn', sectorTags: ['Health'], visionThemes: [], availability: 'open' }),
      candidate({ userId: OPEN_ID, fullName: 'Amira', sectorTags: ['Health'], visionThemes: [], availability: 'open' }),
    ],
  )
  assert.deepEqual(
    ranked.map((row) => row.fullName),
    ['Amira', 'Zayn'],
  )
  assert.equal(ranked[0]?.score, ranked[1]?.score)
})

test('parsers keep staff fields and recompute the score', () => {
  const listed = presentStaffMandateList([
    {
      id: MANDATE_ID,
      is_demo: true,
      published: true,
      sector: 'Energy transition',
      deal_type: 'Growth equity',
      ticket_band: '$10-25m',
      geography: 'KSA',
      stage: 'Diligence',
      one_liner: 'Growth capital for a Saudi industrial services platform.',
      company_name: 'Nahla Industrial Holding',
      sector_tags: ['Energy transition', 'Not a sector'],
      vision_themes: ['Renewable energy'],
      match_count: 2,
      contact_email: 'hidden@example.com',
    },
    { id: 'not-a-uuid', sector: 'Health' },
  ])
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.matchCount, 2)
  assert.deepEqual(listed[0]?.sectorTags, ['Energy transition'])
  assert.equal(JSON.stringify(listed).includes('@'), false)

  const detail = presentStaffMandateMatch({
    id: MANDATE_ID,
    is_demo: false,
    published: false,
    sector: 'Health',
    deal_type: 'Acquisition',
    ticket_band: '$25-50m',
    geography: 'GCC',
    stage: 'Sourcing',
    one_liner: 'A control stake.',
    company_name: 'Waha Care',
    sector_tags: ['Health'],
    vision_themes: [],
    matches: [
      {
        user_id: OPEN_ID,
        full_name: 'Sara Al Noor',
        headline: 'Chair',
        company: 'Northwind',
        seat: 'intl',
        availability: 'open',
        sector_overlap: ['Health'],
        vision_overlap: [],
        score: 99,
      },
      {
        user_id: SELECTIVE_ID,
        full_name: 'Full Chair',
        availability: 'at_capacity',
        sector_overlap: ['Health'],
        vision_overlap: [],
        score: 5,
      },
    ],
  })
  assert.ok(detail)
  assert.equal(detail?.published, false)
  assert.equal(detail?.matches.length, 1)
  assert.equal(detail?.matches[0]?.score, 5)
  assert.equal(memberAdminHref(OPEN_ID), `/admin/people#member-${OPEN_ID}`)
  assert.equal(memberAdminHref('not-a-person'), null)
  assert.equal(presentStaffMandateMatch({ id: 'bad' }), null)
})

test('the staff functions are locked and do not message members', () => {
  const sql = source(migration)
  assert.match(sql, /if not private\.is_staff\(\) then/)
  assert.match(sql, /mem\.is_demo = false/)
  assert.match(sql, /mem\.status = 'active'/)
  assert.match(sql, /prof\.availability in \('open', 'selective'\)/)
  assert.match(sql, /cardinality\(hit\.sector_hits\) \* 3/)
  assert.match(sql, /cardinality\(hit\.vision_hits\) \* 2/)
  assert.match(sql, /when hit\.availability = 'open' then 2 else 1/)
  assert.match(sql, /revoke all on function public\.staff_list_mandates\(\) from public, anon;/)
  assert.match(sql, /grant execute on function public\.staff_list_mandates\(\) to authenticated;/)
  assert.match(sql, /revoke all on function public\.staff_list_mandate_matches\(uuid\) from public, anon;/)
  assert.match(sql, /grant execute on function public\.staff_list_mandate_matches\(uuid\) to authenticated;/)
  assert.equal(/grant execute on function public\.staff_list_mandate_matches[\s\S]*to anon/.test(sql), false)
  assert.equal(/grant execute on function public\.staff_list_mandates\(\) to anon/.test(sql), false)
  assert.equal(sql.includes('@'), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/contact_email|contact_phone|deck_url/.test(sql), false)
  assert.equal(/insert\s+into/i.test(sql), false)
  assert.equal(/net\.http|pg_net|send_email/i.test(sql), false)
  assert.match(sql, /a2000001-0000-4000-8000-000000000001/)
  assert.match(sql, /'Renewable energy', 'Thriving economy'/)
  assert.equal(source('src/pages/dashboard/MandatesPage.tsx').includes('staff_list_mandate_matches'), false)
  assert.equal(source('src/pages/dashboard/DirectoryPage.tsx').includes('staff_list_mandates'), false)
})

test('the shortlist renders matches, an empty list, and a mandate with no tags', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const view = await vite.ssrLoadModule('/src/pages/admin/MandateShortlist.tsx')
    const matched = fixture({
      sectorTags: ['Energy transition'],
      visionThemes: ['Renewable energy'],
      matches: [
        {
          userId: OPEN_ID,
          fullName: 'Sara Al Noor',
          headline: 'Independent chair',
          company: 'Northwind',
          seat: 'ksa',
          availability: 'open',
          sectorOverlap: ['Energy transition'],
          visionOverlap: ['Renewable energy'],
          score: 7,
        },
      ],
    })
    const matchedHtml = page(
      createElement(view.MandateShortlist, {
        mandate: matched,
        matches: matched.matches,
        copied: false,
        copyError: '',
        onCopy: () => {},
      }),
    )
    assert.match(matchedHtml, /data-mandate-shortlist="matches"/)
    assert.match(matchedHtml, /Sara Al Noor/)
    assert.match(matchedHtml, /Score 7/)
    assert.match(matchedHtml, /Sector: Energy transition\. Vision 2030: Renewable energy\./)
    assert.match(matchedHtml, /Copy shortlist/)
    assert.match(matchedHtml, new RegExp(`href="/admin/people#member-${OPEN_ID}"`))
    assert.match(matchedHtml, /Open in People/)
    assert.equal(matchedHtml.includes('@'), false)
    assert.equal(/mailto|Request intro|Send /i.test(matchedHtml), false)

    const empty = fixture({ sectorTags: ['Health'], visionThemes: ['Health transformation'], matches: [] })
    const emptyHtml = page(
      createElement(view.MandateShortlist, {
        mandate: empty,
        matches: [],
        copied: false,
        copyError: '',
        onCopy: () => {},
      }),
    )
    assert.match(emptyHtml, /data-mandate-shortlist="empty"/)
    assert.match(emptyHtml, /No active members share these tags/)
    assert.equal(emptyHtml.includes('Copy shortlist'), false)

    const bare = fixture({ sector: 'General counsel', sectorTags: [], visionThemes: [], matches: [] })
    const bareHtml = page(
      createElement(view.MandateShortlist, {
        mandate: bare,
        matches: [],
        copied: false,
        copyError: '',
        onCopy: () => {},
      }),
    )
    assert.match(bareHtml, /data-mandate-shortlist="no-tags"/)
    assert.match(bareHtml, /no sector or Vision 2030 tags/)
    assert.equal(bareHtml.includes('\u2014'), false)
    assert.equal(bareHtml.includes('\u2013'), false)
  } finally {
    await vite.close()
  }
})

function fixture(patch: Partial<StaffMandateMatch>): StaffMandateMatch {
  return {
    id: MANDATE_ID,
    isDemo: true,
    published: true,
    sector: 'Energy transition',
    dealType: 'Growth equity',
    ticketBand: '$10-25m',
    geography: 'KSA',
    stage: 'Diligence',
    oneLiner: 'Growth capital for a Saudi industrial services platform.',
    companyName: 'Nahla Industrial Holding',
    sectorTags: ['Energy transition'],
    visionThemes: ['Renewable energy'],
    matches: [],
    ...patch,
  }
}

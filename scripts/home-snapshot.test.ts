import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { DEMO_THRESHOLD_DEFAULTS, demoRowsVisible } from '../src/lib/demoThreshold.ts'
import {
  applyDemoThreshold,
  assembleHome,
  buildHeadlines,
  mandateTeaser,
  presentHomeActivity,
  presentHomeActivityList,
  primaryHomeCta,
  uniqueById,
  type AssembleInput,
  type IntroState,
  type MandateBrief,
} from '../src/lib/homeSnapshot.ts'
import {
  EXPLORE_DEALS_TO,
  NEEDS_YOU_EMPTY,
  NEEDS_YOU_SUBTITLE,
  NEEDS_YOU_TITLE,
  SEE_LESS_LABEL,
  SEE_MORE_ACCESSIBLE,
  SEE_MORE_LABEL,
  SUGGESTED_INTROS_TO,
  THIS_WEEK_SEE_ALL,
  TWO_STEP_LABEL,
  TWO_STEP_TO,
  buildNeedsYou,
  digestPreviewLines,
  liveHomePartners,
  profileGapLabel,
  roomInviteCopy,
} from '../src/lib/homeNeeds.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const NOW = Date.parse('2026-09-29T12:00:00.000Z')

function brief(partial: Partial<MandateBrief> & { is_demo: boolean; intro_status: IntroState }): MandateBrief {
  return {
    id: partial.id ?? 'mandate',
    is_demo: partial.is_demo,
    sector: partial.sector ?? 'Energy',
    deal_type: partial.deal_type ?? 'Growth equity',
    ticket_band: '$10-25m',
    geography: 'KSA',
    stage: 'Diligence',
    one_liner: partial.one_liner ?? 'A clear line with no private detail.',
    intro_status: partial.intro_status,
  }
}

function base(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    nowMs: NOW,
    seat: 'ksa',
    name: 'Huda Al Sample',
    photoUrl: null,
    profileReady: true,
    mustSetPassword: false,
    invitesRemaining: 0,
    personalCapacityIncluded: false,
    attention: [],
    mandates: [],
    rooms: [],
    directory: [],
    partners: [],
    gatherings: [],
    admitted: 12,
    ksa: 8,
    intl: 4,
    money: [],
    activity: [],
    activityStatus: 'empty',
    loading: false,
    partialError: false,
    updatedLabel: 'Updated 09:00',
    ...overrides,
  }
}

test('founding members see vouchers and personal capacity; standard members do not', () => {
  const founding = assembleHome(
    base({
      seat: 'ksa',
      invitesRemaining: 2,
      personalCapacityIncluded: true,
    }),
  )
  assert.equal(founding.identity.badge, 'Founding')
  assert.equal(founding.identity.seatLabel, 'Saudi Arabia')
  assert.equal(founding.pulse.some((item) => item.id === 'vouchers' && item.value === '2'), true)
  assert.equal(founding.platform.capacityNote, 'Your capacity is included in platform totals.')
  assert.equal(founding.platform.fill?.personal, true)
  assert.equal(founding.cta?.id, 'invite')

  const standard = assembleHome(
    base({
      seat: 'sponsor',
      invitesRemaining: 2,
      personalCapacityIncluded: true,
      profileReady: true,
    }),
  )
  assert.equal(standard.identity.badge, 'Member')
  assert.equal(standard.identity.seatLabel, 'Member seat')
  assert.equal(standard.pulse.some((item) => item.id === 'vouchers'), false)
  assert.equal(standard.platform.capacityNote, null)
  assert.equal(standard.platform.fill?.personal, false)
  assert.match(source('src/pages/dashboard/HomeSnapshotView.tsx'), /Not your seat allocation\./)
  assert.equal(standard.cta, null)
  assert.equal(JSON.stringify(standard).includes('Vouchers left'), false)

  const intl = buildHeadlines({
    founding: true,
    invitesRemaining: 1,
    mandates: [],
    rooms: [],
    directory: [],
  })
  assert.equal(intl.some((item) => item.id === 'vouchers'), true)
  const hidden = buildHeadlines({
    founding: false,
    invitesRemaining: 2,
    mandates: [],
    rooms: [],
    directory: [],
  })
  assert.equal(hidden.some((item) => item.id === 'vouchers'), false)
})

test('primary CTA follows profile, intro, majlis, mandate, then invite', () => {
  const all = {
    profileReady: false,
    mustSetPassword: false,
    pendingIntros: 2,
    canRegisterMajlis: true,
    openMajlisId: 'a1000001-0000-4000-8000-000000000099',
    newMandates: 3,
    founding: true,
    invitesRemaining: 2,
  }
  assert.equal(primaryHomeCta(all)?.id, 'profile')
  assert.equal(primaryHomeCta(all)?.label, 'Complete profile')
  assert.equal(primaryHomeCta({ ...all, profileReady: true, mustSetPassword: true })?.to, '/dashboard/profile#password')
  assert.equal(primaryHomeCta({ ...all, profileReady: true })?.id, 'intro')
  assert.equal(primaryHomeCta({ ...all, profileReady: true })?.label, 'Review intro')
  assert.equal(primaryHomeCta({ ...all, profileReady: true, pendingIntros: 0 })?.id, 'majlis')
  assert.equal(primaryHomeCta({ ...all, profileReady: true, pendingIntros: 0 })?.label, 'Register majlis')
  assert.equal(
    primaryHomeCta({ ...all, profileReady: true, pendingIntros: 0, openMajlisId: null })?.id,
    'mandate',
  )
  assert.equal(
    primaryHomeCta({ ...all, profileReady: true, pendingIntros: 0, openMajlisId: null })?.label,
    'New mandate',
  )
  assert.equal(
    primaryHomeCta({
      ...all,
      profileReady: true,
      pendingIntros: 0,
      openMajlisId: null,
      newMandates: 0,
    })?.id,
    'invite',
  )
  assert.equal(
    primaryHomeCta({
      ...all,
      profileReady: true,
      pendingIntros: 0,
      openMajlisId: null,
      newMandates: 0,
    })?.label,
    'Invite peer',
  )
  assert.equal(
    primaryHomeCta({
      ...all,
      profileReady: true,
      pendingIntros: 0,
      openMajlisId: null,
      newMandates: 0,
      founding: false,
      canRegisterMajlis: false,
    }),
    null,
  )
  assert.equal(primaryHomeCta({ ...all, profileReady: true, pendingIntros: null })?.id, 'majlis')
})

test('pulse shows real counts and hides sample-only cards', () => {
  assert.equal(DEMO_THRESHOLD_DEFAULTS.mandates, 6)
  assert.equal(DEMO_THRESHOLD_DEFAULTS.rooms, 4)
  assert.equal(demoRowsVisible(5, 6), true)
  assert.equal(demoRowsVisible(6, 6), false)

  const thin = buildHeadlines({
    founding: true,
    invitesRemaining: 0,
    mandates: [brief({ is_demo: true, intro_status: null }), brief({ id: 'b', is_demo: true, intro_status: null })],
    rooms: [
      { is_demo: true },
      { is_demo: true },
    ],
    directory: [{ is_demo: true }, { is_demo: true }],
  })
  assert.equal(thin.find((item) => item.id === 'mandates'), undefined)
  assert.equal(thin.find((item) => item.id === 'rooms'), undefined)
  assert.equal(thin.find((item) => item.id === 'directory'), undefined)
  assert.equal(thin.some((item) => item.example), false)
  assert.equal(thin.length, 0)

  const liveAndSample = [
    ...Array.from({ length: 6 }, (_, index) => brief({ id: `r${index}`, is_demo: false, intro_status: null })),
    brief({ id: 'demo', is_demo: true, intro_status: null }),
  ]
  assert.equal(applyDemoThreshold(liveAndSample, 6).some((row) => row.is_demo), false)
  const full = buildHeadlines({
    founding: false,
    invitesRemaining: 2,
    mandates: liveAndSample,
    rooms: [],
    directory: [],
  })
  const fullMandates = full.find((item) => item.id === 'mandates')
  assert.equal(fullMandates?.example, false)
  assert.equal(fullMandates?.value, '6')
  assert.equal(full.some((item) => item.example), false)
  assert.equal(full.some((item) => item.id === 'vouchers'), false)

  const mixedPending = buildHeadlines({
    founding: false,
    invitesRemaining: 0,
    mandates: [
      brief({ id: 'live', is_demo: false, intro_status: 'pending' }),
      brief({ id: 'sample', is_demo: true, intro_status: 'pending' }),
    ],
    rooms: [],
    directory: [],
  })
  assert.equal(mixedPending.find((item) => item.id === 'intros')?.value, '1')
  assert.equal(mixedPending.find((item) => item.id === 'intros')?.example, false)
  const sampleOnly = buildHeadlines({
    founding: false,
    invitesRemaining: 0,
    mandates: [brief({ is_demo: true, intro_status: 'pending' })],
    rooms: [],
    directory: [],
  })
  assert.equal(sampleOnly.find((item) => item.id === 'intros'), undefined)
  assert.equal(sampleOnly.some((item) => item.example), false)

  const sampleHome = assembleHome(
    base({
      invitesRemaining: 2,
      mandates: [
        brief({ is_demo: true, intro_status: 'pending' }),
        brief({ id: 'fresh-sample', is_demo: true, intro_status: null }),
      ],
      rooms: [{ id: 'room-sample', is_demo: true, name: 'Industrial services room', sector: 'Energy', stage: 'Diligence' }],
      activity: [
        {
          id: 'sample-intro',
          kind: 'intro',
          label: 'Intro requested',
          detail: 'Energy transition · Growth equity',
          happenedAt: '2026-09-25T11:40:00.000Z',
          href: '/dashboard/deals/mandates',
          example: true,
        },
      ],
      activityStatus: 'ready',
    }),
  )
  assert.equal(sampleHome.pulse.find((item) => item.id === 'intros'), undefined)
  assert.equal(sampleHome.pulse.find((item) => item.id === 'mandates'), undefined)
  assert.equal(sampleHome.pulse.find((item) => item.id === 'rooms'), undefined)
  assert.equal(sampleHome.pulse.find((item) => item.id === 'vouchers')?.value, '2')
  assert.equal(sampleHome.pulse.some((item) => item.example), false)
  assert.equal(sampleHome.cta?.id, 'invite')
  assert.equal(sampleHome.teasers.mandates[0]?.example, true)
  assert.equal(sampleHome.activity[0]?.example, true)
  assert.equal(sampleHome.activity[0]?.label, 'Intro requested')
})

test('mandate teasers keep one card per id', () => {
  const repeated = brief({
    id: 'same-brief',
    is_demo: false,
    intro_status: null,
    sector: 'Health',
    deal_type: 'Advisory',
    one_liner: 'An advisory brief for a regional care network.',
  })
  const copy = brief({
    id: 'same-brief',
    is_demo: false,
    intro_status: null,
    sector: 'Health',
    deal_type: 'Advisory',
    one_liner: 'This second copy must not render.',
  })
  const other = brief({
    id: 'other-brief',
    is_demo: false,
    intro_status: null,
    sector: 'Logistics',
    deal_type: 'Growth equity',
    one_liner: 'Growth capital for a domestic freight platform.',
  })
  assert.deepEqual(uniqueById([repeated, copy, other]).map((row) => row.id), ['same-brief', 'other-brief'])
  const model = assembleHome(base({ mandates: [repeated, copy, other] }))
  assert.deepEqual(
    model.teasers.mandates.map((card) => card.id),
    ['same-brief', 'other-brief'],
  )
  assert.deepEqual(
    model.teasers.mandates.map((card) => `${card.sector} ${card.dealType}`),
    ['Health Advisory', 'Logistics Growth equity'],
  )
  assert.equal(model.teasers.mandates.some((card) => card.oneLiner.includes('second copy')), false)
  assert.equal(model.pulse.find((item) => item.id === 'mandates')?.value, '2')
})

test('home teasers keep clear mandate fields and drop private ones', () => {
  const teaser = mandateTeaser({
    id: 'm1',
    is_demo: true,
    sector: 'Energy',
    deal_type: 'Growth equity',
    ticket_band: '$10-25m',
    geography: 'KSA',
    stage: 'Diligence',
    one_liner: 'A clear line.',
    intro_status: null,
    company_name: 'Secret Co',
    exact_amount: '12345678',
    contact_email: 'person@example.com',
    contact_phone: '+10000000000',
    deck_url: 'https://files.example.com/deck',
  })
  const json = JSON.stringify(teaser)
  assert.equal(json.includes('Secret Co'), false)
  assert.equal(json.includes('12345678'), false)
  assert.equal(json.includes('person@example.com'), false)
  assert.equal(json.includes('exact_amount'), false)
  assert.equal(json.includes('contact_email'), false)
  assert.equal(json.includes('deck'), false)
  assert.equal(teaser.oneLiner, 'A clear line.')
  assert.equal(teaser.example, true)
})

test('activity feed keeps five member-safe events and drops raw contact fields', () => {
  const clean = (id: string, happenedAt: string) => ({
    id,
    kind: 'intro',
    label: 'Intro requested',
    detail: 'Energy · Growth equity',
    happened_at: happenedAt,
    href: '/dashboard/mandates',
    is_demo: false,
  })
  assert.equal(
    presentHomeActivity({
      ...clean('leak', '2026-09-01T10:00:00.000Z'),
      contact_email: 'person@example.com',
      exact_amount: '99',
    }),
    null,
  )
  assert.equal(
    presentHomeActivity({
      ...clean('mail', '2026-09-01T10:00:00.000Z'),
      detail: 'Write to person@example.com',
    }),
    null,
  )
  assert.equal(
    presentHomeActivity({
      ...clean('link', '2026-09-01T10:00:00.000Z'),
      href: 'https://example.com/book',
    }),
    null,
  )
  const list = presentHomeActivityList([
    clean('1', '2026-09-01T10:00:00.000Z'),
    clean('2', '2026-09-02T10:00:00.000Z'),
    clean('3', '2026-09-03T10:00:00.000Z'),
    clean('4', '2026-09-04T10:00:00.000Z'),
    clean('5', '2026-09-05T10:00:00.000Z'),
    clean('6', '2026-09-06T10:00:00.000Z'),
    {
      ...clean('bad', '2026-09-07T10:00:00.000Z'),
      detail: 'person@example.com',
    },
  ])
  assert.equal(list.length, 5)
  assert.equal(list[0]?.id, '6')
  assert.equal(JSON.stringify(list).includes('person@example.com'), false)
  assert.equal(JSON.stringify(list).includes('exact_amount'), false)
})

test('home copy and the activity migration stay free of private fields and em dashes', () => {
  const files = [
    'src/lib/homeSnapshot.ts',
    'src/lib/homeSnapshotLoad.ts',
    'src/pages/dashboard/HomeSnapshotView.tsx',
    'src/pages/dashboard/DashboardHome.tsx',
    'supabase/migrations/20260929180000_member_home_activity.sql',
  ]
  for (const file of files) {
    assert.equal(source(file).includes('\u2014'), false, file)
    assert.equal(source(file).includes('Availability'), false, file)
  }
  const view = source('src/pages/dashboard/HomeSnapshotView.tsx')
  assert.equal(view.includes('exact_amount'), false)
  assert.equal(view.includes('contact_email'), false)
  assert.match(view, /ExampleMark/)
  assert.match(view, /data-membership-badge/)
  assert.match(view, /!item\.example/)
  assert.match(view, /\{item\.value\}/)
  assert.equal(view.includes('item.example ? null'), false)
  assert.match(view, /FORMING_TOTALS/)
  assert.equal(view.includes('Platform totals are not published yet'), false)
  assert.equal(view.includes('\u2014'), false)
  assert.equal(view.includes('\u2013'), false)
  const sql = source('supabase/migrations/20260929180000_member_home_activity.sql')
  assert.match(sql, /security definer/)
  assert.match(sql, /auth\.uid\(\)/)
  assert.match(sql, /limit 5/)
  assert.match(sql, /grant execute on function public\.list_member_home_activity\(\) to authenticated/)
  assert.equal(sql.includes('exact_amount'), false)
  assert.equal(sql.includes('company_name'), false)
  assert.equal(sql.includes('contact_email'), false)
  assert.equal(sql.includes('venue_address'), false)
  assert.match(source('src/pages/dashboard/DashboardHome.tsx'), /cards=\{3\}/)
})

test('needs you copy, this week lines, and live partners stay exact', () => {
  assert.equal(NEEDS_YOU_TITLE, 'Needs you')
  assert.equal(NEEDS_YOU_SUBTITLE, 'A few things to finish so your membership works for you.')
  assert.equal(NEEDS_YOU_EMPTY, "You're all set. Nothing needs you right now.")
  assert.equal(profileGapLabel(1), 'One step left to complete your profile')
  assert.equal(profileGapLabel(3), 'Your profile is 3 steps from complete')
  assert.equal(profileGapLabel(0), null)
  assert.equal(roomInviteCopy(1, 'Care network room')?.label, "You're invited to a deal room: Care network room")
  assert.equal(roomInviteCopy(1, 'Care network room')?.action, 'View invite')
  assert.equal(roomInviteCopy(2, 'Care network room')?.label, 'You have 2 deal room invites')
  assert.equal(roomInviteCopy(2, 'Care network room')?.action, 'View invites')
  assert.equal(TWO_STEP_LABEL, 'Turn on two-step sign-in to protect your account')
  assert.equal(SEE_MORE_LABEL, 'See more')
  assert.equal(SEE_LESS_LABEL, 'See less')
  assert.equal(SEE_MORE_ACCESSIBLE, 'Show more from Board Arabia')
  const items = buildNeedsYou({
    twoStepOff: true,
    profileGaps: 1,
    invites: [{ id: 'a3000001-0000-4000-8000-000000000001', name: 'Care network room' }],
    suggestionCount: 2,
    attention: [
      {
        title: 'Set your password',
        body: 'Set a password before you leave this session so your invite link is not the only way back in.',
        to: '/dashboard/profile#password',
        cta: 'Set password',
      },
    ],
  })
  assert.deepEqual(
    items.map((item) => [item.label, item.action, item.to]),
    [
      [TWO_STEP_LABEL, 'Turn on', TWO_STEP_TO],
      ['Set your password', 'Set password', '/dashboard/profile#password'],
      ['One step left to complete your profile', 'Finish profile', '/dashboard/profile#profile-tags'],
      ["You're invited to a deal room: Care network room", 'View invite', '/dashboard/deals/rooms/a3000001-0000-4000-8000-000000000001'],
      ['2 suggested introductions for you', 'Suggested introductions', SUGGESTED_INTROS_TO],
    ],
  )
  assert.equal(buildNeedsYou({
    twoStepOff: false,
    profileGaps: 0,
    invites: [],
    suggestionCount: 0,
    attention: [],
  }).length, 0)
  const lines = digestPreviewLines({
    newMembers: [{ fullName: 'Example Member' }],
    newMandates: [{ oneLiner: 'A clear example mandate.' }],
    upcomingEvents: [{ title: 'Example gathering' }],
    notes: [{ text: 'A fourth line stays off the card.' }],
    introductions: [{ fullName: 'Sample Person', example: true }, { fullName: 'Live Person', example: false }],
  })
  assert.deepEqual(lines, ['Example Member', 'A clear example mandate.', 'Example gathering'])
  const home = source('src/pages/dashboard/DashboardHome.tsx')
  const view = source('src/pages/dashboard/HomeSnapshotView.tsx')
  assert.equal(home.includes("from './IntroSuggestions'"), false)
  assert.equal(home.includes('<IntroSuggestions'), false)
  assert.equal(home.includes('fetchIntroQuota'), false)
  assert.equal(home.includes('fetchMyIntros'), false)
  assert.equal(view.includes('Trusted Partners'), false)
  assert.match(view, />\s*Partners\s*</)
  assert.match(view, /to="\/dashboard\/digest"/)
  assert.match(view, /homePrimaryAction/)
  assert.match(source('src/lib/homeNeeds.ts'), /Explore deals/)
  assert.equal(home.includes('\u2014'), false)
  assert.equal(view.includes('\u2014'), false)
  assert.equal(source('src/lib/homeNeeds.ts').includes('\u2014'), false)
})

test('home sections follow needs you, this week, one next action, activity, then see more', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const home = await vite.ssrLoadModule('/src/pages/dashboard/HomeSnapshotView.tsx')
    const filled = assembleHome(base({
      invitesRemaining: 2,
      partners: [
        {
          id: 'p-sample',
          is_demo: true,
          name: 'Qaf Ledger',
          monogram: 'QL',
          blurb: 'A sample firm.',
        },
        {
          id: 'p-live',
          is_demo: false,
          is_partner: true,
          name: 'Example Capital',
          monogram: 'EC',
          blurb: 'One line for a fixture partner.',
        },
      ],
    }))
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(home.HomeSnapshotView, {
          model: filled,
          weekLines: ['Example Member', 'A clear example mandate.', 'Example gathering'],
          needsYou: buildNeedsYou({
            twoStepOff: true,
            profileGaps: 2,
            invites: [],
            suggestionCount: 1,
            attention: [],
          }),
          dailyBriefSlot: createElement('p', { 'data-daily-brief-card': '' }, 'Daily market brief'),
        }),
      ),
    )
    const needsAt = html.indexOf('data-home-needs')
    const weekAt = html.indexOf('data-home-digest')
    const nextAt = html.indexOf('data-home-next')
    const activityAt = html.indexOf('data-home-activity')
    const moreAt = html.indexOf('data-home-more')
    assert.ok(needsAt >= 0 && needsAt < weekAt && weekAt < nextAt && nextAt < activityAt && activityAt < moreAt)
    assert.match(html, new RegExp(NEEDS_YOU_TITLE))
    assert.match(html, /Your profile is 2 steps from complete/)
    assert.match(html, /href="\/dashboard\/profile#profile-tags"/)
    assert.match(html, /1 suggested introductions for you/)
    assert.match(html, new RegExp(`href="${SUGGESTED_INTROS_TO}"`))
    assert.match(html, /Example Member/)
    assert.match(html, new RegExp(`>${THIS_WEEK_SEE_ALL}<`))
    assert.match(html, /href="\/dashboard\/digest"/)
    assert.equal((html.match(/data-home-cta=/g) || []).length, 1)
    assert.match(html, /data-home-cta="invite"/)
    assert.equal(html.includes('Add sector and availability'), false)
    assert.equal(html.includes('IntroSuggestions'), false)
    assert.match(html, />See more</)
    assert.match(html, new RegExp(`aria-label="${SEE_MORE_ACCESSIBLE}"`))
    const more = html.slice(moreAt)
    assert.match(more, /Your pulse/)
    assert.match(more, /Platform snapshot/)
    assert.match(more, /From the room/)
    assert.match(more, />Partners</)
    assert.match(more, /Example Capital/)
    assert.match(more, /data-daily-brief-card/)
    assert.match(more, /Qaf Ledger/)
    assert.match(more, />Example</)
    assert.equal(more.includes('Trusted Partners'), false)

    const quiet = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(home.HomeSnapshotView, {
        model: assembleHome(base()),
        needsYou: [],
      })),
    )
    assert.equal(quiet.includes('data-home-needs'), false)
    assert.equal(quiet.includes(NEEDS_YOU_EMPTY), false)
    assert.equal((quiet.match(/data-home-cta=/g) || []).length, 1)
    assert.match(quiet, new RegExp(`href="${EXPLORE_DEALS_TO}"`))
    assert.match(quiet, />Explore deals</)

    const samplesOnly = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(home.HomeSnapshotView, {
        model: assembleHome(base({
          partners: [
            { id: 'p-sample', is_demo: true, name: 'Qaf Ledger', monogram: 'QL', blurb: 'A sample firm.' },
          ],
        })),
        needsYou: [],
      })),
    )
    assert.match(samplesOnly, /Qaf Ledger/)
    assert.match(samplesOnly, /data-gallery="partners"/)
    assert.match(samplesOnly, />Example</)
  } finally {
    await vite.close()
  }
})

const HOME_PARTNER_EXAMPLES = [
  { id: 'ex-law', is_demo: true, name: 'Qaf Counsel', monogram: 'QC', blurb: 'Law firm.', category_slug: 'law-firm' },
  { id: 'ex-audit', is_demo: true, name: 'Mirsad Audit', monogram: 'MA', blurb: 'Accounting and audit firm.', category_slug: 'accounting-audit' },
  { id: 'ex-bank', is_demo: true, name: 'Dar Clearing', monogram: 'DC', blurb: 'Bank.', category_slug: 'bank' },
  { id: 'ex-search', is_demo: true, name: 'Nahla Search', monogram: 'NS', blurb: 'Executive search firm.', category_slug: 'executive-search' },
  { id: 'ex-cover', is_demo: true, name: 'Safa Cover', monogram: 'SC', blurb: 'Insurer and advisory firm.', category_slug: 'insurer-advisory' },
] as const

test('a live bank partner hides only the bank example', async () => {
  const examples = HOME_PARTNER_EXAMPLES.map((row) => ({
    ...row,
    example: true,
    is_partner: false,
  }))
  assert.deepEqual(
    liveHomePartners(examples).map((row) => row.name),
    ['Qaf Counsel', 'Mirsad Audit', 'Dar Clearing', 'Nahla Search', 'Safa Cover'],
  )
  const withBank = liveHomePartners([
    ...examples,
    {
      id: 'live-bank',
      example: false,
      is_partner: true,
      name: 'Harbour Clearing',
      category_slug: 'bank',
    },
    {
      id: 'adviser',
      example: false,
      is_partner: false,
      name: 'Example Advisory',
      category_slug: null,
    },
  ])
  assert.deepEqual(
    withBank.map((row) => row.name),
    ['Qaf Counsel', 'Mirsad Audit', 'Nahla Search', 'Safa Cover', 'Harbour Clearing'],
  )
  assert.equal(withBank.some((row) => row.name === 'Dar Clearing'), false)
  assert.equal(withBank.some((row) => row.name === 'Example Advisory'), false)

  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const home = await vite.ssrLoadModule('/src/pages/dashboard/HomeSnapshotView.tsx')
    const render = (partners: AssembleInput['partners']) => renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(home.HomeSnapshotView, {
        model: assembleHome(base({ partners })),
        needsYou: [],
      })),
    )
    const examplesOnly = render(HOME_PARTNER_EXAMPLES.map((row) => ({ ...row })))
    const partnerGallery = examplesOnly.slice(examplesOnly.indexOf('data-gallery="partners"'))
    assert.equal((partnerGallery.match(/>Example</g) || []).length, 5)
    for (const row of HOME_PARTNER_EXAMPLES) assert.match(partnerGallery, new RegExp(row.name))

    const swapped = render([
      ...HOME_PARTNER_EXAMPLES.map((row) => ({ ...row })),
      {
        id: 'live-bank',
        is_demo: false,
        is_partner: true,
        name: 'Harbour Clearing',
        monogram: 'HC',
        blurb: 'A published bank partner.',
        category_slug: 'bank',
      },
      {
        id: 'adviser',
        is_demo: false,
        is_partner: false,
        name: 'Example Advisory',
        monogram: 'EA',
        blurb: 'One line for a fixture adviser.',
        category_slug: null,
      },
    ])
    const partnersAt = swapped.indexOf('data-gallery="partners"')
    const advisersAt = swapped.indexOf('data-gallery="advisers"')
    assert.ok(partnersAt >= 0 && advisersAt > partnersAt)
    const partnersHtml = swapped.slice(partnersAt, advisersAt)
    const advisersHtml = swapped.slice(advisersAt)
    assert.equal(partnersHtml.includes('Dar Clearing'), false)
    assert.match(partnersHtml, /Harbour Clearing/)
    assert.equal((partnersHtml.match(/>Example</g) || []).length, 4)
    const liveRow = partnersHtml.slice(partnersHtml.indexOf('data-partner-name="Harbour Clearing"'))
    assert.equal(liveRow.slice(0, liveRow.indexOf('</li>')).includes('>Example<'), false)
    for (const name of ['Qaf Counsel', 'Mirsad Audit', 'Nahla Search', 'Safa Cover']) {
      assert.match(partnersHtml, new RegExp(name))
    }
    assert.match(advisersHtml, /Trusted advisers/)
    assert.match(advisersHtml, /data-adviser-name="Example Advisory"/)
    assert.equal(partnersHtml.includes('Example Advisory'), false)
    assert.equal(swapped.includes('\u2014'), false)
    assert.equal(swapped.toLowerCase().includes('sponsor'), false)
  } finally {
    await vite.close()
  }
})

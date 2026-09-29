import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DEMO_THRESHOLD_DEFAULTS, demoRowsVisible } from '../src/lib/demoThreshold.ts'
import {
  applyDemoThreshold,
  assembleHome,
  buildHeadlines,
  mandateTeaser,
  presentHomeActivity,
  presentHomeActivityList,
  primaryHomeCta,
  type AssembleInput,
  type IntroState,
  type MandateBrief,
} from '../src/lib/homeSnapshot.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const NOW = Date.parse('2026-09-29T12:00:00.000Z')

function brief(partial: Partial<MandateBrief> & { is_demo: boolean; intro_status: IntroState }): MandateBrief {
  return {
    id: partial.id ?? 'mandate',
    is_demo: partial.is_demo,
    sector: 'Energy',
    deal_type: 'Growth equity',
    ticket_band: '$10-25m',
    geography: 'KSA',
    stage: 'Diligence',
    one_liner: 'A clear line with no private detail.',
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

test('demo threshold keeps example counts below the line and drops them at the line', () => {
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
    directory: [],
  })
  const thinMandates = thin.find((item) => item.id === 'mandates')
  const thinRooms = thin.find((item) => item.id === 'rooms')
  assert.equal(thinMandates?.example, true)
  assert.equal(thinMandates?.value, '2')
  assert.equal(thinRooms?.example, true)
  assert.ok(thinMandates && thinMandates.body.includes('Example'))

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
  assert.ok(buildHeadlines({
    founding: false,
    invitesRemaining: 0,
    mandates: [brief({ is_demo: true, intro_status: 'pending' })],
    rooms: [],
    directory: [],
  }).find((item) => item.id === 'intros')?.example)
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

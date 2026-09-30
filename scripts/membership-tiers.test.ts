import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { membershipLine } from '../supabase/functions/_shared/membership_steps.ts'
import {
  FOUNDING_REGION_CAP,
  TIER_SAVE_OK,
  foundingRegionTaken,
  foundingSeatAvailable,
  membershipTiersInvalid,
  membershipTiersOf,
  normalizeMembershipTiers,
  peopleCardLine,
  tierSaveError,
} from '../src/lib/membershipTiers.ts'
import { holdsSponsorSeat, sponsorCapView } from '../src/lib/sponsorSeat.ts'
import { publicConsiderationCta, setTwoTierRegisterForTests } from '../src/lib/twoTierRegister.ts'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

function lineOf(source: string, needle: string) {
  const index = source.split('\n').findIndex((line) => line.includes(needle))
  assert.ok(index >= 0, needle)
  return index + 1
}

function sliceFn(source: string, signature: string) {
  const start = source.indexOf(signature)
  assert.ok(start >= 0, signature)
  return source.slice(start, source.indexOf('\n$$;', start) + 4)
}

const migration = read('supabase/migrations/20261109120000_member_tiers.sql')
const setTiers = sliceFn(migration, 'create or replace function public.set_member_tiers')
const claim = sliceFn(migration, 'create function public.claim_founding_seat')
const sync = sliceFn(migration, 'create or replace function private.sync_member_tiers')
const counts = sliceFn(migration, 'create or replace function private.founding_counts')
const stats = sliceFn(migration, 'create or replace function private.recompute_platform_stats')

const member = {
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  seat: 'ksa' as const,
  status: 'active' as const,
  invites_remaining: 2,
  invites_granted: 2,
  tier: 'founding' as const,
  tiers: ['founding'],
  founding_number: 7,
}

test('tier set keeps founding and member apart and lets sponsor combine', () => {
  assert.deepEqual(normalizeMembershipTiers(['sponsor', 'founding', 'founding']), ['founding', 'sponsor'])
  assert.equal(membershipTiersInvalid(['founding', 'member']), 'invalid_combination')
  assert.equal(membershipTiersInvalid(['founding', 'sponsor']), null)
  assert.equal(membershipTiersInvalid(['member', 'sponsor']), null)
  assert.equal(membershipTiersInvalid(['sponsor']), null)
  assert.equal(membershipTiersInvalid([]), 'invalid_tier')
  assert.equal(membershipTiersInvalid(['partner']), 'invalid_tier')
  assert.match(migration, /array\['founding', 'member', 'sponsor'\]/)
  assert.match(migration, /raise exception 'invalid_combination'/)
  assert.match(migration, /raise exception 'invalid_tier'/)
  assert.match(setTiers, /'founding' = any \(p_tiers\) and 'member' = any \(p_tiers\)/)
})

test('legacy rows and sponsor seats become a tier set without dropping the tier column', () => {
  assert.match(migration, /where tiers is null/)
  assert.match(migration, /when seat = 'sponsor' and founding_number is not null then array\['founding', 'sponsor'\]/)
  assert.match(migration, /when seat = 'sponsor' then array\['sponsor'\]/)
  assert.match(migration, /when tier = 'member' then array\['member'\]/)
  assert.match(migration, /else array\['founding'\]/)
  assert.match(sync, /new\.tier := 'founding'/)
  assert.match(sync, /new\.tier := 'member'/)
  assert.equal(membershipTiersOf({ seat: 'sponsor', tier: 'founding' }).join(','), 'sponsor')
  assert.equal(membershipTiersOf({ seat: 'ksa', tier: 'member' }).join(','), 'member')
  assert.equal(membershipTiersOf({ seat: 'intl', tier: 'founding', tiers: ['founding', 'sponsor'] }).join(','), 'founding,sponsor')
})

test('set_member_tiers is staff only, fixed search_path, and writes an audit row', () => {
  assert.match(setTiers, /security definer/)
  assert.match(setTiers, /set search_path = public/)
  assert.match(setTiers, /if not private\.is_staff\(\) then/)
  assert.match(setTiers, /raise exception 'not_allowed'/)
  assert.match(setTiers, /insert into public\.member_tier_audits \(member_user_id, actor_id, before_tiers, after_tiers\)/)
  assert.match(setTiers, /auth\.uid\(\), before_tiers, next_tiers/)
  assert.match(migration, /created_at timestamptz not null default now\(\)/)
  assert.match(migration, /actor_id uuid not null/)
  assert.match(migration, /revoke all on function public\.set_member_tiers\(uuid, text\[\]\) from public, anon, service_role/)
  assert.match(migration, /grant execute on function public\.set_member_tiers\(uuid, text\[\]\) to authenticated/)
  assert.equal(setTiers.includes('staff_users'), false)
  assert.equal(/set status|status =/.test(setTiers), false)
  assert.equal(setTiers.includes('cannot_demote_master'), false)
})

test('founding seat is claimed and released, and region capacity stays on the tier set', () => {
  assert.match(claim, /private\.founding_region_taken\(p_seat, null\)/)
  assert.match(claim, /if taken >= 50 then/)
  assert.match(claim, /raise exception 'seat_full'/)
  assert.match(claim, /next_no := private\.next_founding_number\(\)/)
  assert.match(claim, /array\['founding'\]::text\[\]/)
  assert.match(claim, /array\['member'\]::text\[\]/)
  assert.match(claim, /if p_seat not in \('ksa', 'intl'\) then/)
  assert.match(sync, /new\.founding_number := null/)
  assert.match(setTiers, /raise exception 'seat_full'/)
  assert.match(setTiers, /raise exception 'no_region'/)
  assert.match(setTiers, /private\.next_founding_number\(\)/)
  assert.match(setTiers, /founding_number = next_no/)
  assert.match(migration, /raise exception 'founding_numbers_full'/)
  assert.match(counts, /'founding' = any \(tiers\)/)
  assert.equal(counts.includes("tier = 'founding'"), false)
  assert.match(stats, /'founding' = any \(m\.tiers\)/)
  assert.equal(stats.includes("m.tier = 'founding'"), false)
  assert.equal(FOUNDING_REGION_CAP, 50)
  assert.equal(foundingSeatAvailable(49), true)
  assert.equal(foundingSeatAvailable(50), false)
  const rows = [
    { user_id: 'a', seat: 'ksa', status: 'active', tiers: ['founding'] },
    { user_id: 'b', seat: 'ksa', status: 'suspended', tiers: ['founding'] },
    { user_id: 'c', seat: 'ksa', status: 'active', tiers: ['member'] },
    { user_id: 'd', seat: 'ksa', status: 'active', is_demo: true, tiers: ['founding'] },
    { user_id: 'e', seat: 'intl', status: 'active', tiers: ['founding', 'sponsor'] },
  ]
  assert.equal(foundingRegionTaken({ rows, seat: 'ksa' }), 1)
  assert.equal(foundingRegionTaken({ rows, seat: 'ksa', exceptUserId: 'a' }), 0)
  assert.equal(foundingRegionTaken({ rows, seat: 'intl' }), 1)
  assert.equal((migration.match(/create function public\.claim_founding_seat/g) || []).length, 1)
  assert.equal(migration.includes('create or replace function public.claim_founding_seat'), false)
  assert.match(migration, /drop function public\.claim_founding_seat/)
  assert.match(claim, /p_candidate boolean default false/)
})

test('sponsor flow still claims a sponsor seat and the cap counts combined tiers', () => {
  const sponsor = sliceFn(migration, 'create or replace function public.claim_sponsor_seat')
  assert.match(sponsor, /auth\.role\(\) is distinct from 'service_role'/)
  assert.match(sponsor, /array\['sponsor'\]::text\[\]/)
  assert.match(sponsor, /'sponsor'/)
  assert.equal(sponsor.includes('claim_founding_seat'), false)
  assert.match(migration, /raise exception 'sponsor_cap'/)
  const rows = [
    { seat: 'sponsor', status: 'active', tiers: ['sponsor'] },
    { seat: 'ksa', status: 'active', tiers: ['founding', 'sponsor'] },
    { seat: 'intl', status: 'suspended', tiers: ['member', 'sponsor'] },
    { seat: 'intl', status: 'active', tiers: ['member'] },
  ]
  assert.equal(holdsSponsorSeat(rows[0]), true)
  assert.equal(holdsSponsorSeat(rows[1]), true)
  assert.equal(holdsSponsorSeat(rows[2]), false)
  assert.equal(sponsorCapView(rows).taken, 2)
})

test('people card shows tiers, a save control, and mapped errors clear of the right edge', async () => {
  assert.equal(peopleCardLine({ ...member, status: 'active' }), 'Saudi Arabia · Founding No. 7 · active')
  assert.equal(
    peopleCardLine({ ...member, status: 'active', tiers: ['founding', 'sponsor'], founding_number: 7 }),
    'Saudi Arabia · Founding No. 7, Sponsor · active',
  )
  assert.equal(tierSaveError('seat_full'), 'No founding seats left in that region.')
  assert.equal(tierSaveError('invalid_combination'), 'Founding and Member cannot be combined.')
  assert.equal(tierSaveError('not_allowed'), 'You do not have access to change tiers.')
  assert.equal(TIER_SAVE_OK, 'Membership tiers saved.')

  const people = read('src/pages/admin/PeoplePage.tsx')
  assert.match(people, /pe-16/)
  assert.match(people, /staffSetMemberTiers/)
  assert.match(read('src/pages/admin/MembershipTiersControl.tsx'), /Membership tiers/)

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  let before = ''
  let after = ''
  let saving = ''
  let error = ''
  let groupedFounding = ''
  let groupedSponsor = ''
  let groupedMember = ''
  try {
    const controlMod = await vite.ssrLoadModule('/src/pages/admin/MembershipTiersControl.tsx')
    const bitsMod = await vite.ssrLoadModule('/src/pages/admin/bits.tsx')
    const Control = controlMod.MembershipTiersControl
    before = renderToStaticMarkup(
      createElement(Control, {
        member,
        onSave: async () => ({}),
        shot: { saved: ['founding'], selected: ['founding'], phase: 'idle' },
      }),
    )
  assert.match(before, /Membership tiers/)
  assert.match(before, /min-h-11/)
  assert.match(before, /data-tier-badge="founding"/)
  assert.match(before, />Save</)
  assert.equal(before.includes('Saving'), false)

    after = renderToStaticMarkup(
      createElement(Control, {
        member,
        onSave: async () => ({}),
        shot: {
          saved: ['founding', 'sponsor'],
          selected: ['founding', 'sponsor'],
          phase: 'saved',
          message: TIER_SAVE_OK,
        },
      }),
    )
  assert.match(after, /data-tier-badge="sponsor"/)
  assert.match(after, /Membership tiers saved/)

    saving = renderToStaticMarkup(
      createElement(Control, {
        member,
        onSave: async () => ({}),
        shot: { saved: ['founding'], selected: ['founding', 'sponsor'], phase: 'saving' },
      }),
    )
  assert.match(saving, />Saving</)
  assert.match(saving, /aria-busy="true"/)

    error = renderToStaticMarkup(
      createElement(Control, {
        member,
        onSave: async () => ({}),
        shot: {
          saved: ['founding'],
          selected: ['founding', 'member'],
          phase: 'error',
          message: tierSaveError('invalid_combination'),
        },
      }),
    )
  assert.match(error, /role="alert"/)
  assert.match(error, /Founding and Member cannot be combined/)
  assert.equal(error.includes('\u2014') || error.includes('\u2013'), false)

    const grouped = [
      { ...member, email: 'ada@example.com', tiers: ['founding', 'sponsor'] },
      { ...member, user_id: '22222222-2222-4222-8222-222222222222', email: 'beau@example.com', seat: 'intl' as const, tier: 'member' as const, tiers: ['member'], founding_number: null },
    ]
    groupedFounding = bitsMod.peopleInTier('Founding Member', [], grouped).map((row: { email: string }) => row.email).join(',')
    groupedSponsor = bitsMod.peopleInTier('Sponsor', [], grouped).map((row: { email: string }) => row.email).join(',')
    groupedMember = bitsMod.peopleInTier('Member', [], grouped).map((row: { email: string }) => row.email).join(',')
  } finally {
    await vite.close()
  }
  assert.equal(groupedFounding, 'ada@example.com')
  assert.equal(groupedSponsor, 'ada@example.com')
  assert.equal(groupedMember, 'beau@example.com')
})

test('member home, profile, and directory still read tier, founding number, and sponsor seat', () => {
  assert.equal(membershipLine('founding', 7), 'You are Founding Member No. 7.')
  assert.equal(membershipLine('member', null), 'Your Member seat is live.')
  assert.equal(membershipLine('founding', null), '')
  const home = read('src/pages/dashboard/DashboardHome.tsx')
  const layout = read('src/pages/dashboard/DashboardLayout.tsx')
  const profile = read('src/pages/dashboard/ProfilePage.tsx')
  const directory = read('src/pages/dashboard/DirectoryBoard.tsx')
  assert.match(home, /membershipLine\(member\.tier, member\.founding_number\)/)
  assert.match(home, /tier=\{member\.tier\}/)
  assert.match(home, /foundingNumber=\{member\.founding_number\}/)
  assert.match(layout, /founding_number, tier/)
  assert.match(profile, /member\.seat === 'sponsor'/)
  assert.match(directory, /card\.seat === 'sponsor'/)
})

test('with the two tier flag off, /apply posts to submit-application', async () => {
  setTwoTierRegisterForTests(false)
  try {
    const app = read('src/App.tsx')
    const apply = read('src/pages/ApplyPage.tsx')
    const submit = read('src/lib/supabase.ts')
    const gate = read('src/lib/twoTierRegister.ts')
    assert.equal(publicConsiderationCta(false).to, '/apply')
    assert.equal(publicConsiderationCta(false).label, 'Apply for consideration')
    assert.equal(lineOf(app, 'path="/apply" element={<ApplyPage />}'), 91)
    assert.equal(lineOf(apply, 'submitApplication('), 144)
    assert.equal(lineOf(submit, '/submit-application'), 161)
    assert.equal(lineOf(gate, "return { to: '/apply', label: 'Apply for consideration' }"), 27)
    assert.equal(/register-candidate|registerCandidate/.test(apply), false)
    for (const file of [
      'src/components/Nav.tsx',
      'src/components/Footer.tsx',
      'src/components/CtaBand.tsx',
      'src/components/landing/StickyApply.tsx',
    ]) {
      const source = read(file)
      assert.match(source, /publicConsiderationCta\(/)
      assert.equal(source.includes('"/register"'), false, file)
    }

    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
    process.env.VITE_TWO_TIER_REGISTER_ENABLED = 'false'
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
      logLevel: 'error',
    })
    try {
      const applyMod = await vite.ssrLoadModule('/src/pages/ApplyPage.tsx')
      const html = renderToStaticMarkup(
        createElement(MemoryRouter, { initialEntries: ['/apply'] }, createElement(applyMod.ApplyPage)),
      )
      assert.match(html, /Submit for consideration/)
      assert.equal(html.includes('register-candidate'), false)
      assert.equal(html.includes('/register'), false)
    } finally {
      await vite.close()
    }
  } finally {
    setTwoTierRegisterForTests(null)
  }
})

test('tier files carry no secrets, mailboxes, or dash punctuation', () => {
  const files = [
    migration,
    read('src/lib/membershipTiers.ts'),
    read('src/pages/admin/MembershipTiersControl.tsx'),
    read('src/pages/admin/PeoplePage.tsx'),
    read('scripts/tiers-preview/main.tsx'),
  ]
  for (const source of files) {
    assert.equal(source.includes('\u2014') || source.includes('\u2013'), false)
    assert.equal(/sk_live|eyJ|SUPABASE_SERVICE|PRIVATE_BOOKING|service_role key/i.test(source), false)
    assert.equal(/[A-Z0-9._%+-]+@(?!example\.com)[A-Z0-9.-]+\.[A-Z]{2,}/i.test(source), false)
    assert.equal(/calendar\.app\.google|nammco/i.test(source), false)
  }
  const review = read('supabase/functions/review-membership/index.ts')
  const invite = read('supabase/functions/invite-sponsor/index.ts')
  assert.match(review, /transition_candidate/)
  assert.match(invite, /claim_sponsor_seat/)
  assert.equal(migration.includes('supabase/functions'), false)
})

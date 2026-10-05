import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  nextWeeklyInviteRemaining,
  refillAuthorized,
  WEEKLY_INVITE_CAP,
} from '../supabase/functions/_shared/invite_refill.ts'
import {
  PUBLIC_CHECKS_NOT_RUN,
  publicChecksNotRun,
  publicConsistencyLabel,
} from '../supabase/functions/_shared/due_diligence.ts'
import { presentDirectoryCard } from '../src/lib/demoRows.ts'
import { readinessLines } from '../src/lib/reOpportunityView.ts'
import { formatUkDateTime } from '../src/lib/ukDate.ts'
import { PLATFORM_TOTALS_NOTE } from '../src/lib/capacity.ts'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

test('weekly refill restores to 2, never above 2, and skips sponsors and a flag that is off', () => {
  assert.equal(WEEKLY_INVITE_CAP, 2)
  assert.equal(nextWeeklyInviteRemaining({ seat: 'ksa', remaining: 0, granted: 2 }, true), 2)
  assert.equal(nextWeeklyInviteRemaining({ seat: 'intl', remaining: 1, granted: 2 }, true), 2)
  assert.equal(nextWeeklyInviteRemaining({ seat: 'ksa', remaining: 2, granted: 2 }, true), 2)
  assert.equal(nextWeeklyInviteRemaining({ seat: 'ksa', remaining: 0, granted: 2 }, false), 0)
  assert.equal(nextWeeklyInviteRemaining({ seat: 'sponsor', remaining: 0, granted: 0 }, true), 0)
  assert.equal(nextWeeklyInviteRemaining({ seat: 'sponsor', remaining: 0, granted: 2 }, true), 0)
  assert.equal(refillAuthorized('', 'secret'), false)
  assert.equal(refillAuthorized('secret', ''), false)
  assert.equal(refillAuthorized('secret', 'secret'), true)
  assert.equal(refillAuthorized('secret', 'other'), false)

  const sql = read('supabase/migrations/20261121120000_weekly_peer_invite_refill.sql')
  assert.match(sql, /function public\.refill_weekly_peer_invites/)
  assert.match(sql, /set_config\('board\.invite_release', 'on', true\)/)
  assert.match(sql, /current_setting\('board\.invite_release', true\)/)
  assert.match(sql, /seat in \('ksa', 'intl'\)/)
  assert.match(sql, /least\(2, m\.invites_granted\)/)
  assert.match(sql, /grant execute on function public\.refill_weekly_peer_invites\(boolean\) to service_role/)
  assert.equal(/grant execute on function public\.refill_weekly_peer_invites\(boolean\) to anon/.test(sql), false)
  assert.match(sql, /'membership_status', m\.status/)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)

  const edge = read('supabase/functions/refill-weekly-invites/index.ts')
  const config = read('supabase/config.toml')
  assert.match(edge, /INVITE_WEEKLY_REFILL_SECRET/)
  assert.match(edge, /INVITE_WEEKLY_REFILL_HEADER/)
  assert.match(edge, /refillAuthorized/)
  assert.match(read('supabase/functions/_shared/invite_refill.ts'), /x-invite-weekly-refill/)
  assert.match(edge, /dry_run/)
  assert.match(edge, /p_apply: !dry/)
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.equal(edge.includes('Authorization'), false)
  assert.match(config, /\[functions\.refill-weekly-invites\]\s+verify_jwt = false/)
  assert.match(config, /An unset secret rejects every call/)
})

test('public checks that did not run are not called 0 percent', () => {
  const skipped = {
    publicly_consistent_pct: 0,
    not_publicly_verifiable_pct: 100,
    sources: [],
    claims: [{ verdict: 'insufficient_public_data' }],
  }
  assert.equal(publicChecksNotRun(skipped), true)
  assert.equal(publicConsistencyLabel(skipped), PUBLIC_CHECKS_NOT_RUN)
  assert.equal(publicConsistencyLabel(skipped).includes('0%'), false)
  const ran = {
    publicly_consistent_pct: 0,
    sources: [{ url: 'https://example.com/note' }],
    claims: [{ verdict: 'not_publicly_verifiable' }],
  }
  assert.equal(publicChecksNotRun(ran), false)
  assert.equal(publicConsistencyLabel(ran), '0% publicly consistent')
  assert.equal(publicConsistencyLabel({ publicly_consistent_pct: null }), 'No percentage')
})

test('directory invited peers are labelled and Riaydh displays as Riyadh', () => {
  const invited = presentDirectoryCard({
    id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Faith Example',
    seat: 'intl',
    location: 'Riaydh',
    membership_status: 'invited',
    is_demo: false,
  })
  assert.ok(invited)
  assert.equal(invited.membership_status, 'invited')
  assert.equal(invited.location, 'Riyadh')
  const active = presentDirectoryCard({
    id: '22222222-2222-4222-8222-222222222222',
    full_name: 'Michael Example',
    seat: 'intl',
    location: 'Riyadh',
    membership_status: 'active',
  })
  assert.equal(active?.membership_status, 'active')
  assert.equal(active?.location, 'Riyadh')
})

test('white land ready reads None and staff dates use a UK stamp', () => {
  const lines = readinessLines({
    foreign_ownership_path: 'ready',
    escrow_off_plan: 'not_yet',
    title_clarity: 'in_progress',
    white_land_exposure: 'ready',
  })
  assert.ok(lines.includes('White Land exposure: None'))
  assert.equal(lines.some((line) => line.startsWith('White Land exposure: Ready')), false)
  assert.equal(formatUkDateTime('2026-09-22T11:34:00.000Z'), '22 Sept 2026, 14:34')
  assert.equal(formatUkDateTime('not-a-date'), '')
})

test('apply capacity starts unticked and names the private invite email', () => {
  const apply = read('src/pages/ApplyPage.tsx')
  assert.match(apply, /includeInPublic: false/)
  assert.match(apply, /PLATFORM_TOTALS_NOTE/)
  assert.match(apply, /private invite email/)
  assert.equal(apply.includes('That link is not on this website'), false)
  assert.equal(apply.includes('private conversation invite'), false)
  assert.match(apply, /size-6/)
  assert.match(apply, /min-h-11/)
  assert.equal(PLATFORM_TOTALS_NOTE.includes('\u2014'), false)
  const profile = read('src/pages/dashboard/ProfilePage.tsx')
  assert.match(profile, /include_in_public_aggregates !== false/)
  assert.match(profile, /PLATFORM_TOTALS_NOTE/)
  const login = read('src/pages/LoginPage.tsx')
  assert.match(login, /Staff sign in \| Board Arabia/)
  assert.match(login, /staffEntry \? 'Staff sign in'/)
  assert.equal(login.includes('Member login'), false)
  const apps = read('src/pages/admin/ApplicationsPage.tsx')
  assert.match(apps, /formatUkDateTime/)
  assert.equal(apps.includes('invite_event_id'), false)
  assert.equal(apps.includes('toLocaleString()'), false)
})

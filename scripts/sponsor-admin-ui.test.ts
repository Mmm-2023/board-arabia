import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { adminMemberLine, seatLabel } from '../src/lib/member.ts'
import {
  firmByUserId,
  sponsorAddDisabled,
  sponsorCapCopy,
  sponsorCapView,
  sponsorListRows,
  sponsorSeatHolders,
  SPONSOR_CAP,
} from '../src/lib/sponsorSeat.ts'

const people = readFileSync(new URL('../src/pages/admin/PeoplePage.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/pages/admin/SponsorInvitePanel.tsx', import.meta.url), 'utf8')
const invite = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../src/pages/dashboard/DashboardHome.tsx', import.meta.url), 'utf8')
const profile = readFileSync(new URL('../src/pages/dashboard/ProfilePage.tsx', import.meta.url), 'utf8')
const badge = readFileSync(new URL('../src/components/SponsorBadge.tsx', import.meta.url), 'utf8')
const bits = readFileSync(new URL('../src/pages/admin/bits.tsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../src/pages/admin/AdminLayout.tsx', import.meta.url), 'utf8')

function sliceExport(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}`)
  assert.ok(start >= 0, name)
  const next = source.indexOf('\nexport ', start + 10)
  return source.slice(start, next === -1 ? undefined : next)
}

test('seat labels keep sponsor off the International founding label', () => {
  assert.equal(seatLabel('ksa'), 'Saudi Arabia')
  assert.equal(seatLabel('intl'), 'International')
  assert.equal(seatLabel('sponsor'), 'Sponsor')
  assert.notEqual(seatLabel('sponsor'), 'International')
  assert.equal(seatLabel('staff'), 'Unknown seat')
  assert.equal(seatLabel(null), 'Unknown seat')
  assert.equal(seatLabel(undefined), 'Unknown seat')
  assert.equal(adminMemberLine('sponsor', 'invited'), 'Sponsor · invited')
  assert.equal(adminMemberLine('intl', 'active'), 'International · Founding Member · active')
  assert.equal(adminMemberLine('ksa', 'active'), 'Saudi Arabia · Founding Member · active')
  assert.equal(home.includes("seat === 'ksa' ? 'Saudi Arabia' : 'International'"), false)
  assert.match(home, /member\.seat === 'sponsor' \? 'Seat' : 'Founding seat'/)
  assert.match(home, /<SponsorBadge \/>/)
  assert.match(profile, /<SponsorBadge \/>/)
  assert.match(badge, /data-seat-badge="sponsor"/)
  assert.match(badge, /--ba-indigo/)
  assert.match(badge, /--ba-lavender-mist/)
})

test('sponsor cap state disables Add Sponsor at 3 invited or active seats', () => {
  const open = [
    { user_id: 's1', email: 'sponsor@example.com', seat: 'sponsor', status: 'active' },
    { user_id: 's2', email: 'sponsor.two@example.com', seat: 'sponsor', status: 'invited' },
    { user_id: 'k1', email: 'member@example.com', seat: 'ksa', status: 'active' },
    { user_id: 's3', email: 'sponsor.suspended@example.com', seat: 'sponsor', status: 'suspended' },
  ]
  const room = sponsorCapView(open)
  assert.equal(SPONSOR_CAP, 3)
  assert.equal(room.taken, 2)
  assert.equal(room.remaining, 1)
  assert.equal(room.full, false)
  assert.equal(sponsorAddDisabled({ capKnown: true, full: room.full, submitting: false }), false)
  assert.equal(
    sponsorCapCopy({ capKnown: true, countError: false, full: false, remaining: 1, cap: 3 }),
    '1 sponsor seat remaining this year. This invite does not use a founding seat.',
  )
  assert.equal(sponsorSeatHolders(open).map((row) => row.user_id).join(','), 's1,s2')

  const fullRows = [
    ...open,
    { user_id: 's4', email: 'sponsor.three@example.com', seat: 'sponsor', status: 'active' },
  ]
  const full = sponsorCapView(fullRows)
  assert.equal(full.taken, 3)
  assert.equal(full.remaining, 0)
  assert.equal(full.full, true)
  assert.equal(sponsorAddDisabled({ capKnown: true, full: true, submitting: false }), true)
  assert.equal(sponsorAddDisabled({ capKnown: false, full: false, submitting: false }), true)
  assert.equal(sponsorAddDisabled({ capKnown: true, full: false, submitting: true }), true)
  assert.match(sponsorCapCopy({ capKnown: true, countError: false, full: true, remaining: 0, cap: 3 }), /All 3 sponsor seats/)
  assert.match(
    sponsorCapCopy({ capKnown: false, countError: true, full: false, remaining: 3, cap: 3 }),
    /could not be counted/i,
  )

  const firms = firmByUserId({
    s1: { company: ' Example Ledger ' },
    s2: { company: '  ' },
    s3: { company: 'Should stay off the seat list' },
  })
  const listed = sponsorListRows(fullRows, firms)
  assert.deepEqual(
    listed.map((row) => row.firm),
    ['Example Ledger', null, null],
  )
  assert.equal(listed.some((row) => row.status === 'suspended'), false)
  assert.equal(listed.some((row) => row.email === 'member@example.com'), false)
})

test('Add Sponsor calls invite-sponsor with the staff session and does not take a founding seat', () => {
  const fn = sliceExport(invite, 'inviteSponsor')
  assert.match(fn, /\/invite-sponsor/)
  assert.match(fn, /staffHeaders\(/)
  assert.match(fn, /seat: 'sponsor'/)
  assert.match(fn, /company: input\.company\.trim\(\)/)
  assert.equal(fn.includes('claim_founding_seat'), false)
  assert.equal(fn.includes('admit-member'), false)
  assert.equal(fn.includes('invite-master'), false)
  assert.match(people, /inviteSponsor\(/)
  assert.match(people, /Add Sponsor|SponsorInvitePanel/)
  assert.match(panel, /Add Sponsor/)
  assert.match(panel, /Firm name/)
  assert.match(panel, /Sending invite/)
  assert.match(panel, /role="alert"/)
  assert.match(panel, /disabled=\{addDisabled\}/)
  assert.equal(panel.includes('claim_founding_seat'), false)
  assert.equal(panel.includes('from(\'staff_users\')'), false)
  assert.match(bits, /sponsorSeatHolders/)
  assert.equal(bits.includes('The sponsor portal is not open'), false)
  assert.match(layout, /clientAdminGate/)
  assert.equal(people.includes('staff allowlist'), false)
})

test('sponsor admin copy has no em dash and no live mailbox', () => {
  const files = [people, panel, home, profile, badge, bits]
  for (const source of files) {
    assert.equal(source.includes('\u2014'), false)
    assert.equal(/calendar\.app\.google|nammco/i.test(source), false)
    assert.equal(source.includes('SUPABASE_SERVICE_ROLE'), false)
  }
  assert.equal(/[A-Z0-9._%+-]+@(?!example\.com)[A-Z0-9.-]+\.[A-Z]{2,}/i.test(panel), false)
  assert.equal(/[A-Z0-9._%+-]+@(?!example\.com)[A-Z0-9.-]+\.[A-Z]{2,}/i.test(people), false)
})

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { buildRfc822 } from '../supabase/functions/_shared/mail.ts'
import {
  FOUNDING_PRIORITY_MS,
  MAJLIS_REGIONS,
  REGION_GEOTAG,
  buildMajlisIcs,
  googleCalendarUrl,
  rsvpDecision,
  rsvpTier,
} from '../supabase/functions/_shared/majlis.ts'
import {
  eventCancelledLetter,
  eventUpdatedLetter,
  guestCancelledLetter,
  guestPromotedLetter,
  guestRegisteredLetter,
  guestWaitlistLetter,
  hostRsvpLetter,
  includeVenueAddress,
  reminderLetter,
} from '../supabase/functions/_shared/majlis_mail.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const event = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Chairs circle',
  region: 'Riyadh',
  starts_at: '2026-10-02T15:30:00.000Z',
  ends_at: '2026-10-02T17:00:00.000Z',
  venue_name: 'House',
  venue_address: 'Olaya',
  venue_visibility: 'members_on_rsvp',
  capacity: 2,
}
const memberId = '22222222-2222-4222-8222-222222222222'
const site = 'https://boardarabia.com'

test('founding window is 48 hours and blocks general members only', () => {
  assert.equal(FOUNDING_PRIORITY_MS, 48 * 60 * 60 * 1000)
  assert.equal(rsvpTier('ksa'), 'founding')
  assert.equal(rsvpTier('intl'), 'founding')
  assert.equal(rsvpTier('sponsor'), 'sponsor')
  assert.equal(rsvpTier('general'), 'member')
  const opens = Date.parse('2026-10-01T12:00:00.000Z')
  const ends = opens + FOUNDING_PRIORITY_MS
  const base = {
    tier: 'member' as const,
    isHost: false,
    opensMs: opens,
    priorityEndsMs: ends,
    capacity: 2,
    registeredCount: 0,
    current: null,
    waitlistCount: 0,
  }
  assert.equal(rsvpDecision({ ...base, action: 'register', nowMs: opens + 1000 }).ok, false)
  const later = rsvpDecision({ ...base, action: 'register', nowMs: ends })
  assert.equal(later.ok && later.status, 'registered')
  const founding = rsvpDecision({
    ...base,
    tier: 'founding',
    action: 'register',
    nowMs: opens + 1000,
  })
  assert.equal(founding.ok && founding.status, 'registered')
  const sponsor = rsvpDecision({ ...base, tier: 'sponsor', action: 'register', nowMs: ends + 1 })
  assert.equal(sponsor.ok, false)
  const host = rsvpDecision({ ...base, tier: 'founding', isHost: true, action: 'register', nowMs: ends })
  assert.equal(host.ok, false)
})

test('capacity sends a full majlis to the waitlist and cancel can promote', () => {
  const full = rsvpDecision({
    action: 'register',
    tier: 'founding',
    isHost: false,
    nowMs: 10,
    opensMs: 0,
    priorityEndsMs: 5,
    capacity: 1,
    registeredCount: 1,
    current: null,
    waitlistCount: 0,
  })
  assert.equal(full.ok && full.status, 'waitlist')
  assert.equal(full.ok && full.waitlistPosition, 1)
  const cancel = rsvpDecision({
    action: 'cancel',
    tier: 'founding',
    isHost: false,
    nowMs: 10,
    opensMs: 0,
    priorityEndsMs: 5,
    capacity: 1,
    registeredCount: 1,
    current: 'registered',
    waitlistCount: 1,
  })
  assert.equal(cancel.ok && cancel.promoteWaitlist, true)
  const promote = rsvpDecision({
    action: 'promote',
    tier: 'founding',
    isHost: false,
    nowMs: 1,
    opensMs: 0,
    priorityEndsMs: 5,
    capacity: 2,
    registeredCount: 1,
    current: 'waitlist',
    waitlistCount: 1,
  })
  assert.equal(promote.ok && promote.status, 'registered')
})

test('confirmation mail has ICS, Google Calendar, Riyadh time, and no guest list', () => {
  const letter = guestRegisteredLetter(site, event, memberId)
  assert.match(letter.text, /Asia\/Riyadh/)
  assert.match(letter.text, /calendar\.google\.com\/calendar\/render/)
  assert.match(letter.text, /action=TEMPLATE/)
  const unfolded = letter.ics.replace(/\r\n[ \t]/g, '')
  assert.match(letter.ics, /BEGIN:VCALENDAR/)
  assert.match(unfolded, new RegExp(`UID:${event.id}-${memberId}@boardarabia.com`))
  assert.equal((unfolded.match(/@/g) ?? []).length, 1)
  assert.equal(letter.text.includes('Olaya'), true)
  const waiting = guestWaitlistLetter(site, event, 2)
  assert.equal(waiting.text.includes('Olaya'), false)
  assert.equal(includeVenueAddress(event, false), false)
  assert.equal(includeVenueAddress({ ...event, venue_visibility: 'members_always' }, false), true)
  const promoted = guestPromotedLetter(site, event, memberId)
  assert.match(promoted.ics, /BEGIN:VEVENT/)
  for (const body of [
    letter.text,
    letter.html,
    waiting.text,
    guestCancelledLetter(site, event).text,
    hostRsvpLetter(site, event, 'A member', 'registered', 1, 0).text,
    reminderLetter(site, event, 't7').text,
    reminderLetter(site, event, 't1').text,
    eventCancelledLetter(site, event, 'The room is unavailable.').text,
    eventUpdatedLetter(site, event, true).text,
    promoted.text,
  ]) {
    assert.equal(body.includes('\u2014'), false)
    assert.equal(body.includes('\u2013'), false)
    assert.match(body, /Board Arabia/)
    assert.equal(/<img\b/i.test(body), false)
  }
  assert.match(letter.text, /Board Arabia\s*$/)
  assert.match(letter.html, /<footer>Board Arabia<\/footer>\s*$/)
  const google = googleCalendarUrl({
    title: event.title,
    startsAtUtc: event.starts_at,
    endsAtUtc: event.ends_at,
    details: 'Private majlis',
    location: 'House',
  })
  assert.equal(google.includes('email='), false)
  const ics = buildMajlisIcs({
    eventId: event.id,
    memberId,
    title: event.title,
    description: 'Region: Riyadh. Asia/Riyadh.',
    location: 'House',
    startsAtUtc: event.starts_at,
    endsAtUtc: event.ends_at,
    nowIso: '2026-10-01T00:00:00.000Z',
  })
  const unfoldedIcs = ics.replace(/\r\n[ \t]/g, '')
  assert.equal((unfoldedIcs.match(/@/g) ?? []).length, 1)
  assert.match(unfoldedIcs, /@boardarabia\.com/)
})

test('ICS attachment stays out of the plain alternative when absent', () => {
  const raw = buildRfc822({
    from: '"Board Arabia" <ops@example.com>',
    to: 'person@example.com',
    subject: 'Board Arabia: you are registered',
    text: 'You are registered for the chairs circle in Riyadh.\n\nBoard Arabia',
    html: '<p>You are registered for the chairs circle in Riyadh.</p>\n<footer>Board Arabia</footer>',
    attachments: [{ filename: 'majlis.ics', contentType: 'text/calendar; charset=UTF-8', content: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' }],
  })
  assert.match(raw, /multipart\/mixed/)
  assert.match(raw, /filename="majlis.ics"/)
  assert.equal(raw.includes('\u2014'), false)
})

test('new migration does not rewrite the live base file and keeps sponsor reads free of guest PII', () => {
  const base = readFileSync(path.join(root, 'supabase/migrations/20260925150000_majlis_events.sql'), 'utf8')
  assert.match(base, /No RSVP table/)
  const sql = readFileSync(path.join(root, 'supabase/migrations/20260926103000_majlis_rsvp.sql'), 'utf8')
  assert.match(sql, /for update/)
  assert.match(sql, /founding_window/)
  assert.match(sql, /majlis_rsvps_event_member_uid/)
  assert.match(sql, /interval '48 hours'/)
  assert.equal(/insert\s+into\s+public\.majlis_events\s*\(/i.test(sql), false)
  const prelude = sql.split('create or replace function public.majlis_consume_rsvp_slot')[0] ?? ''
  assert.equal(/insert\s+into\s+public\.majlis_rsvps/i.test(prelude), false)
  const sponsor = sql.split('create or replace view public.majlis_events_sponsor')[1]?.split('revoke all on table public.majlis_events_sponsor')[0] ?? ''
  assert.notEqual(sponsor, '')
  assert.equal(/venue_address|host_member_id|rejection_feedback|full_name|\bemail\b/i.test(sponsor), false)
  assert.match(sponsor, /seat = 'sponsor'/)
  const roster = sql.split('create or replace view public.majlis_roster')[1] ?? ''
  assert.match(roster, /viewer\.seat = 'sponsor'/)
  assert.match(roster, /not exists/)
  assert.match(sql, /e\.host_member_id = auth\.uid\(\)/)
  for (const region of MAJLIS_REGIONS) {
    assert.equal(sql.includes(`'${region}'`), true)
    const geo = REGION_GEOTAG[region]
    assert.equal(sql.includes(geo.lat.toFixed(4)), true)
    assert.equal(sql.includes(geo.lng.toFixed(4)), true)
  }
  assert.equal(sql.includes('\u2014'), false)
})

test('client majlis surfaces avoid secrets, em dashes, and sponsor deny', () => {
  const files = [
    'src/pages/dashboard/MajlisPage.tsx',
    'src/pages/admin/MajlisPage.tsx',
    'src/components/majlis/KsaRegionMap.tsx',
    'src/lib/supabase.ts',
  ]
  const bundled = files.map((file) => readFileSync(path.join(root, file), 'utf8')).join('\n')
  const page = readFileSync(path.join(root, 'src/pages/dashboard/MajlisPage.tsx'), 'utf8')
  assert.equal(bundled.includes('\u2014'), false)
  assert.equal(/nammco/i.test(bundled), false)
  assert.equal(/service_role|SUPABASE_SERVICE_ROLE|sk_live|ya29\./i.test(bundled), false)
  assert.equal(/calendar\.app\.google/i.test(bundled), false)
  assert.match(bundled, /Join waitlist/)
  assert.match(bundled, /Cancel registration/)
  assert.match(bundled, /Founding priority until/)
  assert.match(bundled, /Regional activity for sponsors/)
  assert.match(bundled, /aria-label="Focus filters"/)
  assert.match(bundled, /aria-label="Region filters"/)
  assert.match(bundled, /Map activity/)
  assert.match(bundled, /All events/)
  assert.match(bundled, /Coming soon/)
  assert.match(bundled, /The regional map is not available yet/)
  assert.match(bundled, /blur-lg/)
  assert.match(bundled, /pointer-events-none/)
  assert.match(bundled, /Needs attention/)
  assert.match(page, /comingSoon/)
  assert.match(page, /Step \{step\} of 3/)
  assert.match(page, /Application submitted/)
  const memberBody = page.split('function PageJump')[0] ?? ''
  const mineAt = memberBody.indexOf('majlis-mine-title')
  const applyAt = memberBody.indexOf('<ApplyForm')
  const mapAt = memberBody.indexOf('majlis-map-title')
  assert.ok(mineAt >= 0 && applyAt > mineAt && mapAt > applyAt)
  const admin = readFileSync(path.join(root, 'src/pages/admin/MajlisPage.tsx'), 'utf8')
  assert.match(admin, /comingSoon/)
  const adminBody = admin.split('function Field')[0] ?? ''
  const pendingAt = adminBody.indexOf('admin-majlis-pending')
  const adminMapAt = adminBody.indexOf('admin-majlis-map')
  assert.ok(pendingAt >= 0 && adminMapAt > pendingAt)
  assert.match(bundled, /members_on_rsvp/)
  assert.equal(bundled.includes('PermissionState'), false)
  assert.equal(page.includes('fetchMajlisRoster'), true)
  const sponsorBranch = page.split('function SponsorCard')[1]?.split('function MemberCard')[0] ?? ''
  assert.equal(sponsorBranch.includes('fetchMajlisRoster'), false)
  assert.equal(sponsorBranch.includes('venue_address'), false)
  assert.equal(sponsorBranch.includes('email'), false)
  for (const region of MAJLIS_REGIONS) assert.equal(page.includes('MAJLIS_REGIONS') || page.includes(region), true)
})

test('edge mail path reads From from the environment and does not embed a mailbox', () => {
  const dir = path.join(root, 'supabase/functions')
  const chunks: string[] = []
  function walk(folder: string) {
    for (const entry of readdirSync(folder)) {
      const full = path.join(folder, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.ts')) chunks.push(readFileSync(full, 'utf8'))
    }
  }
  walk(dir)
  const source = chunks.join('\n')
  assert.equal(/cindy@/i.test(source), false)
  assert.equal(/sk_live|ya29\.|PRIVATE_BOOKING_LINK\s*=\s*['"]https/i.test(source), false)
  assert.match(readFileSync(path.join(dir, 'majlis-reminders/index.ts'), 'utf8'), /MAJLIS_CRON_SECRET/)
  assert.match(readFileSync(path.join(dir, 'majlis-rsvp/index.ts'), 'utf8'), /p_member: user\.id/)
  assert.equal(/body\.member_id/.test(readFileSync(path.join(dir, 'majlis-rsvp/index.ts'), 'utf8')), false)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildMajlisIcs,
  canonicalMeetUrl,
  icsMeetLink,
  validateMajlisApplication,
  virtualMemberCap,
  VIRTUAL_MEET_PARTICIPANT_CAP,
} from '../supabase/functions/_shared/majlis.ts'
import {
  buildMajlisGoogleEventBody,
  majlisOAuthConsentUrl,
  majlisTokenRequestBody,
  MAJLIS_CALENDAR_SCOPE,
  performMajlisGoogleSync,
  readMajlisGoogleSecrets,
  type MajlisCalendarEvent,
} from '../supabase/functions/_shared/majlis_calendar.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationName = '20270102120000_majlis_virtual_meet.sql'
const sampleMeet = `https://meet.google.com/${'abc-defg-hij'}`

const baseEvent = {
  title: 'Chairs circle',
  description: 'A private salon.',
  region: 'Riyadh',
  focusTags: ['Governance'],
  startsAtUtc: '2026-11-20T15:00:00.000Z',
  endsAtUtc: '2026-11-20T16:30:00.000Z',
  capacity: 12,
  venueName: 'House',
  venueAddress: 'Example street',
}

function virtualEvent(over: Partial<MajlisCalendarEvent> = {}): MajlisCalendarEvent {
  return {
    id: '20000000-0000-4000-8000-000000000010',
    title: 'Chairs circle',
    description: 'A private salon.',
    region: 'Riyadh',
    starts_at: '2026-11-20T15:00:00.000Z',
    ends_at: '2026-11-20T16:30:00.000Z',
    format: 'virtual',
    status: 'published',
    google_event_id: null,
    google_meet_url: null,
    meet_fallback_url: null,
    ...over,
  }
}

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('virtual seats stay within 150 and the migration matches the helper', () => {
  assert.equal(VIRTUAL_MEET_PARTICIPANT_CAP, 150)
  assert.equal(virtualMemberCap(null) + 1, 150)
  assert.equal(virtualMemberCap('10000000-0000-4000-8000-000000000001') + 2, 150)
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.match(sql, /p_host is null then 149 else 148/)
  assert.match(sql, /seat_cap := least\(ev\.capacity, private\.majlis_virtual_member_cap/)
  assert.match(sql, /registered_n >= seat_cap/)
  assert.match(sql, /registered_n < seat_cap/)
  const rsvp = read('scripts/majlis-calendar-rsvp.test.ts')
  assert.match(rsvp, /virtual staff room did not waitlist at 150/)
  assert.match(rsvp, /virtual hosted room did not waitlist at 150/)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(/aal2/i.test(sql), false)
  const tooMany = validateMajlisApplication({ ...baseEvent, format: 'virtual', venueName: 'Google Meet', venueAddress: '', capacity: 150 })
  assert.equal(tooMany.ok, false)
  const ok = validateMajlisApplication({ ...baseEvent, format: 'virtual', venueName: 'Google Meet', venueAddress: '', capacity: 149 })
  assert.equal(ok.ok, true)
  const inPerson = validateMajlisApplication({ ...baseEvent, venueAddress: '' })
  assert.equal(inPerson.ok, false)
})

test('Meet links are canonical and the member file hides them after the event', () => {
  assert.equal(canonicalMeetUrl(sampleMeet), sampleMeet)
  assert.equal(canonicalMeetUrl(`${sampleMeet}?hs=1`), null)
  assert.equal(canonicalMeetUrl('http://meet.google.com/abc-defg-hij'), null)
  assert.equal(canonicalMeetUrl('https://example.com/abc-defg-hij'), null)
  assert.equal(canonicalMeetUrl('https://meet.google.com.evil.example/abc-defg-hij'), null)
  const future = '2026-11-20T16:30:00.000Z'
  const link = icsMeetLink({
    format: 'virtual',
    status: 'published',
    ends_at: future,
    google_meet_url: sampleMeet,
    meet_fallback_url: null,
  }, Date.parse('2026-11-01T00:00:00.000Z'))
  assert.equal(link, sampleMeet)
  const fallback = icsMeetLink({
    format: 'virtual',
    status: 'published',
    ends_at: future,
    google_meet_url: null,
    meet_fallback_url: sampleMeet,
  }, Date.parse('2026-11-01T00:00:00.000Z'))
  assert.equal(fallback, sampleMeet)
  assert.equal(icsMeetLink({
    format: 'virtual',
    status: 'published',
    ends_at: future,
    google_meet_url: sampleMeet,
  }, Date.parse('2026-11-21T00:00:00.000Z')), null)
  assert.equal(icsMeetLink({
    format: 'virtual',
    status: 'cancelled',
    ends_at: future,
    google_meet_url: sampleMeet,
  }, Date.parse('2026-11-01T00:00:00.000Z')), null)
  assert.equal(icsMeetLink({
    format: 'in_person',
    status: 'published',
    ends_at: future,
    google_meet_url: sampleMeet,
  }, Date.parse('2026-11-01T00:00:00.000Z')), null)
  const ics = buildMajlisIcs({
    eventId: '20000000-0000-4000-8000-000000000010',
    memberId: '10000000-0000-4000-8000-000000000002',
    title: 'Chairs circle',
    description: `Join: ${sampleMeet}`,
    location: sampleMeet,
    startsAtUtc: '2026-11-20T15:00:00.000Z',
    endsAtUtc: future,
    url: sampleMeet,
    nowIso: '2026-11-01T00:00:00.000Z',
  })
  const unfolded = ics.replace(/\r\n[ \t]/g, '')
  assert.equal(/ATTENDEE/i.test(unfolded), false)
  assert.match(unfolded, new RegExp(`URL:${sampleMeet.replaceAll('/', '\\/')}`))
  const plain = buildMajlisIcs({
    eventId: '20000000-0000-4000-8000-000000000010',
    memberId: '10000000-0000-4000-8000-000000000002',
    title: 'Chairs circle',
    description: 'Chairs circle. Region: Riyadh.',
    location: 'House',
    startsAtUtc: '2026-11-20T15:00:00.000Z',
    endsAtUtc: future,
  })
  assert.equal(/URL:/i.test(plain), false)
  assert.equal(/ATTENDEE/i.test(plain), false)
})

test('Google sync uses one scope, adds no guests, and fails closed without secrets', async () => {
  assert.equal(MAJLIS_CALENDAR_SCOPE, 'https://www.googleapis.com/auth/calendar.app.created')
  assert.equal(readMajlisGoogleSecrets(() => undefined), null)
  assert.equal(readMajlisGoogleSecrets((name) => name === 'GOOGLE_MAJLIS_CLIENT_ID' ? 'id' : undefined), null)
  const secrets = readMajlisGoogleSecrets((name) => {
    if (name === 'GOOGLE_MAJLIS_CLIENT_ID') return 'client-example'
    if (name === 'GOOGLE_MAJLIS_CLIENT_SECRET') return 'secret-example'
    if (name === 'GOOGLE_MAJLIS_REFRESH_TOKEN') return 'refresh-example'
    return undefined
  })
  assert.ok(secrets)
  const tokenBody = majlisTokenRequestBody(secrets)
  assert.deepEqual([...tokenBody.keys()].sort(), ['client_id', 'client_secret', 'grant_type', 'refresh_token'])
  assert.equal(tokenBody.get('grant_type'), 'refresh_token')
  assert.equal(tokenBody.has('scope'), false)
  const consent = new URL(majlisOAuthConsentUrl('client-example', 'http://127.0.0.1'))
  assert.equal(consent.searchParams.get('scope'), MAJLIS_CALENDAR_SCOPE)
  assert.equal(consent.searchParams.get('access_type'), 'offline')
  assert.equal(consent.searchParams.get('prompt'), 'consent')
  assert.equal(consent.searchParams.get('include_granted_scopes'), 'false')
  assert.equal(consent.searchParams.has('client_secret'), false)

  let called = false
  const closed = await performMajlisGoogleSync({
    secrets: null,
    storedCalendarId: null,
    event: virtualEvent(),
    op: 'upsert',
    fetchImpl: async () => {
      called = true
      return new Response('{}', { status: 500 })
    },
  })
  assert.equal(called, false)
  assert.equal(closed.status, 'not_connected')
  assert.equal(closed.detail, 'Google not connected.')
  assert.equal(closed.meetUrl, null)

  const body = buildMajlisGoogleEventBody(virtualEvent(), 'request-example')
  assert.equal('attendees' in body, false)
  assert.equal(body.guestsCanSeeOtherGuests, false)
  assert.equal(body.guestsCanInviteOthers, false)
  const conference = body.conferenceData as { createRequest: { conferenceSolutionKey: { type: string } } }
  assert.equal(conference.createRequest.conferenceSolutionKey.type, 'hangoutsMeet')

  const calls: string[] = []
  const synced = await performMajlisGoogleSync({
    secrets,
    storedCalendarId: 'calendar-example',
    event: virtualEvent(),
    op: 'upsert',
    fetchImpl: async (url, init) => {
      calls.push(url)
      const raw = String(init?.body ?? '')
      assert.equal(raw.includes('refresh-example'), url.includes('oauth2.googleapis.com'))
      assert.equal(raw.includes('attendees'), false)
      if (url.includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'access-example' }), { status: 200 })
      }
      const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {}
      assert.equal('attendees' in parsed, false)
      assert.equal(parsed.guestsCanSeeOtherGuests, false)
      const header = new Headers(init?.headers)
      assert.equal(header.get('authorization'), 'Bearer access-example')
      return new Response(JSON.stringify({ id: 'event-example', hangoutLink: sampleMeet }), { status: 200 })
    },
  })
  assert.equal(synced.status, 'synced')
  assert.equal(synced.meetUrl, sampleMeet)
  assert.equal(synced.googleEventId, 'event-example')
  assert.equal(calls.some((url) => url.includes('conferenceDataVersion=1')), true)
  assert.equal(synced.detail.includes('refresh-example'), false)
  assert.equal(synced.detail.includes('secret-example'), false)

  const refused = await performMajlisGoogleSync({
    secrets,
    storedCalendarId: 'calendar-example',
    event: virtualEvent(),
    op: 'upsert',
    fetchImpl: async () => new Response(JSON.stringify({ error: 'refresh-example' }), { status: 401 }),
  })
  assert.equal(refused.status, 'failed')
  assert.equal(refused.detail.includes('refresh-example'), false)
})

test('the member view gates the Meet link and the sponsor view is untouched', () => {
  const sql = read(`supabase/migrations/${migrationName}`)
  const member = sql.split('function private.majlis_events_member_rows')[1]?.split('$fn$;')[0] ?? ''
  const meet = member.split('end as meet_url')[0] ?? ''
  assert.match(meet, /e\.ends_at <= now\(\)/)
  assert.match(meet, /e\.status = 'cancelled'/)
  assert.match(meet, /private\.is_staff\(\)/)
  assert.match(meet, /e\.host_member_id = auth\.uid\(\)/)
  assert.match(meet, /r\.status = 'registered'/)
  assert.equal(/majlis_events_sponsor/.test(sql), false)
  assert.equal(/\bemail\b/i.test(member), false)
  assert.match(sql, /security_barrier = true, security_invoker = true/)
  assert.match(sql, /alter table public\.majlis_google_calendar force row level security/)
  assert.equal(/grant select on table public\.majlis_google_calendar to anon/i.test(sql), false)
  assert.equal(/grant select on table public\.majlis_google_calendar to authenticated/i.test(sql), false)
  const calendar = read('supabase/functions/_shared/majlis_calendar.ts')
  const sync = read('supabase/functions/majlis-calendar-sync/index.ts')
  const admin = read('supabase/functions/majlis-admin-action/index.ts')
  const ics = read('supabase/functions/majlis-ics/index.ts')
  for (const source of [calendar, sync, admin, ics]) {
    assert.equal(source.includes('\u2014'), false)
    assert.equal(/meetings\.space|calendar\.events|auth\/calendar"|auth\/calendar\.readonly/i.test(source), false)
  }
  assert.match(calendar, /calendar\.app\.created/)
  assert.match(sync, /requireStaff/)
  assert.equal(/aal2/.test(sync + admin), false)
  assert.match(ics, /icsMeetLink/)
  assert.equal(/ATTENDEE/.test(calendar), false)
})

test('screens say Google Meet with Q&A and polls, and do not claim the later features', () => {
  const member = read('src/pages/dashboard/MajlisPage.tsx')
  const admin = read('src/pages/admin/MajlisPage.tsx')
  assert.equal(/\bstaff\b/i.test(member), false)
  assert.equal(member.includes('\u2014') || admin.includes('\u2014'), false)
  assert.match(member, /This session runs on Google Meet\. Q&A and polls are available in the meeting\./)
  assert.match(member, /Register to receive the Meet link\./)
  assert.match(admin, /Fallback if sync fails/)
  assert.match(admin, /Google not connected/)
  assert.match(admin, /A virtual majlis saves even when Google is not connected/)
  const banned = /co-host|attendance report|livestream/i
  assert.equal(banned.test(member), false)
  assert.equal(banned.test(admin), false)
  assert.equal(/calendar\.app\.google/i.test(member + admin), false)
  assert.equal(/nammco/i.test(member + admin), false)
})

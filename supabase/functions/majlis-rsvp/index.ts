import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import {
  mailGuestCancelled,
  mailGuestPromoted,
  mailGuestRegistered,
  mailGuestWaitlist,
  mailHostRsvp,
  markCalendarSent,
} from '../_shared/majlis_notify.ts'
import { hostGuestLabel, type MajlisMailEvent } from '../_shared/majlis_mail.ts'
import { requireUser } from '../_shared/require_user.ts'

const UUID = /^[0-9a-f-]{36}$/i

type PlaceResult = {
  status: 'registered' | 'waitlist' | 'cancelled' | 'maybe' | 'declined'
  waitlist_position: number | null
  changed: boolean
  previous_status: string | null
  promoted_member_id: string | null
  registered_count: number
  waitlist_count: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireUser(req)
  if ('error' in gate) return jsonResponse(req, { error: gate.error }, gate.status)
  const { user, admin } = gate

  let eventId = ''
  let action = ''
  try {
    const body = await req.json()
    eventId = String(body.event_id || '')
    action = String(body.action || '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  if (!UUID.test(eventId) || !['register', 'maybe', 'decline', 'cancel'].includes(action)) {
    return jsonResponse(req, { error: 'event_id and action (register|maybe|decline|cancel) required' }, 400)
  }

  const { error: limitError } = await admin.rpc('majlis_consume_rsvp_slot', { p_member: user.id })
  if (limitError) {
    if (limitError.message.includes('rate_limited')) {
      return jsonResponse(req, { error: 'Too many registration attempts. Try again later.' }, 429)
    }
    return jsonResponse(req, { error: 'Could not update the registration.' }, 500)
  }

  const { data, error } = await admin.rpc('majlis_place_rsvp', {
    p_event: eventId,
    p_member: user.id,
    p_action: action,
  })
  if (error) {
    const mapped = mapRsvpError(error.message)
    return jsonResponse(req, { error: mapped.error }, mapped.status)
  }
  const placed = data as PlaceResult
  if (placed.changed) {
    await notifyChange(admin, eventId, user.id, placed)
  }

  return jsonResponse(req, {
    ok: true,
    status: placed.status,
    waitlist_position: placed.waitlist_position,
    changed: placed.changed,
  })
})

function mapRsvpError(message: string): { status: number; error: string } {
  if (message.includes('founding_window')) {
    return { status: 403, error: 'Founding members have priority for the first 48 hours.' }
  }
  if (message.includes('host_cannot_rsvp')) {
    return { status: 403, error: 'Hosts do not register for their own majlis.' }
  }
  if (message.includes('sponsor_cannot_rsvp')) {
    return { status: 403, error: 'Partners can view regional activity. Registration is for members.' }
  }
  if (message.includes('not_member')) return { status: 403, error: 'Registration is for members.' }
  if (message.includes('not_open')) return { status: 409, error: 'Registration is not open yet.' }
  if (message.includes('not_published')) {
    return { status: 409, error: 'This majlis is not open for registration.' }
  }
  if (message.includes('not_found')) return { status: 404, error: 'Majlis not found.' }
  if (message.includes('full')) return { status: 409, error: 'This majlis is full.' }
  return { status: 500, error: 'Could not update the registration.' }
}

async function notifyChange(
  admin: Parameters<typeof mailGuestRegistered>[0],
  eventId: string,
  memberId: string,
  placed: PlaceResult,
) {
  const event = await loadEvent(admin, eventId)
  if (!event) return
  const guest = await loadPerson(admin, memberId)
  const host = event.host_member_id ? await loadPerson(admin, event.host_member_id) : null
  const counts = {
    registered: Number(placed.registered_count ?? 0),
    waitlist: Number(placed.waitlist_count ?? 0),
  }
  const mailEvent = toMailEvent(event)

  if (placed.status === 'registered' && placed.previous_status !== 'waitlist') {
    if (guest?.email) {
      const sent = await mailGuestRegistered(admin, guest.email, mailEvent, memberId)
      if (sent.status === 'sent' || sent.status === 'dry_run') {
        await markCalendarSent(admin, eventId, memberId)
      }
    }
    if (host?.email) {
      await mailHostRsvp(admin, host.email, mailEvent, personLabel(guest), 'registered', counts.registered, counts.waitlist)
    }
  } else if (placed.status === 'registered' && placed.previous_status === 'waitlist') {
    if (guest?.email) {
      const sent = await mailGuestPromoted(admin, guest.email, mailEvent, memberId)
      if (sent.status === 'sent' || sent.status === 'dry_run') {
        await markCalendarSent(admin, eventId, memberId)
      }
    }
    if (host?.email) {
      await mailHostRsvp(admin, host.email, mailEvent, personLabel(guest), 'promoted', counts.registered, counts.waitlist)
    }
  } else if (placed.status === 'waitlist') {
    if (guest?.email) {
      await mailGuestWaitlist(admin, guest.email, mailEvent, Number(placed.waitlist_position ?? 0))
    }
    if (host?.email) {
      await mailHostRsvp(admin, host.email, mailEvent, personLabel(guest), 'waitlist', counts.registered, counts.waitlist)
    }
  } else if (placed.status === 'cancelled') {
    if (guest?.email) await mailGuestCancelled(admin, guest.email, mailEvent)
    if (host?.email) {
      await mailHostRsvp(admin, host.email, mailEvent, personLabel(guest), 'cancelled', counts.registered, counts.waitlist)
    }
    await mailPromoted(admin, eventId, host, mailEvent, placed, counts)
  } else if (placed.status === 'maybe' || placed.status === 'declined') {
    await mailPromoted(admin, eventId, host, mailEvent, placed, counts)
  }
}

async function mailPromoted(
  admin: Parameters<typeof mailGuestRegistered>[0],
  eventId: string,
  host: { email: string; full_name: string | null } | null,
  mailEvent: MajlisMailEvent,
  placed: PlaceResult,
  counts: { registered: number; waitlist: number },
) {
  if (!placed.promoted_member_id) return
  const promoted = await loadPerson(admin, placed.promoted_member_id)
  if (promoted?.email) {
    const sent = await mailGuestPromoted(admin, promoted.email, mailEvent, placed.promoted_member_id)
    if (sent.status === 'sent' || sent.status === 'dry_run') {
      await markCalendarSent(admin, eventId, placed.promoted_member_id)
    }
  }
  if (host?.email) {
    await mailHostRsvp(
      admin,
      host.email,
      mailEvent,
      personLabel(promoted),
      'promoted',
      counts.registered,
      counts.waitlist,
    )
  }
}

type EventRow = MajlisMailEvent & { host_member_id: string | null }

async function loadEvent(
  admin: Parameters<typeof mailGuestRegistered>[0],
  eventId: string,
): Promise<EventRow | null> {
  const { data, error } = await admin
    .from('majlis_events')
    .select('id, title, region, starts_at, ends_at, venue_name, venue_address, venue_visibility, capacity, host_member_id')
    .eq('id', eventId)
    .maybeSingle()
  if (error || !data) return null
  return data as EventRow
}

async function loadPerson(
  admin: Parameters<typeof mailGuestRegistered>[0],
  userId: string,
): Promise<{ email: string; full_name: string | null } | null> {
  const { data: member, error } = await admin.from('members').select('email').eq('user_id', userId).maybeSingle()
  if (error || !member?.email) return null
  const { data: profile } = await admin.from('profiles').select('full_name').eq('user_id', userId).maybeSingle()
  return { email: member.email, full_name: profile?.full_name ?? null }
}

function personLabel(person: { email: string; full_name: string | null } | null): string {
  return hostGuestLabel(person?.full_name)
}

function toMailEvent(event: EventRow): MajlisMailEvent {
  return {
    id: event.id,
    title: event.title,
    region: event.region,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    venue_name: event.venue_name,
    venue_address: event.venue_address,
    venue_visibility: event.venue_visibility,
    capacity: event.capacity,
  }
}

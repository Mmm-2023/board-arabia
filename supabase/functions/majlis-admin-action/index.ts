import { isMajlisRegion, parseFocusTags, regionGeotag, riyadhWallToUtc } from '../_shared/majlis.ts'
import type { MajlisMailEvent } from '../_shared/majlis_mail.ts'
import { mailEventCancelled, mailEventUpdated, mailGuestPromoted, mailHostRsvp, markCalendarSent } from '../_shared/majlis_notify.ts'
import { jsonResponse } from '../_shared/mail.ts'
import { requireStaff } from '../_shared/require_staff.ts'

const UUID = /^[0-9a-f-]{36}$/i

type EventRow = MajlisMailEvent & {
  host_member_id: string
  status: string
  description: string
  focus_tags: string[]
  starts_at: string
  ends_at: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': req.headers.get('Origin') || '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireStaff(req, (body, status) => jsonResponse(req, body, status))
  if (gate instanceof Response) return gate
  const { user, admin } = gate

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  const eventId = String(body.event_id || '')
  const action = String(body.action || '')
  if (!UUID.test(eventId)) return jsonResponse(req, { error: 'event_id required' }, 400)

  const { data: row, error: readError } = await admin
    .from('majlis_events')
    .select('id, host_member_id, title, description, region, focus_tags, starts_at, ends_at, venue_name, venue_address, venue_visibility, capacity, status')
    .eq('id', eventId)
    .maybeSingle()
  if (readError) return jsonResponse(req, { error: 'Could not load the majlis.' }, 500)
  if (!row) return jsonResponse(req, { error: 'Majlis not found.' }, 404)
  const event = row as EventRow

  if (action === 'hide' || action === 'unhide') {
    if (action === 'hide' && event.status !== 'published') {
      return jsonResponse(req, { error: 'Only a published majlis can be hidden.' }, 409)
    }
    if (action === 'unhide' && event.status !== 'hidden') {
      return jsonResponse(req, { error: 'Only a hidden majlis can be restored.' }, 409)
    }
    const status = action === 'hide' ? 'hidden' : 'published'
    const { error } = await admin.from('majlis_events').update({ status, updated_at: new Date().toISOString() }).eq('id', eventId).eq('status', event.status)
    if (error) return jsonResponse(req, { error: 'Could not update the majlis.' }, 500)
    await audit(admin, eventId, user.id, action, null)
    return jsonResponse(req, { ok: true, status })
  }

  if (action === 'cancel') {
    const reason = String(body.reason ?? '').trim()
    if (reason.length < 1 || reason.length > 2000) {
      return jsonResponse(req, { error: 'A cancellation reason is required.' }, 400)
    }
    if (event.status !== 'published' && event.status !== 'hidden') {
      return jsonResponse(req, { error: 'This majlis cannot be cancelled.' }, 409)
    }
    const now = new Date().toISOString()
    const { error } = await admin
      .from('majlis_events')
      .update({ status: 'cancelled', cancelled_at: now, cancel_reason: reason, updated_at: now })
      .eq('id', eventId)
      .in('status', ['published', 'hidden'])
    if (error) return jsonResponse(req, { error: 'Could not cancel the majlis.' }, 500)
    await audit(admin, eventId, user.id, 'cancel', reason)
    await notifyCancelled(admin, event, reason)
    return jsonResponse(req, { ok: true, status: 'cancelled' })
  }

  if (action === 'sponsor') {
    const raw = String(body.sponsor_label ?? '').trim()
    if (raw.length > 120) return jsonResponse(req, { error: 'The sponsor label must be 120 characters or fewer.' }, 400)
    const { error } = await admin
      .from('majlis_events')
      .update({ sponsor_label: raw || null, updated_at: new Date().toISOString() })
      .eq('id', eventId)
    if (error) return jsonResponse(req, { error: 'Could not update the sponsor label.' }, 500)
    await audit(admin, eventId, user.id, 'sponsor', raw || null)
    return jsonResponse(req, { ok: true, sponsor_label: raw || null })
  }

  if (action === 'feature') {
    const featured = body.featured === true
    const { error } = await admin.from('majlis_events').update({ featured, updated_at: new Date().toISOString() }).eq('id', eventId)
    if (error) return jsonResponse(req, { error: 'Could not update the majlis.' }, 500)
    await audit(admin, eventId, user.id, 'feature', featured ? 'featured' : 'unfeatured')
    return jsonResponse(req, { ok: true, featured })
  }

  if (action === 'promote') {
    const memberId = String(body.member_id || '')
    if (!UUID.test(memberId)) return jsonResponse(req, { error: 'member_id required' }, 400)
    const { data, error } = await admin.rpc('majlis_place_rsvp', {
      p_event: eventId,
      p_member: memberId,
      p_action: 'promote',
    })
    if (error) {
      if (error.message.includes('full')) return jsonResponse(req, { error: 'This majlis is full.' }, 409)
      if (error.message.includes('not_waitlist')) {
        return jsonResponse(req, { error: 'That guest is not on the waitlist.' }, 409)
      }
      return jsonResponse(req, { error: 'Could not promote the guest.' }, 500)
    }
    const placed = data as { registered_count?: number; waitlist_count?: number; changed?: boolean }
    if (placed.changed) {
      const { data: member } = await admin.from('members').select('email').eq('user_id', memberId).maybeSingle()
      const { data: profile } = await admin.from('profiles').select('full_name').eq('user_id', memberId).maybeSingle()
      const { data: host } = await admin.from('members').select('email').eq('user_id', event.host_member_id).maybeSingle()
      if (member?.email) {
        const sent = await mailGuestPromoted(admin, member.email, event, memberId)
        if (sent.status === 'sent' || sent.status === 'dry_run') await markCalendarSent(admin, eventId, memberId)
      }
      if (host?.email) {
        const name = (profile?.full_name || '').trim()
        const label = name && member?.email ? `${name} (${member.email})` : member?.email || 'A member'
        await mailHostRsvp(
          admin,
          host.email,
          event,
          label,
          'promoted',
          Number(placed.registered_count ?? 0),
          Number(placed.waitlist_count ?? 0),
        )
      }
    }
    await audit(admin, eventId, user.id, 'promote', memberId)
    return jsonResponse(req, { ok: true, status: 'registered' })
  }

  if (action === 'update') {
    if (event.status !== 'published' && event.status !== 'hidden') {
      return jsonResponse(req, { error: 'Only a published majlis can be updated.' }, 409)
    }
    const patch = buildUpdate(event, body)
    if ('error' in patch) return jsonResponse(req, { error: patch.error }, 400)
    const { error } = await admin.from('majlis_events').update(patch.value).eq('id', eventId)
    if (error) return jsonResponse(req, { error: 'Could not update the majlis.' }, 500)
    await audit(admin, eventId, user.id, 'update', patch.material ? 'time_or_venue' : 'details')
    if (patch.material) {
      const next = { ...event, ...patch.mail }
      await notifyUpdated(admin, next)
    }
    return jsonResponse(req, { ok: true, mailed: patch.material })
  }

  return jsonResponse(req, { error: 'Unknown action.' }, 400)
})

function buildUpdate(event: EventRow, body: Record<string, unknown>):
  | { error: string }
  | {
      value: Record<string, unknown>
      material: boolean
      mail: Pick<MajlisMailEvent, 'title' | 'region' | 'starts_at' | 'ends_at' | 'venue_name' | 'venue_address'>
    } {
  const region = body.region == null ? event.region : String(body.region)
  if (!isMajlisRegion(region)) return { error: 'Choose one region.' }
  const geo = regionGeotag(region)
  if (!geo) return { error: 'This region has no geotag.' }

  let starts = event.starts_at
  let ends = event.ends_at
  if (body.starts_at != null || body.ends_at != null) {
    const startRaw = String(body.starts_at ?? '')
    const endRaw = String(body.ends_at ?? '')
    const startUtc = riyadhWallToUtc(startRaw)
    const endUtc = riyadhWallToUtc(endRaw)
    if (!startUtc || !endUtc) return { error: 'Enter a start and end time in Asia/Riyadh.' }
    if (new Date(endUtc).getTime() <= new Date(startUtc).getTime()) {
      return { error: 'End time must be after the start time.' }
    }
    starts = startUtc
    ends = endUtc
  }

  const venueName = body.venue_name == null ? event.venue_name : String(body.venue_name).trim()
  const venueAddress = body.venue_address == null ? event.venue_address || '' : String(body.venue_address).trim()
  if (venueName.length < 1 || venueName.length > 200) return { error: 'Add a venue name (200 characters or fewer).' }
  if (venueAddress.length < 1 || venueAddress.length > 500) {
    return { error: 'Add a venue address (500 characters or fewer).' }
  }

  let focus = event.focus_tags
  if (body.focus_tags != null) {
    const tags = Array.isArray(body.focus_tags)
      ? body.focus_tags.map((tag) => String(tag))
      : parseFocusTags(String(body.focus_tags))
    if (tags.length < 1 || tags.length > 8 || tags.some((tag) => tag.length > 40)) {
      return { error: 'Add 1 to 8 focus tags.' }
    }
    focus = tags
  }

  const material =
    starts !== event.starts_at
    || ends !== event.ends_at
    || venueName !== event.venue_name
    || venueAddress !== (event.venue_address || '')
    || region !== event.region

  return {
    material,
    mail: {
      title: event.title,
      region,
      starts_at: starts,
      ends_at: ends,
      venue_name: venueName,
      venue_address: venueAddress,
    },
    value: {
      region,
      map_lat: geo.lat,
      map_lng: geo.lng,
      starts_at: starts,
      ends_at: ends,
      venue_name: venueName,
      venue_address: venueAddress,
      focus_tags: focus,
      updated_at: new Date().toISOString(),
    },
  }
}

async function notifyCancelled(
  admin: Parameters<typeof mailEventCancelled>[0],
  event: EventRow,
  reason: string,
) {
  const people = await guestRecipients(admin, event.id)
  for (const person of people) {
    await mailEventCancelled(admin, person.email, event, reason)
  }
}

async function notifyUpdated(admin: Parameters<typeof mailEventUpdated>[0], event: EventRow) {
  const people = await guestRecipients(admin, event.id)
  for (const person of people) {
    await mailEventUpdated(admin, person.email, event, person.status === 'registered')
  }
}

async function guestRecipients(
  admin: Parameters<typeof mailEventCancelled>[0],
  eventId: string,
): Promise<{ email: string; status: string }[]> {
  const { data, error } = await admin
    .from('majlis_rsvps')
    .select('member_id, status')
    .eq('event_id', eventId)
    .in('status', ['registered', 'waitlist'])
  if (error || !data) return []
  const ids = data.map((row) => row.member_id as string)
  if (ids.length === 0) return []
  const { data: members } = await admin.from('members').select('user_id, email').in('user_id', ids)
  const byId = new Map((members ?? []).map((row) => [row.user_id as string, row.email as string]))
  return data
    .map((row) => ({ email: byId.get(row.member_id as string) || '', status: row.status as string }))
    .filter((row) => row.email)
}

async function audit(
  admin: Parameters<typeof mailEventCancelled>[0],
  eventId: string,
  actorId: string,
  action: string,
  note: string | null,
) {
  await admin.from('majlis_decisions').insert({
    event_id: eventId,
    actor_user_id: actorId,
    action,
    note,
  })
}

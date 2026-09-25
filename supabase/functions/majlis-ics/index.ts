import { buildMajlisIcs } from '../_shared/majlis.ts'
import { includeVenueAddress, type MajlisMailEvent } from '../_shared/majlis_mail.ts'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { requireUser } from '../_shared/require_user.ts'

const UUID = /^[0-9a-f-]{36}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireUser(req)
  if ('error' in gate) return jsonResponse(req, { error: gate.error }, gate.status)
  const { user, admin } = gate

  let eventId = ''
  try {
    const body = await req.json()
    eventId = String(body.event_id || '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  if (!UUID.test(eventId)) return jsonResponse(req, { error: 'event_id required' }, 400)

  const { data: rsvp, error: rsvpError } = await admin
    .from('majlis_rsvps')
    .select('status')
    .eq('event_id', eventId)
    .eq('member_id', user.id)
    .maybeSingle()
  if (rsvpError) return jsonResponse(req, { error: 'Could not build the calendar file.' }, 500)
  if (rsvp?.status !== 'registered') {
    return jsonResponse(req, { error: 'The calendar file is available after you register.' }, 403)
  }

  const { data: event, error: eventError } = await admin
    .from('majlis_events')
    .select('id, title, region, starts_at, ends_at, venue_name, venue_address, venue_visibility, capacity')
    .eq('id', eventId)
    .maybeSingle()
  if (eventError || !event) return jsonResponse(req, { error: 'Majlis not found.' }, 404)

  const row = event as MajlisMailEvent
  const address = includeVenueAddress(row, true) ? row.venue_address : null
  const location = address ? `${row.venue_name}, ${address}` : row.venue_name
  const ics = buildMajlisIcs({
    eventId: row.id,
    memberId: user.id,
    title: row.title,
    description: `${row.title}. Region: ${row.region}. Asia/Riyadh.`,
    location,
    startsAtUtc: row.starts_at,
    endsAtUtc: row.ends_at,
  })

  return new Response(ics, {
    status: 200,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="majlis.ics"',
      'Cache-Control': 'no-store',
    },
  })
})

import { FOUNDING_PRIORITY_MS, regionGeotag, rejectionFeedbackError } from '../_shared/majlis.ts'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { requireStaff } from '../_shared/require_staff.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405)
  }

  const gate = await requireStaff(req, (body, status) => jsonResponse(req, body, status))
  if (gate instanceof Response) return gate
  const { user, admin } = gate

  let eventId = ''
  let decision = ''
  let note = ''
  try {
    const body = await req.json()
    eventId = String(body.event_id || '')
    decision = String(body.decision || '')
    note = String(body.note ?? '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  if (!/^[0-9a-f-]{36}$/i.test(eventId) || (decision !== 'accept' && decision !== 'reject')) {
    return jsonResponse(req, { error: 'event_id and decision (accept|reject) required' }, 400)
  }

  const feedbackError = decision === 'reject' ? rejectionFeedbackError(note) : null
  if (feedbackError) return jsonResponse(req, { error: feedbackError }, 400)
  const trimmed = note.trim()
  if (decision === 'accept' && trimmed.length > 2000) {
    return jsonResponse(req, { error: 'The note must be 2000 characters or fewer.' }, 400)
  }

  const opensAt = new Date()
  const now = opensAt.toISOString()
  const pending =
    decision === 'accept'
      ? await admin
          .from('majlis_events')
          .select('region')
          .eq('id', eventId)
          .eq('status', 'pending_approval')
          .maybeSingle()
      : null
  if (decision === 'accept' && (pending?.error || !pending?.data)) {
    return jsonResponse(req, { error: 'This application is no longer pending.' }, 409)
  }
  const geo = decision === 'accept' ? regionGeotag(String(pending?.data?.region ?? '')) : null
  if (decision === 'accept' && !geo) {
    return jsonResponse(req, { error: 'This majlis is missing a region geotag.' }, 400)
  }

  const basePatch =
    decision === 'accept'
      ? {
          status: 'published',
          admin_note: trimmed || null,
          approved_by: user.id,
          approved_at: now,
          updated_at: now,
        }
      : {
          status: 'rejected',
          rejection_feedback: trimmed,
          updated_at: now,
        }
  const patch =
    decision === 'accept' && geo
      ? {
          ...basePatch,
          map_lat: geo.lat,
          map_lng: geo.lng,
          rsvp_opens_at: now,
          founding_priority_ends_at: new Date(opensAt.getTime() + FOUNDING_PRIORITY_MS).toISOString(),
        }
      : basePatch

  let updatedResult = await admin
    .from('majlis_events')
    .update(patch)
    .eq('id', eventId)
    .eq('status', 'pending_approval')
    .select('id, status')
    .maybeSingle()
  if (updatedResult.error && decision === 'accept' && missingPublishColumns(updatedResult.error.message)) {
    updatedResult = await admin
      .from('majlis_events')
      .update(basePatch)
      .eq('id', eventId)
      .eq('status', 'pending_approval')
      .select('id, status')
      .maybeSingle()
  }
  const updated = updatedResult.data
  const updateError = updatedResult.error
  if (updateError) return jsonResponse(req, { error: 'Could not update the majlis.' }, 500)
  if (!updated) {
    return jsonResponse(req, { error: 'This application is no longer pending.' }, 409)
  }

  const { error: auditError } = await admin.from('majlis_decisions').insert({
    event_id: eventId,
    actor_user_id: user.id,
    action: decision,
    note: trimmed || null,
  })
  if (auditError) return jsonResponse(req, { error: 'Could not record the decision.' }, 500)

  return jsonResponse(req, {
    ok: true,
    status: updated.status,
    message: decision === 'accept' ? 'Published on the member feed.' : 'Application rejected.',
  })
})

function missingPublishColumns(message: string): boolean {
  return /does not exist|schema cache|Could not find the/i.test(message)
}

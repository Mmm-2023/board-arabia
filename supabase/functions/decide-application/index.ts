import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { createMeetInvite } from './google.ts'
import {
  corsHeaders,
  jsonResponse,
  logEmailEvent,
  sendEmail,
} from './mail.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') || ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()
  if (userError || !user) {
    return jsonResponse(req, { error: 'Unauthorized' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: staff } = await admin
    .from('staff_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!staff) {
    return jsonResponse(req, { error: 'Not staff' }, 403)
  }

  let applicationId = ''
  let decision = ''
  let meetingStart = ''
  let meetingEnd = ''
  try {
    const body = await req.json()
    applicationId = String(body.application_id || '')
    decision = String(body.decision || '')
    meetingStart = String(body.meeting_start || '')
    meetingEnd = String(body.meeting_end || '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  if (!applicationId || (decision !== 'accepted' && decision !== 'rejected')) {
    return jsonResponse(
      req,
      { error: 'application_id and decision (accepted|rejected) required' },
      400,
    )
  }

  const { data: app, error } = await admin
    .from('applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle()
  if (error || !app) {
    return jsonResponse(req, { error: error?.message || 'Not found' }, 404)
  }
  if (!app.email) {
    return jsonResponse(req, { error: 'Application missing email' }, 400)
  }

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    status: decision,
    updated_at: now,
    decision_at: now,
    decision_by: user.id,
  }

  if (decision === 'accepted') {
    if (!meetingStart || !meetingEnd) {
      return jsonResponse(
        req,
        { error: 'meeting_start and meeting_end required for Accept' },
        400,
      )
    }
    const startMs = Date.parse(meetingStart)
    const endMs = Date.parse(meetingEnd)
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      return jsonResponse(req, { error: 'Invalid meeting window' }, 400)
    }

    let invite
    try {
      invite = await createMeetInvite({
        applicantEmail: app.email,
        applicantName: app.full_name,
        startIso: new Date(startMs).toISOString(),
        endIso: new Date(endMs).toISOString(),
        applicationId: app.id,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Calendar invite failed'
      await logEmailEvent(admin, {
        application_id: app.id,
        kind: 'accept_calendar_invite',
        recipient: app.email,
        subject: 'Board Arabia calendar invite (failed)',
        status: 'error',
        provider: 'google_calendar',
        detail: msg,
      })
      return jsonResponse(req, { error: msg }, 502)
    }

    // Optional Resend ack (Calendar also emails the invite when sendUpdates=all)
    const subject = 'Board Arabia — conversation confirmed'
    const when = new Date(startMs).toUTCString()
    const text = `Hello ${app.full_name || 'there'},

Your Board Arabia application has been accepted.

A calendar invite${invite.meetLink ? ' with Google Meet' : ''} for ${when} has been sent to ${app.email}. Please accept the invite in your calendar.

— Board Arabia`
    const html = `<p>Hello ${escapeHtml(app.full_name || 'there')},</p>
<p>Your Board Arabia application has been <strong>accepted</strong>.</p>
<p>A calendar invite${invite.meetLink ? ' with Google Meet' : ''} for <strong>${escapeHtml(when)}</strong> has been sent to ${escapeHtml(app.email)}. Please accept the invite in your calendar.</p>
${invite.meetLink ? `<p>Meet: <a href="${escapeHtml(invite.meetLink)}">${escapeHtml(invite.meetLink)}</a></p>` : ''}
<p>— Board Arabia</p>`

    const sent = await sendEmail({
      to: app.email,
      subject,
      html,
      text,
    })
    await logEmailEvent(admin, {
      application_id: app.id,
      kind: 'accept_calendar_invite',
      recipient: app.email,
      subject,
      status: invite.dryRun ? 'dry_run' : sent.status === 'error' ? 'error' : 'sent',
      provider: invite.dryRun ? 'google_calendar_dry_run' : 'google_calendar',
      provider_id: invite.eventId,
      detail: invite.detail ?? sent.detail ?? null,
      payload: {
        invite_mode: 'google_calendar_meet',
        meet_link: invite.meetLink,
        html_link: invite.htmlLink,
        meeting_start: meetingStart,
        meeting_end: meetingEnd,
        resend_status: sent.status,
      },
    })

    if (!invite.dryRun && sent.status === 'error') {
      // Calendar invite already sent; note Resend failure but still mark accepted
    }

    updatePayload.invite_sent_at = now
    updatePayload.invite_event_id = invite.eventId || 'google_calendar_pending_secrets'
    updatePayload.calendar_slot = new Date(startMs).toISOString()

    const { error: upErr } = await admin
      .from('applications')
      .update(updatePayload)
      .eq('id', app.id)
    if (upErr) {
      return jsonResponse(req, { error: upErr.message }, 500)
    }

    return jsonResponse(req, {
      ok: true,
      dry_run: invite.dryRun,
      invite_mode: 'google_calendar_meet',
      invite_event_id: invite.eventId,
      meet_link: invite.meetLink,
      message: invite.dryRun
        ? 'Accepted (dry-run). Set Google Calendar secrets to create Meet invites. See README.'
        : 'Accepted — Google Calendar event + Meet invite sent to applicant.',
    })
  }

  // Reject: decline email only
  const subject = 'Board Arabia application update'
  const text = `Hello ${app.full_name || 'there'},

Thank you for your interest in Board Arabia. After review, we are unable to proceed with your application at this time.

We appreciate you taking the time to apply.

— Board Arabia`
  const html = `<p>Hello ${escapeHtml(app.full_name || 'there')},</p>
<p>Thank you for your interest in Board Arabia. After review, we are unable to proceed with your application at this time.</p>
<p>We appreciate you taking the time to apply.</p>
<p>— Board Arabia</p>`

  const sent = await sendEmail({
    to: app.email,
    subject,
    html,
    text,
  })
  await logEmailEvent(admin, {
    application_id: app.id,
    kind: 'reject_decline',
    recipient: app.email,
    subject,
    status: sent.status,
    provider: sent.provider,
    provider_id: sent.providerId,
    detail: sent.detail ?? null,
  })

  if (sent.status === 'error') {
    return jsonResponse(req, { error: sent.detail || 'Email failed' }, 502)
  }

  updatePayload.invite_event_id = null
  updatePayload.invite_sent_at = null
  updatePayload.calendar_slot = null

  const { error: upErr } = await admin
    .from('applications')
    .update(updatePayload)
    .eq('id', app.id)
  if (upErr) {
    return jsonResponse(req, { error: upErr.message }, 500)
  }

  return jsonResponse(req, {
    ok: true,
    dry_run: sent.dryRun,
    message: sent.dryRun
      ? 'Rejected (dry-run). Set RESEND_API_KEY to send the decline email.'
      : 'Rejected — decline email sent to applicant.',
  })
})

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

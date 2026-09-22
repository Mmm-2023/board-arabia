import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { acceptMail, rejectMail } from '../_shared/transactional_copy.ts'
import {
  PRIVATE_BOOKING_LINK,
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
  try {
    const body = await req.json()
    applicationId = String(body.application_id || '')
    decision = String(body.decision || '')
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
  if (app.status === 'admitted') {
    return jsonResponse(
      req,
      { error: 'Already admitted. Accept and Reject do not change a member.' },
      409,
    )
  }

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    status: decision,
    updated_at: now,
    decision_at: now,
    decision_by: user.id,
  }

  if (decision === 'accepted') {
    const { subject, text, html } = acceptMail(app.full_name || 'there', PRIVATE_BOOKING_LINK)

    const sent = await sendEmail({
      to: app.email,
      subject,
      html,
      text,
    })
    await logEmailEvent(admin, {
      application_id: app.id,
      kind: 'accept_private_booking',
      recipient: app.email,
      subject,
      status: sent.status,
      provider: sent.provider,
      provider_id: sent.providerId,
      detail: sent.detail ?? null,
      payload: {
        invite_mode: 'private_booking_link',
        booking_url: PRIVATE_BOOKING_LINK,
        email_text: text,
      },
    })
    if (sent.status === 'error') {
      return jsonResponse(req, { error: sent.detail || 'Email failed' }, 502)
    }

    updatePayload.invite_sent_at = now
    updatePayload.invite_event_id = 'private_booking_link'
    updatePayload.calendar_slot = 'private_invite_emailed'

    const { error: upErr } = await admin
      .from('applications')
      .update(updatePayload)
      .eq('id', app.id)
    if (upErr) return jsonResponse(req, { error: upErr.message }, 500)

    return jsonResponse(req, {
      ok: true,
      dry_run: sent.dryRun,
      invite_mode: 'private_booking_link',
      booking_url: PRIVATE_BOOKING_LINK,
      message: sent.dryRun
        ? 'Accepted (dry-run). Workspace mail is not connected, so the private booking email was not sent.'
        : 'Accepted. Private booking link emailed to candidate.',
    })
  }

  const { subject, text, html } = rejectMail(app.full_name || 'there')

  const sent = await sendEmail({ to: app.email, subject, html, text })
  await logEmailEvent(admin, {
    application_id: app.id,
    kind: 'reject_decline',
    recipient: app.email,
    subject,
    status: sent.status,
    provider: sent.provider,
    provider_id: sent.providerId,
    detail: sent.detail ?? null,
    payload: { email_text: text },
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
  if (upErr) return jsonResponse(req, { error: upErr.message }, 500)

  return jsonResponse(req, {
    ok: true,
    dry_run: sent.dryRun,
    message: sent.dryRun
      ? 'Rejected (dry-run). Workspace mail is not connected, so the decline email was not sent.'
      : 'Rejected. Decline email sent to applicant.',
  })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  corsHeaders,
  jsonResponse,
  logEmailEvent,
  PRIVATE_BOOKING_LINK,
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

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    status: decision,
    updated_at: now,
    decision_at: now,
    decision_by: user.id,
  }

  if (decision === 'accepted') {
    // Accept: email private booking link only. No Calendar API. No public CTA.
    const subject = 'Board Arabia — next step (private booking)'
    const text = `Hello ${app.full_name || 'there'},

Your Board Arabia application has been accepted.

Please use this private booking link to schedule a conversation with Michael:

${PRIVATE_BOOKING_LINK}

This link is personal to accepted candidates and is not published on the public site.

— Board Arabia`

    const html = `<p>Hello ${escapeHtml(app.full_name || 'there')},</p>
<p>Your Board Arabia application has been <strong>accepted</strong>.</p>
<p>Please use this private booking link to schedule a conversation with Michael:</p>
<p><a href="${escapeHtml(PRIVATE_BOOKING_LINK)}">${escapeHtml(PRIVATE_BOOKING_LINK)}</a></p>
<p>This link is personal to accepted candidates and is not published on the public site.</p>
<p>— Board Arabia</p>`

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
      payload: { invite_mode: 'private_booking_link' },
    })

    if (sent.status === 'error') {
      return jsonResponse(req, { error: sent.detail || 'Email failed' }, 502)
    }

    updatePayload.invite_sent_at = now
    updatePayload.invite_event_id = 'private_booking_link'

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
      invite_mode: 'private_booking_link',
      message: sent.dryRun
        ? 'Accepted (dry-run). Set RESEND_API_KEY to send the private booking email.'
        : 'Accepted — private booking link emailed to candidate.',
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

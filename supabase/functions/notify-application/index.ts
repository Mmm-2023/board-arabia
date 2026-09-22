import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  ADMIN_NOTIFY_EMAIL,
  corsHeaders,
  jsonResponse,
  logEmailEvent,
  publicSite,
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
  const admin = createClient(supabaseUrl, serviceKey)

  let applicationId = ''
  try {
    const body = await req.json()
    applicationId = String(body.application_id || '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  if (!applicationId) {
    return jsonResponse(req, { error: 'application_id required' }, 400)
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

  const adminUrl = `${publicSite()}/admin`

  const summaryLines = [
    `Name: ${app.full_name || 'Not provided'}`,
    `Email: ${app.email}`,
    `Phone: ${app.phone || 'Not provided'}`,
    `Turnover: ${app.turnover}`,
    `FO / AUM: ${app.fo_aum || 'Not provided'}`,
    `Titles: ${app.job_titles}`,
    `Companies: ${app.companies}`,
    `LinkedIn: ${app.linkedin_url || 'Not provided'}`,
  ]

  const ackSubject = 'We received your Board Arabia application'
  const ackText = `Hello ${app.full_name || 'there'},

Thank you for applying to Board Arabia. We have your pre-vet details and Michael will review them shortly.

You do not need to book anything yet. If accepted, you will receive a private next-step email.

Board Arabia`

  const ackHtml = `<p>Hello ${escapeHtml(app.full_name || 'there')},</p>
<p>Thank you for applying to Board Arabia. We have your pre-vet details and Michael will review them shortly.</p>
<p>You do not need to book anything yet. If accepted, you will receive a private next-step email.</p>
<p>Board Arabia</p>`

  const notifySubject = `New Board Arabia application: ${app.full_name || app.email}`
  const notifyText = `New pending application.

${summaryLines.join('\n')}

Review / Accept / Reject: ${adminUrl}

Application id: ${app.id}

Board Arabia`

  const notifyHtml = `<p>New pending application.</p>
<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(summaryLines.join('\n'))}</pre>
<p><a href="${escapeHtml(adminUrl)}">Open admin (Accept or Reject)</a></p>
<p>Application id: ${escapeHtml(app.id)}</p>
<p>Board Arabia</p>`

  const ack = await sendEmail({
    to: app.email,
    subject: ackSubject,
    html: ackHtml,
    text: ackText,
  })
  await logEmailEvent(admin, {
    application_id: app.id,
    kind: 'applicant_ack',
    recipient: app.email,
    subject: ackSubject,
    status: ack.status,
    provider: ack.provider,
    provider_id: ack.providerId,
    detail: ack.detail ?? null,
  })

  const notify = await sendEmail({
    to: ADMIN_NOTIFY_EMAIL,
    subject: notifySubject,
    html: notifyHtml,
    text: notifyText,
  })
  await logEmailEvent(admin, {
    application_id: app.id,
    kind: 'admin_notify',
    recipient: ADMIN_NOTIFY_EMAIL,
    subject: notifySubject,
    status: notify.status,
    provider: notify.provider,
    provider_id: notify.providerId,
    detail: notify.detail ?? null,
  })

  const dryRun = ack.dryRun || notify.dryRun
  const failed = ack.status === 'error' || notify.status === 'error'

  return jsonResponse(req, {
    ok: !failed,
    dry_run: dryRun,
    ack: ack.status,
    notify: notify.status,
    error: failed ? ack.detail || notify.detail : undefined,
  }, failed ? 502 : 200)
})

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

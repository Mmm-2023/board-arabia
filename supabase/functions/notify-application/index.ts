import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { applicationAck } from '../_shared/transactional_copy.ts'
import {
  adminNotifyEmail,
  boardMail,
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

  const ackMail = applicationAck(app.full_name || 'there')
  const ackSubject = ackMail.subject
  const ackText = ackMail.text
  const ackHtml = ackMail.html

  const notifySubject = `New Board Arabia application: ${app.full_name || app.email}`
  const notifyBody = boardMail(
    `New pending application.

${summaryLines.join('\n')}

Review / Accept / Reject: ${adminUrl}

Application id: ${app.id}`,
    `<p>New pending application.</p>
<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(summaryLines.join('\n'))}</pre>
<p><a href="${escapeHtml(adminUrl)}">Open admin (Accept or Reject)</a></p>
<p>Application id: ${escapeHtml(app.id)}</p>`,
  )
  const notifyText = notifyBody.text
  const notifyHtml = notifyBody.html

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

  const notifyTo = adminNotifyEmail()
  const notify = notifyTo
    ? await sendEmail({
        to: notifyTo,
        subject: notifySubject,
        html: notifyHtml,
        text: notifyText,
      })
    : {
        dryRun: false,
        provider: 'gmail',
        providerId: null,
        status: 'error' as const,
        detail: 'ADMIN_NOTIFY_EMAIL is not set.',
      }
  await logEmailEvent(admin, {
    application_id: app.id,
    kind: 'admin_notify',
    recipient: notifyTo,
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

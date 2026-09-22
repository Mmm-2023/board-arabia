import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  ADMIN_NOTIFY_EMAIL,
  corsHeaders,
  jsonResponse,
  logEmailEvent,
  sendEmail,
} from './mail.ts'

const MAX_FIELD = {
  full_name: 200,
  email: 320,
  phone: 40,
  turnover: 500,
  fo_aum: 500,
  linkedin_url: 500,
  job_titles: 2000,
  companies: 4000,
} as const

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

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

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  const fullName = clean(body.full_name, MAX_FIELD.full_name)
  const email = clean(body.email, MAX_FIELD.email).toLowerCase()
  const phone = clean(body.phone, MAX_FIELD.phone) || null
  const turnover = clean(body.turnover, MAX_FIELD.turnover)
  const foAum = clean(body.fo_aum, MAX_FIELD.fo_aum) || null
  const linkedinUrl = clean(body.linkedin_url, MAX_FIELD.linkedin_url)
  const jobTitles = clean(body.job_titles, MAX_FIELD.job_titles)
  const companies = clean(body.companies, MAX_FIELD.companies)

  if (!fullName || !email || !linkedinUrl || !jobTitles || !companies) {
    return jsonResponse(req, { error: 'Missing required fields' }, 400)
  }
  if (!turnover && !foAum) {
    return jsonResponse(req, { error: 'Provide turnover or FO AUM' }, 400)
  }
  if (!isValidEmail(email)) {
    return jsonResponse(req, { error: 'Invalid email' }, 400)
  }
  if (!isValidHttpUrl(linkedinUrl)) {
    return jsonResponse(req, { error: 'Invalid LinkedIn URL' }, 400)
  }

  const clientIp = (req.headers.get('x-forwarded-for') || '')
    .split(',')[0]
    ?.trim() || 'unknown'
  const rateKey = `apply:${email}:${clientIp}`
  const limited = await bumpRateLimit(admin, rateKey)
  if (limited) {
    return jsonResponse(req, { error: 'Too many applications. Try again later.' }, 429)
  }

  const { data: app, error: insertError } = await admin
    .from('applications')
    .insert({
      full_name: fullName,
      email,
      phone,
      turnover: turnover || foAum,
      fo_aum: foAum,
      linkedin_url: linkedinUrl,
      job_titles: jobTitles,
      companies,
      calendar_slot: null,
      status: 'pending',
    })
    .select('id, full_name, email, phone, turnover, fo_aum, job_titles, companies, linkedin_url')
    .single()

  if (insertError || !app) {
    return jsonResponse(req, { error: insertError?.message || 'Insert failed' }, 400)
  }

  // Emails: only this applicant + michael@nammco.com — never other applicants' rows
  const siteUrl =
    Deno.env.get('PUBLIC_SITE_URL') || 'https://mmm-2023.github.io/board-arabia'
  const adminUrl = `${siteUrl.replace(/\/$/, '')}/admin`

  const summaryLines = [
    `Name: ${app.full_name || '—'}`,
    `Email: ${app.email}`,
    `Phone: ${app.phone || '—'}`,
    `Turnover: ${app.turnover}`,
    `FO / AUM: ${app.fo_aum || '—'}`,
    `Titles: ${app.job_titles}`,
    `Companies: ${app.companies}`,
    `LinkedIn: ${app.linkedin_url || '—'}`,
  ]

  const ackSubject = 'We received your Board Arabia application'
  const ackText = `Hello ${app.full_name || 'there'},

Thank you for applying to Board Arabia. We have your pre-vet details and Michael will review them shortly.

You do not need to book anything yet — if accepted, you will receive a private next-step email.

— Board Arabia`
  const ackHtml = `<p>Hello ${escapeHtml(app.full_name || 'there')},</p>
<p>Thank you for applying to Board Arabia. We have your pre-vet details and Michael will review them shortly.</p>
<p>You do not need to book anything yet — if accepted, you will receive a private next-step email.</p>
<p>— Board Arabia</p>`

  const notifySubject = `New Board Arabia application — ${app.full_name || app.email}`
  const notifyText = `New pending application.

${summaryLines.join('\n')}

Review / Accept / Reject: ${adminUrl}

Application id: ${app.id}`
  const notifyHtml = `<p>New pending application.</p>
<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(summaryLines.join('\n'))}</pre>
<p><a href="${escapeHtml(adminUrl)}">Open admin — Accept or Reject</a></p>
<p>Application id: ${escapeHtml(app.id)}</p>`

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
  return jsonResponse(req, {
    ok: true,
    id: app.id,
    dry_run: dryRun,
    ack: ack.status,
    notify: notify.status,
  })
})

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.includes('\n')
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function bumpRateLimit(
  // deno-lint-ignore no-explicit-any
  admin: any,
  rateKey: string,
): Promise<boolean> {
  const now = Date.now()
  const { data: row } = await admin
    .from('apply_rate_limits')
    .select('rate_key, window_start, hit_count')
    .eq('rate_key', rateKey)
    .maybeSingle()

  if (!row) {
    await admin.from('apply_rate_limits').insert({
      rate_key: rateKey,
      window_start: new Date(now).toISOString(),
      hit_count: 1,
    })
    return false
  }

  const start = new Date(row.window_start).getTime()
  if (now - start > RATE_LIMIT_WINDOW_MS) {
    await admin
      .from('apply_rate_limits')
      .update({ window_start: new Date(now).toISOString(), hit_count: 1 })
      .eq('rate_key', rateKey)
    return false
  }

  if (row.hit_count >= RATE_LIMIT_MAX) return true

  await admin
    .from('apply_rate_limits')
    .update({ hit_count: row.hit_count + 1 })
    .eq('rate_key', rateKey)
  return false
}

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { requireStaff } from '../_shared/require_staff.ts'
import { issueCredential, type Issued } from '../_shared/credentials.ts'
import { admitMail } from '../_shared/transactional_copy.ts'
import { corsHeaders, jsonResponse, logEmailEvent, publicSite, sendEmail } from './mail.ts'

const SEAT_CAP = 50

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

  let applicationId = ''
  let seat = ''
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
    applicationId = String(body.application_id || '')
    seat = String(body.seat || '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  if (!/^[0-9a-f-]{36}$/i.test(applicationId) || (seat !== 'ksa' && seat !== 'intl')) {
    return jsonResponse(
      req,
      { error: 'application_id and seat (ksa|intl) required' },
      400,
    )
  }

  const { data: app, error } = await admin
    .from('applications')
    .select(
      'id, full_name, email, phone, linkedin_url, job_titles, companies, status, invite_token_id',
    )
    .eq('id', applicationId)
    .maybeSingle()
  if (error || !app) {
    return jsonResponse(req, { error: error?.message || 'Not found' }, 404)
  }
  if (app.status === 'admitted') {
    return jsonResponse(req, { error: 'Already admitted' }, 409)
  }
  if (app.status !== 'accepted' && app.status !== 'verified') {
    return jsonResponse(req, { error: 'Accept the application before admitting' }, 409)
  }

  const email = String(app.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(req, { error: 'Application missing a usable email' }, 400)
  }

  const { count: taken, error: countError } = await admin
    .from('members')
    .select('user_id', { count: 'exact', head: true })
    .eq('seat', seat)
    .in('status', ['invited', 'active'])
  if (countError) return jsonResponse(req, { error: countError.message }, 500)
  if ((taken ?? 0) >= SEAT_CAP) {
    return jsonResponse(req, { error: 'That founding seat is full (50).' }, 409)
  }

  const { data: existingMember } = await admin
    .from('members')
    .select('user_id')
    .eq('email', email)
    .maybeSingle()
  if (existingMember) {
    return jsonResponse(req, { error: 'This person is already a member.' }, 409)
  }

  const investable = readUsd(body.investable_capacity_usd)
  const foAum = readUsd(body.fo_aum_usd)
  const turnover = readUsd(body.turnover_usd)
  if (investable.error || foAum.error || turnover.error) {
    return jsonResponse(req, { error: 'Capacity amounts must be USD numbers, or blank.' }, 400)
  }

  let inviteBefore: { id: string; status: string } | null = null
  if (app.invite_token_id) {
    const { data: inviteRow } = await admin
      .from('member_invites')
      .select('id, status')
      .eq('id', app.invite_token_id)
      .maybeSingle()
    if (inviteRow) inviteBefore = { id: inviteRow.id, status: inviteRow.status }
  }

  const site = publicSite()
  const issued = await issueCredential(admin, email, site)
  if ('error' in issued) {
    return jsonResponse(req, { error: issued.error }, 502)
  }

  const fullName = clip(app.full_name, 200)
  const { error: claimError } = await admin.rpc('claim_founding_seat', {
    p_user_id: issued.userId,
    p_application_id: app.id,
    p_email: email,
    p_seat: seat,
    p_invited_by: user.id,
    p_full_name: fullName,
    p_phone: clip(app.phone, 40),
    p_linkedin_url: httpsOrNull(app.linkedin_url),
    p_company: clip(firstLine(app.companies), 200),
    p_headline: clip(firstLine(app.job_titles), 160),
    p_investable_capacity_usd: investable.value,
    p_fo_aum_usd: foAum.value,
    p_turnover_usd: turnover.value,
    p_include_in_public_aggregates: body.include_in_public_aggregates !== false,
    p_capacity_verified: body.capacity_verified === true,
  })
  if (claimError) {
    if (issued.createdNew) await admin.auth.admin.deleteUser(issued.userId)
    return jsonResponse(req, claimFailure(claimError.message), claimStatus(claimError.message))
  }

  const seatLabel = seat === 'ksa' ? 'Saudi Arabia' : 'International'
  const loginUrl = `${site}/login?next=/dashboard&otp_type=${issued.mode === 'magic_link' ? issued.otpType : 'invite'}`
  const confirmUrl =
    issued.mode === 'magic_link'
      ? `${site}/auth/confirm?token_hash=${encodeURIComponent(issued.tokenHash)}&type=${issued.otpType}`
      : null

  const greeting = fullName || 'there'
  const { subject, text, html } = admitMail({ greeting, seatLabel, loginUrl, confirmUrl, issued })

  if (/calendar\.app\.google|nammco/i.test(`${subject}\n${text}\n${html}`)) {
    await rollbackAdmission(admin, app.id, app.status, issued, inviteBefore)
    return jsonResponse(req, { error: 'Invite blocked' }, 500)
  }

  const sent = await sendEmail({ to: email, subject, html, text })
  await logEmailEvent(admin, {
    application_id: app.id,
    kind: 'member_invite',
    recipient: email,
    subject,
    status: sent.status,
    provider: sent.provider,
    provider_id: sent.providerId,
    detail: sent.detail ?? null,
    payload: {
      invite_mode: issued.mode,
      seat,
      has_otp: issued.mode === 'magic_link' && Boolean(issued.otp),
      has_temp_password: issued.mode === 'temp_password',
    },
  })

  if (sent.status === 'error') {
    await rollbackAdmission(admin, app.id, app.status, issued, inviteBefore)
    return jsonResponse(req, { error: sent.detail || 'Email failed' }, 502)
  }

  const dryRunInvite = sent.dryRun
    ? {
        confirm_url: confirmUrl,
        login_url: loginUrl,
        otp: issued.mode === 'magic_link' ? issued.otp || null : null,
        temp_password: issued.mode === 'temp_password' ? issued.tempPassword : null,
      }
    : undefined

  return jsonResponse(req, {
    ok: true,
    dry_run: sent.dryRun,
    seat,
    message: sent.dryRun
      ? 'Admitted (dry-run). Workspace mail is not connected, so the invite was not emailed.'
      : 'Admitted. Invite emailed to the member.',
    ...(dryRunInvite ? { dry_run_invite: dryRunInvite } : {}),
  })
})

async function rollbackAdmission(
  admin: SupabaseClient,
  applicationId: string,
  previousStatus: string,
  issued: Issued,
  inviteBefore: { id: string; status: string } | null,
) {
  await admin
    .from('applications')
    .update({
      status: previousStatus,
      founding_seat: null,
      member_user_id: null,
      admitted_at: null,
      admitted_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
  await admin.from('members').delete().eq('user_id', issued.userId)
  if (inviteBefore) {
    await admin
      .from('member_invites')
      .update({ status: inviteBefore.status, updated_at: new Date().toISOString() })
      .eq('id', inviteBefore.id)
      .eq('status', 'admitted')
  }
  if (issued.createdNew) await admin.auth.admin.deleteUser(issued.userId)
}

function claimStatus(message: string) {
  if (message.includes('seat_full') || message.includes('already_member') || message.includes('not_admissible')) {
    return 409
  }
  if (message.includes('forbidden')) return 403
  return 500
}

function claimFailure(message: string) {
  if (message.includes('seat_full')) return { error: 'That founding seat is full (50).' }
  if (message.includes('already_member')) return { error: 'This person is already a member.' }
  if (message.includes('not_admissible')) {
    return { error: 'Accept the application before admitting.' }
  }
  if (message.includes('forbidden')) return { error: 'Not allowed' }
  if (message.includes('invalid_capacity')) {
    return { error: 'Capacity amounts must be USD numbers, or blank.' }
  }
  return { error: message }
}

function readUsd(value: unknown): { value: number | null; error?: string } {
  if (value == null || value === '') return { value: null }
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000_000) {
    return { value: null, error: 'invalid' }
  }
  return { value: amount }
}

function clip(value: string | null | undefined, max: number) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function firstLine(value: string | null | undefined) {
  if (!value) return null
  const line = value
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean)
  return line ?? null
}

function httpsOrNull(value: string | null | undefined) {
  const clipped = clip(value, 500)
  if (!clipped || !/^https:\/\//i.test(clipped)) return null
  return clipped
}


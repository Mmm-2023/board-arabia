import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { issueCredential, type Issued } from '../_shared/credentials.ts'
import { requireStaff } from '../_shared/require_staff.ts'
import { SPONSOR_CAP, sponsorSeatAllowed } from '../_shared/sponsor_seat.ts'
import { sponsorInviteMail } from '../_shared/transactional_copy.ts'
import { corsHeaders, jsonResponse, logEmailEvent, publicSite, sendEmail } from './mail.ts'

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

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  const requestedSeat = String(body.seat || 'sponsor').trim()
  if (requestedSeat !== 'sponsor') {
    return jsonResponse(req, { error: 'invite-sponsor only creates a sponsor seat' }, 400)
  }

  const email = String(body.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return jsonResponse(req, { error: 'A valid email is required.' }, 400)
  }

  const { count: taken, error: countError } = await admin
    .from('members')
    .select('user_id', { count: 'exact', head: true })
    .eq('seat', 'sponsor')
    .in('status', ['invited', 'active'])
  if (countError) return jsonResponse(req, { error: countError.message }, 500)
  if (!sponsorSeatAllowed(taken ?? 0)) {
    return jsonResponse(req, { error: `Sponsor seats are full (${SPONSOR_CAP}).` }, 409)
  }

  const { data: existingMember } = await admin
    .from('members')
    .select('user_id')
    .eq('email', email)
    .maybeSingle()
  if (existingMember) {
    return jsonResponse(req, { error: 'This person is already a member.' }, 409)
  }

  const fullName = clip(body.full_name, 200)
  const company = clip(body.company, 200)
  const site = publicSite()
  const issued = await issueCredential(admin, email, site)
  if ('error' in issued) {
    return jsonResponse(req, { error: issued.error }, 502)
  }

  const { error: claimError } = await admin.rpc('claim_sponsor_seat', {
    p_user_id: issued.userId,
    p_email: email,
    p_invited_by: user.id,
    p_full_name: fullName,
    p_company: company,
  })
  if (claimError) {
    if (issued.createdNew) await admin.auth.admin.deleteUser(issued.userId)
    return jsonResponse(req, claimFailure(claimError.message), claimStatus(claimError.message))
  }

  const loginUrl = `${site}/login?next=/dashboard&otp_type=${issued.mode === 'magic_link' ? issued.otpType : 'invite'}`
  const confirmUrl =
    issued.mode === 'magic_link'
      ? `${site}/auth/confirm?token_hash=${encodeURIComponent(issued.tokenHash)}&type=${issued.otpType}`
      : null
  const greeting = fullName || 'there'
  const { subject, text, html } = sponsorInviteMail({ greeting, loginUrl, confirmUrl, issued })

  if (/calendar\.app\.google|nammco/i.test(`${subject}\n${text}\n${html}`)) {
    await rollbackSponsor(admin, issued)
    return jsonResponse(req, { error: 'Invite blocked' }, 500)
  }

  const sent = await sendEmail({ to: email, subject, html, text })
  await logEmailEvent(admin, {
    application_id: null,
    kind: 'sponsor_invite',
    recipient: email,
    subject,
    status: sent.status,
    provider: sent.provider,
    provider_id: sent.providerId,
    detail: sent.detail ?? null,
    payload: {
      invite_mode: issued.mode,
      seat: 'sponsor',
      has_otp: issued.mode === 'magic_link' && Boolean(issued.otp),
      has_temp_password: issued.mode === 'temp_password',
    },
  })

  if (sent.status === 'error') {
    await rollbackSponsor(admin, issued)
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
    seat: 'sponsor',
    message: sent.dryRun
      ? 'Sponsor invited (dry-run). Workspace mail is not connected, so the invite was not emailed.'
      : 'Sponsor invited. Set-password email sent.',
    ...(dryRunInvite ? { dry_run_invite: dryRunInvite } : {}),
  })
})

async function rollbackSponsor(admin: SupabaseClient, issued: Issued) {
  await admin.from('members').delete().eq('user_id', issued.userId)
  if (issued.createdNew) await admin.auth.admin.deleteUser(issued.userId)
}

function claimStatus(message: string) {
  if (message.includes('sponsor_cap') || message.includes('already_member')) return 409
  if (message.includes('invalid_email') || message.includes('invalid_invite')) return 400
  if (message.includes('forbidden')) return 403
  return 500
}

function claimFailure(message: string) {
  if (message.includes('sponsor_cap')) return { error: `Sponsor seats are full (${SPONSOR_CAP}).` }
  if (message.includes('already_member')) return { error: 'This person is already a member.' }
  if (message.includes('invalid_email')) return { error: 'A valid email is required.' }
  if (message.includes('forbidden')) return { error: 'Not allowed' }
  return { error: 'Could not claim the sponsor seat.' }
}

function clip(value: unknown, max: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { requireStaff } from '../_shared/require_staff.ts'
import { issueCredential, type Issued } from '../_shared/credentials.ts'
import { buildMasterInvite } from '../_shared/invite_copy.ts'
import {
  adminNotifyEmail,
  corsHeaders,
  jsonResponse,
  logEmailEvent,
  publicSite,
  sendEmail,
} from '../_shared/mail.ts'

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

  let email = ''
  let emailProvided = false
  let seat = 'ksa'
  let admitMember = true
  try {
    const body = await req.json()
    const requested = String(body.email || '').trim().toLowerCase()
    if (requested) {
      email = requested
      emailProvided = true
    }
    const requestedSeat = String(body.seat || '').trim()
    if (requestedSeat) seat = requestedSeat
    if (body.admit_member === false) admitMember = false
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  if (!emailProvided) email = adminNotifyEmail().trim().toLowerCase()
  if (!email) {
    return jsonResponse(req, { error: 'ADMIN_NOTIFY_EMAIL is not set' }, 500)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(req, { error: 'A usable email is required' }, 400)
  }
  if (seat !== 'ksa' && seat !== 'intl') {
    return jsonResponse(req, { error: 'seat must be ksa or intl' }, 400)
  }

  const site = publicSite()
  const issued = await issueCredential(admin, email, site)
  if ('error' in issued) return jsonResponse(req, { error: issued.error }, 502)

  const { error: staffError } = await admin.from('staff_users').upsert(
    { user_id: issued.userId, email, role: 'master' },
    { onConflict: 'user_id' },
  )
  if (staffError) {
    if (issued.createdNew) await admin.auth.admin.deleteUser(issued.userId)
    const needsMigration = /role|schema cache|column/i.test(staffError.message)
    return jsonResponse(
      req,
      {
        error: needsMigration
          ? 'Staff promotion needs the latest database migration.'
          : staffError.message,
      },
      500,
    )
  }

  const admission = await admitIfRequested(admin, {
    admitMember,
    email,
    seat,
    fullName: displayName(email),
    staffId: user.id,
    userId: issued.userId,
  })

  const memberOk = admission.memberOk
  const nextPath = memberOk ? '/dashboard' : '/admin'
  const otpType = issued.mode === 'magic_link' ? issued.otpType : 'invite'
  const loginUrl = `${site}/login?next=${nextPath}&otp_type=${otpType}`
  const confirmUrl = confirmLink(site, issued, nextPath)
  const staffLoginUrl = `${site}/login`
  const memberLoginUrl = `${site}/login?next=/dashboard`
  const copy = buildMasterInvite({
    greeting: admission.fullName || displayName(email),
    seatLabel: memberOk ? seatName(admission.seat || seat) : null,
    loginUrl,
    confirmUrl,
    staffLoginUrl,
    memberLoginUrl,
    issued:
      issued.mode === 'magic_link'
        ? { mode: 'magic_link', otp: issued.otp }
        : { mode: 'temp_password', tempPassword: issued.tempPassword },
  })

  const inviteBody = {
    confirm_url: confirmUrl,
    login_url: loginUrl,
    otp: issued.mode === 'magic_link' ? issued.otp || null : null,
    temp_password: issued.mode === 'temp_password' ? issued.tempPassword : null,
  }

  if (/calendar\.app\.google|nammco/i.test(`${copy.subject}\n${copy.text}\n${copy.html}`)) {
    if (admission.createdMember && admission.applicationId) {
      await rollbackMember(admin, admission.applicationId, issued.userId)
    }
    return jsonResponse(req, { error: 'Invite blocked' }, 500)
  }

  const sent = await sendEmail({
    to: email,
    subject: copy.subject,
    html: copy.html,
    text: copy.text,
  })
  await logEmailEvent(admin, {
    application_id: admission.applicationId,
    kind: memberOk ? 'member_invite' : 'staff_invite',
    recipient: email,
    subject: copy.subject,
    status: sent.status,
    provider: sent.provider,
    provider_id: sent.providerId,
    detail: sent.detail ?? null,
    payload: {
      invite_mode: issued.mode,
      seat: memberOk ? admission.seat : null,
      has_otp: issued.mode === 'magic_link' && Boolean(issued.otp),
      has_temp_password: issued.mode === 'temp_password',
      staff_role: 'master',
      member: memberOk,
    },
  })

  const mailed = sent.status === 'sent'
  const parts = ['Master staff is ready.']
  if (memberOk && admission.createdMember) parts.push('Founding seat claimed.')
  if (memberOk && admission.alreadyMember) parts.push('Founding membership was already in place.')
  if (admission.memberError) parts.push(admission.memberError)
  if (sent.dryRun) {
    parts.push('Workspace mail is not connected, so the invite was not emailed.')
  } else if (!mailed) {
    parts.push('Outbound mail failed, so the one-time link is shown here.')
  } else {
    parts.push('Invite emailed.')
  }

  return jsonResponse(req, {
    ok: true,
    dry_run: sent.dryRun,
    staff: true,
    member: memberOk,
    seat: memberOk ? admission.seat : null,
    email_status: sent.status,
    message: parts.join(' '),
    ...(mailed ? {} : { dry_run_invite: inviteBody }),
  })
})

type Admission = {
  memberOk: boolean
  createdMember: boolean
  alreadyMember: boolean
  memberError: string | null
  seat: string | null
  applicationId: string | null
  fullName: string | null
}

async function admitIfRequested(
  admin: SupabaseClient,
  opts: {
    admitMember: boolean
    email: string
    seat: string
    fullName: string
    staffId: string
    userId: string
  },
): Promise<Admission> {
  if (!opts.admitMember) {
    return {
      memberOk: false,
      createdMember: false,
      alreadyMember: false,
      memberError: null,
      seat: null,
      applicationId: null,
      fullName: opts.fullName,
    }
  }

  const { data: existing, error: existingError } = await admin
    .from('members')
    .select('user_id, seat, status')
    .eq('email', opts.email)
    .maybeSingle()
  if (existingError) {
    return {
      memberOk: false,
      createdMember: false,
      alreadyMember: false,
      memberError: existingError.message,
      seat: null,
      applicationId: null,
      fullName: opts.fullName,
    }
  }
  if (existing) {
    if (existing.status === 'suspended') {
      return {
        memberOk: false,
        createdMember: false,
        alreadyMember: true,
        memberError: 'This member is suspended. Restore them from the members list.',
        seat: existing.seat,
        applicationId: null,
        fullName: opts.fullName,
      }
    }
    return {
      memberOk: true,
      createdMember: false,
      alreadyMember: true,
      memberError: null,
      seat: existing.seat,
      applicationId: null,
      fullName: opts.fullName,
    }
  }

  const { count, error: countError } = await admin
    .from('members')
    .select('user_id', { count: 'exact', head: true })
    .eq('seat', opts.seat)
    .in('status', ['invited', 'active'])
  if (countError) {
    return failed(opts.fullName, countError.message)
  }
  if ((count ?? 0) >= SEAT_CAP) {
    return failed(opts.fullName, 'That founding seat is full (50).')
  }

  const prepared = await prepareApplication(admin, opts.email, opts.fullName, opts.staffId)
  if ('error' in prepared) return failed(opts.fullName, prepared.error)

  const { error: claimError } = await admin.rpc('claim_founding_seat', {
    p_user_id: opts.userId,
    p_application_id: prepared.id,
    p_email: opts.email,
    p_seat: opts.seat,
    p_invited_by: opts.staffId,
    p_full_name: opts.fullName,
    p_phone: null,
    p_linkedin_url: null,
    p_company: 'Direct invite',
    p_headline: 'Founding member',
  })
  if (claimError) {
    await prepared.undo()
    return failed(opts.fullName, claimFailure(claimError.message))
  }

  return {
    memberOk: true,
    createdMember: true,
    alreadyMember: false,
    memberError: null,
    seat: opts.seat,
    applicationId: prepared.id,
    fullName: opts.fullName,
  }
}

function failed(fullName: string, memberError: string): Admission {
  return {
    memberOk: false,
    createdMember: false,
    alreadyMember: false,
    memberError,
    seat: null,
    applicationId: null,
    fullName,
  }
}

async function prepareApplication(
  admin: SupabaseClient,
  email: string,
  fullName: string,
  staffId: string,
): Promise<{ id: string; undo: () => Promise<void> } | { error: string }> {
  const { data: existing, error } = await admin
    .from('applications')
    .select('id, status')
    .ilike('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) return { error: error.message }

  const row = existing?.[0]
  const now = new Date().toISOString()
  if (!row) {
    const { data: inserted, error: insertError } = await admin
      .from('applications')
      .insert({
        full_name: fullName,
        email,
        turnover: 'Direct invite',
        companies: 'Direct invite',
        job_titles: 'Founding member',
        linkedin_url: null,
        status: 'accepted',
        notes: 'direct_invite',
        decision_at: now,
        decision_by: staffId,
        calendar_slot: null,
      })
      .select('id')
      .single()
    if (insertError || !inserted) {
      return { error: insertError?.message || 'Could not create the application.' }
    }
    return {
      id: inserted.id,
      undo: async () => {
        await admin.from('applications').delete().eq('id', inserted.id)
      },
    }
  }

  if (row.status === 'accepted' || row.status === 'verified') {
    return { id: row.id, undo: async () => {} }
  }

  const previous = row.status
  const { error: updateError } = await admin
    .from('applications')
    .update({
      status: 'accepted',
      decision_at: now,
      decision_by: staffId,
      updated_at: now,
    })
    .eq('id', row.id)
  if (updateError) return { error: updateError.message }
  return {
    id: row.id,
    undo: async () => {
      await admin
        .from('applications')
        .update({ status: previous, updated_at: new Date().toISOString() })
        .eq('id', row.id)
    },
  }
}

async function rollbackMember(admin: SupabaseClient, applicationId: string, userId: string) {
  await admin
    .from('applications')
    .update({
      status: 'accepted',
      founding_seat: null,
      member_user_id: null,
      admitted_at: null,
      admitted_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
  await admin.from('members').delete().eq('user_id', userId)
}

function confirmLink(site: string, issued: Issued, nextPath: string): string | null {
  if (issued.mode !== 'magic_link') return null
  return `${site}/auth/confirm?token_hash=${encodeURIComponent(issued.tokenHash)}&type=${issued.otpType}&next=${encodeURIComponent(nextPath)}`
}

function claimFailure(message: string) {
  if (message.includes('seat_full')) return 'That founding seat is full (50).'
  if (message.includes('already_member')) return 'This person is already a member.'
  if (message.includes('not_admissible')) return 'The application could not be admitted.'
  if (message.includes('forbidden')) return 'Not allowed'
  return message
}

function seatName(seat: string) {
  return seat === 'ksa' ? 'Saudi Arabia' : 'International'
}

function displayName(email: string) {
  const local = email.split('@')[0] || 'Member'
  const cleaned = local.replace(/[._-]+/g, ' ').trim().slice(0, 80)
  return cleaned || 'Member'
}

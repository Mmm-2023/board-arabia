import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { applyInviteUrl, peerInviteMail, whatsAppInviteUrl } from '../_shared/peer_invite.ts'
import { corsHeaders, jsonResponse, logEmailEvent, publicSite, sendEmail } from './mail.ts'

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
  const { data: member } = await admin
    .from('members')
    .select('user_id, email, status, invites_remaining')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member || (member.status !== 'invited' && member.status !== 'active')) {
    return jsonResponse(req, { error: 'Only an active member can send invites.' }, 403)
  }
  if ((member.invites_remaining ?? 0) <= 0) {
    return jsonResponse(req, { error: 'No invites remaining.' }, 409)
  }

  let channel = ''
  let email = ''
  let phone = ''
  try {
    const body = await req.json()
    channel = String(body.channel || '')
    email = typeof body.email === 'string' ? body.email.trim().slice(0, 320) : ''
    phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 32) : ''
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  if (channel !== 'email' && channel !== 'whatsapp') {
    return jsonResponse(req, { error: 'Choose email or WhatsApp.' }, 400)
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .maybeSingle()
  const inviterLabel = oneLine(profile?.full_name || '') || 'A Board Arabia member'

  const { data: issued, error: issueError } = await admin.rpc('issue_member_invite', {
    p_member_id: user.id,
    p_channel: channel,
    p_recipient_email: channel === 'email' ? email : null,
    p_recipient_phone: phone || null,
  })
  if (issueError || !issued || typeof issued !== 'object') {
    const mapped = mapInviteError(issueError?.message || '')
    return jsonResponse(req, { error: mapped.error }, mapped.status)
  }

  const row = issued as {
    id?: string
    token?: string
    invites_remaining?: number
    invites_granted?: number
  }
  const token = String(row.token || '')
  const inviteId = String(row.id || '')
  if (!token || !inviteId) {
    return jsonResponse(req, { error: 'Invite could not be sent.' }, 500)
  }

  const site = publicSite()
  const applyUrl = applyInviteUrl(site, token)
  const phoneDigits = phone.replace(/\D/g, '')
  const whatsappUrl = channel === 'whatsapp' ? whatsAppInviteUrl(phoneDigits || null, applyUrl) : null

  if (channel === 'whatsapp') {
    return jsonResponse(req, {
      ok: true,
      channel,
      invites_remaining: row.invites_remaining,
      invites_granted: row.invites_granted ?? 2,
      apply_url: applyUrl,
      whatsapp_url: whatsappUrl,
      dry_run: false,
    })
  }

  const { subject, text, html } = peerInviteMail(applyUrl, inviterLabel)
  if (/calendar\.app\.google|nammco/i.test(`${subject}\n${text}\n${html}`)) {
    await admin.rpc('release_member_invite', { p_invite_id: inviteId })
    return jsonResponse(req, { error: 'Invite blocked' }, 500)
  }

  const sent = await sendEmail({ to: email, subject, html, text })
  await logEmailEvent(admin, {
    application_id: null,
    kind: 'peer_invite',
    recipient: email,
    subject,
    status: sent.status,
    provider: sent.provider,
    provider_id: sent.providerId,
    detail: sent.detail ?? null,
    payload: { channel: 'email', invite_id: inviteId },
  })

  if (sent.status === 'error') {
    await admin.rpc('release_member_invite', { p_invite_id: inviteId })
    return jsonResponse(req, { error: sent.detail || 'Email failed' }, 502)
  }

  return jsonResponse(req, {
    ok: true,
    channel,
    dry_run: sent.dryRun,
    invites_remaining: row.invites_remaining,
    invites_granted: row.invites_granted ?? 2,
    apply_url: applyUrl,
    whatsapp_url: null,
    message: sent.dryRun
      ? 'Invite saved. Workspace mail is not connected, so the email was not sent. The link is still yours to share.'
      : 'Invite emailed.',
  })
})

function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
}

function mapInviteError(message: string) {
  if (message.includes('invites_exhausted')) {
    return { status: 409, error: 'No invites remaining.' }
  }
  if (message.includes('invalid_email')) {
    return { status: 400, error: 'A valid email is required.' }
  }
  if (message.includes('invalid_phone')) {
    return { status: 400, error: 'Enter a phone number with country code, or leave it blank.' }
  }
  if (message.includes('cannot_invite_self')) {
    return { status: 400, error: 'You cannot invite your own email.' }
  }
  if (message.includes('member_inactive') || message.includes('not_member')) {
    return { status: 403, error: 'Only an active member can send invites.' }
  }
  if (message.includes('invalid_channel')) {
    return { status: 400, error: 'Choose email or WhatsApp.' }
  }
  if (message.includes('forbidden')) return { status: 403, error: 'Not allowed.' }
  return { status: 500, error: 'Invite could not be sent.' }
}

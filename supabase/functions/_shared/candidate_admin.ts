import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { makeTempPassword } from './credentials.ts'
import {
  registerCandidate,
  verifyCandidate,
  verifyTurnstileToken,
  type RegisterBody,
  type RegisterDeps,
  type VerifyBody,
  type VerifyDeps,
} from './candidate_flow.ts'
import { disposableDomain, domainSuffixes, emailDomain } from './email_domains.ts'
import { publicSite, sendEmail } from './mail.ts'
import { bumpKeyedLimit } from './rate_limit.ts'

type Admin = SupabaseClient

function readEnv(name: string) {
  return Deno.env.get(name)?.trim() || ''
}

async function sendBoardMail(message: { to: string; subject: string; text: string; html: string }) {
  const sent = await sendEmail(message)
  return { ok: sent.status === 'sent' || sent.status === 'dry_run', dryRun: sent.dryRun || sent.status === 'dry_run' }
}

function registerDeps(admin: Admin): RegisterDeps {
  return {
    now: () => new Date(),
    pepper: readEnv('CANDIDATE_CODE_PEPPER'),
    turnstileSecret: readEnv('TURNSTILE_SECRET_KEY'),
    site: publicSite(),
    verifyTurnstile: verifyTurnstileToken,
    emailIsMember: async (email) => {
      const { data } = await admin.from('members').select('user_id').eq('email', email).maybeSingle()
      return Boolean(data)
    },
    findCandidate: async (email) => {
      const { data } = await admin
        .from('candidates')
        .select('user_id, email_verified_at')
        .eq('email', email)
        .maybeSingle()
      if (!data?.user_id) return null
      return { userId: data.user_id, verified: Boolean(data.email_verified_at) }
    },
    findAuthUserId: async (email) => {
      const { data, error } = await admin.rpc('candidate_auth_user_id', { p_email: email })
      if (error || !data) return null
      return String(data)
    },
    createAuthUser: async (email) => {
      const created = await admin.auth.admin.createUser({
        email,
        password: makeTempPassword(),
        email_confirm: false,
      })
      const userId = created.data.user?.id || ''
      if (created.error || !userId) return { error: created.error?.message || 'create_failed' }
      return { userId }
    },
    insertCandidate: async (row) => {
      const { error } = await admin.from('candidates').insert({
        user_id: row.userId,
        email: row.email,
        full_name: row.fullName,
        role: row.role,
        region: row.region,
        request_state: 'open',
        invite_reason: row.inviteReason,
        free_webmail: row.freeWebmail,
        ft_source: row.attribution.ft_source,
        ft_medium: row.attribution.ft_medium,
        ft_campaign: row.attribution.ft_campaign,
        ft_content: row.attribution.ft_content,
        ft_term: row.attribution.ft_term,
        ft_referrer_host: row.attribution.ft_referrer_host,
        ft_landing_path: row.attribution.ft_landing_path,
        ft_at: row.attribution.ft_at,
        lt_source: row.attribution.lt_source,
        lt_medium: row.attribution.lt_medium,
        lt_campaign: row.attribution.lt_campaign,
        analytics_id: row.attribution.analytics_id,
        attribution_version: row.attribution.attribution_version,
      })
      return error ? { error: error.message } : {}
    },
    issueCode: async (userId, codeHash, linkHash, expiresAt) => {
      const { data, error } = await admin.rpc('candidate_issue_code', {
        p_user_id: userId,
        p_code_hash: codeHash,
        p_link_hash: linkHash,
        p_expires_at: expiresAt,
      })
      if (error) return 'error'
      if (data === 'ok' || data === 'cooldown' || data === 'rate_limited') return data
      return 'error'
    },
    voidLatestCode: async (userId) => {
      await admin.rpc('candidate_void_latest_code', { p_user_id: userId })
    },
    sendMail: sendBoardMail,
    recordEvent: async (userId, kind, detail) => {
      await admin.from('candidate_events').insert({
        candidate_user_id: userId,
        kind,
        detail,
      })
    },
    domainStatus: (email) => domainStatus(admin, email),
    mailboxOk: async (email) => mailboxAccepts(emailDomain(email)),
    consumeRegisterLimit: (email, remoteIp) => consumeRegisterLimit(admin, email, remoteIp),
    // The invite is spent here, when the invitee registers. The wallet returns
    // it only if this person never verifies. A decline does not refill it.
    claimInvite: async (userId, token, reason) => {
      if (!/^[A-Za-z0-9_-]{43,80}$/.test(token)) return false
      const { data: invite } = await admin
        .from('member_invites')
        .select('id, inviter_member_id, status, expires_at')
        .eq('token', token)
        .maybeSingle()
      if (!invite) return false
      if (invite.status !== 'pending' && invite.status !== 'opened') return false
      if (Date.parse(invite.expires_at) <= Date.now()) return false
      const now = new Date().toISOString()
      const { data: claimed } = await admin
        .from('member_invites')
        .update({ status: 'applied', applied_at: now })
        .eq('id', invite.id)
        .in('status', ['pending', 'opened'])
        .gt('expires_at', now)
        .select('id')
        .maybeSingle()
      if (!claimed) return false
      const { error } = await admin
        .from('candidates')
        .update({
          invited_by_member_id: invite.inviter_member_id,
          invite_token_id: invite.id,
          invite_reason: reason,
        })
        .eq('user_id', userId)
      return !error
    },
  }
}

function verifyDeps(admin: Admin): VerifyDeps {
  return {
    pepper: readEnv('CANDIDATE_CODE_PEPPER'),
    site: publicSite(),
    consume: async (input) => {
      const { data, error } = await admin.rpc('candidate_consume_secret', {
        p_email: input.email,
        p_code_hash: input.codeHash,
        p_link_hash: input.linkHash,
      })
      if (error || !data || typeof data !== 'object') return { status: 'missing', userId: null }
      const row = data as { status?: string; user_id?: string }
      return { status: row.status || 'missing', userId: row.user_id || null }
    },
    markVerified: async (userId) => {
      const { data, error } = await admin
        .from('candidates')
        .update({ email_verified_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('email_verified_at', null)
        .select('user_id')
        .maybeSingle()
      if (error) return { error: error.message }
      return { first: Boolean(data) }
    },
    confirmAuthEmail: async (userId) => {
      const updated = await admin.auth.admin.updateUserById(userId, { email_confirm: true })
      return updated.error ? { error: updated.error.message } : {}
    },
    issueSession: async (email) => {
      const site = publicSite()
      const magic = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: `${site}/auth/confirm` },
      })
      const tokenHash = magic.data?.properties?.hashed_token || ''
      if (magic.error || !tokenHash) return { error: magic.error?.message || 'no_session' }
      return { tokenHash, email }
    },
    lookupEmail: async (userId) => {
      const { data } = await admin.from('candidates').select('email').eq('user_id', userId).maybeSingle()
      return data?.email || null
    },
    sendMail: sendBoardMail,
    recordEvent: async (userId, kind, detail) => {
      await admin.from('candidate_events').insert({
        candidate_user_id: userId,
        kind,
        detail,
      })
    },
  }
}

async function domainStatus(admin: Admin, email: string): Promise<'ok' | 'disposable' | 'blocked'> {
  if (disposableDomain(email)) return 'disposable'
  const suffixes = domainSuffixes(emailDomain(email))
  if (suffixes.length === 0) return 'ok'
  const { data: extra, error } = await admin.from('disposable_email_domains').select('domain').in('domain', suffixes)
  if (!error && extra && extra.length > 0) return 'disposable'
  const { data: blocked, error: blockedError } = await admin
    .from('blocked_email_domains')
    .select('domain')
    .in('domain', suffixes)
  if (!blockedError && blocked && blocked.length > 0) return 'blocked'
  return 'ok'
}

async function mailboxAccepts(domain: string) {
  if (!domain || domain === 'example.com') return true
  try {
    const mx = await Deno.resolveDns(domain, 'MX')
    if (Array.isArray(mx) && mx.length > 0) return true
    const addresses = await Deno.resolveDns(domain, 'A')
    return Array.isArray(addresses) && addresses.length > 0
  } catch {
    return true
  }
}

async function consumeRegisterLimit(admin: Admin, email: string, remoteIp: string) {
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  const emailHit = await bumpKeyedLimit(admin, 'register_rate_limits', `reg:email:${email}`, hour, 3)
  const ipHit = await bumpKeyedLimit(admin, 'register_rate_limits', `reg:ip:${remoteIp || 'unknown'}`, day, 10)
  if (emailHit === 'error' || ipHit === 'error') return 'error' as const
  if (emailHit === 'limited' || ipHit === 'limited') return 'limited' as const
  return 'ok' as const
}

export async function handleRegister(admin: Admin, body: RegisterBody, remoteIp: string) {
  return registerCandidate(body, remoteIp, registerDeps(admin))
}

export async function handleVerify(admin: Admin, body: VerifyBody) {
  return verifyCandidate(body, verifyDeps(admin))
}

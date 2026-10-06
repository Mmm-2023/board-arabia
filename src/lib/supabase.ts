import { createClient } from '@supabase/supabase-js'
import { cleanDeskNote } from '../../supabase/functions/_shared/desk_note.ts'
import type { AvatarStyle, StoredAvatarStyle } from './avatarStyle'
import type { Database } from './database.types'
import type { CapacityPayload } from './capacity'
import { parseCapacity, type FoundingCapacity, type FoundingSeat, type MemberSeat } from './member'
import { parsePlatformStats, type PlatformStats } from './platformStats'
import {
  presentSponsorCatalog,
  presentSponsorDesk,
  type PackageSave,
  type SponsorCatalog,
  type SponsorDesk,
} from './sponsorDesk'
import { readRecoveryLocation } from './recovery'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.',
  )
}

/** Recovery emails must return here. Do not point this at another host. */
export const passwordResetRedirect = 'https://boardarabia.com/auth/confirm'
const RECOVERY_KEY = 'ba-password-recovery'

const recoveryLanding = typeof window === 'undefined' ? null : readRecoveryLocation(window.location.href)
if (recoveryLanding?.recovery) sessionStorage.setItem(RECOVERY_KEY, '1')
if (recoveryLanding?.redirectTo) window.location.replace(recoveryLanding.redirectTo)

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    // Implicit so a recovery email can deliver access_token in the hash.
    // Skip detection while we are leaving this page, or the client clears that hash.
    flowType: 'implicit',
    detectSessionInUrl: !recoveryLanding?.redirectTo,
  },
})

let recoveryFromEvent = false
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event !== 'PASSWORD_RECOVERY') return
    recoveryFromEvent = true
    sessionStorage.setItem(RECOVERY_KEY, '1')
  })
}

export function passwordRecoveryPending() {
  if (recoveryFromEvent) return true
  if (typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem(RECOVERY_KEY) === '1'
}

export function clearPasswordRecovery() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(RECOVERY_KEY)
}

export async function sendPasswordReset(email: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: passwordResetRedirect,
  })
  if (error) return { error: error.message }
  return {}
}

export type ApplicationStatus =
  | 'pending'
  | 'verified'
  | 'declined'
  | 'accepted'
  | 'rejected'
  | 'admitted'

export type Application = {
  id: string
  created_at: string
  updated_at: string
  full_name: string | null
  email: string | null
  phone: string | null
  turnover: string
  fo_aum: string | null
  investable_capacity_usd: number | string | null
  include_in_public_aggregates: boolean
  companies: string
  job_titles: string
  linkedin_url: string | null
  calendar_slot: string | null
  status: ApplicationStatus
  notes: string | null
  invite_event_id: string | null
  invite_sent_at: string | null
  decision_at: string | null
  decision_by: string | null
  founding_seat: 'ksa' | 'intl' | null
  member_user_id: string | null
  admitted_at: string | null
  admitted_by: string | null
  invited_by_member_id: string | null
  invite_token_id: string | null
  invite_reason: string | null
  ft_source: string | null
  ft_medium: string | null
  ft_campaign: string | null
  ft_content: string | null
  ft_term: string | null
  ft_referrer_host: string | null
  ft_landing_path: string | null
  ft_at: string | null
  lt_source: string | null
  lt_medium: string | null
  lt_campaign: string | null
  analytics_id: string | null
  attribution_version: number | null
}

const functionsBase = `${url.replace(/\/$/, '')}/functions/v1`

async function anonHeaders(): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
  }
}

async function staffHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  return {
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
  }
}

export async function submitApplication(payload: {
  full_name: string
  email: string
  phone?: string | null
  turnover: string
  fo_aum?: string | null
  investable_capacity_usd?: number | null
  include_in_public_aggregates?: boolean
  linkedin_url: string
  job_titles: string
  companies: string
  invite_token?: string | null
  invite_reason?: string | null
  first_touch?: Record<string, unknown> | null
  last_touch?: Record<string, unknown> | null
  analytics_id?: string | null
  attribution_version?: number | null
}): Promise<{ error?: string; dryRun?: boolean; id?: string; inviteAttached?: boolean }> {
  try {
    const res = await fetch(`${functionsBase}/submit-application`, {
      method: 'POST',
      headers: await anonHeaders(),
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      dry_run?: boolean
      id?: string
      invite_attached?: boolean
    }
    if (!res.ok) return { error: body.error || `Submit failed (${res.status})` }
    return {
      dryRun: Boolean(body.dry_run),
      id: body.id,
      inviteAttached: Boolean(body.invite_attached),
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Submit failed' }
  }
}

export async function deleteCandidateAccount(): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${functionsBase}/delete-candidate-account`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({}),
    })
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) return { error: payload.error || 'Could not delete the account.' }
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not delete the account.' }
  }
}

export async function requestMembership(body: Record<string, unknown>): Promise<{ error?: string; state?: string }> {
  try {
    const res = await fetch(`${functionsBase}/request-membership`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify(body),
    })
    const payload = (await res.json().catch(() => ({}))) as { error?: string; state?: string }
    if (!res.ok) return { error: payload.error || 'Could not save the request.' }
    return { state: payload.state }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the request.' }
  }
}

export async function fetchMarketingFunnel(
  from: string,
  to: string,
  channel: string,
): Promise<{ data?: unknown; error?: string; denied?: boolean }> {
  const { data, error } = await supabase.rpc('marketing_funnel_counts', {
    p_from: from,
    p_to: to,
    p_channel: channel,
  })
  if (error) {
    const denied = error.code === '42501' || /forbidden/i.test(error.message)
    return { error: denied ? 'You do not have access to marketing counts.' : 'Marketing counts could not be loaded.', denied }
  }
  return { data }
}

export async function fetchMarketingStats(
  from: string,
  to: string,
  channel: string,
): Promise<{ status: 'ok' | 'not_live' | 'error'; body?: unknown; lastGoodAt?: string | null }> {
  try {
    const res = await fetch(`${functionsBase}/marketing-stats`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({ from, to, channel }),
    })
    if (res.status === 403) return { status: 'error' }
    if (res.status === 404) return { status: 'not_live' }
    const payload = (await res.json().catch(() => null)) as { status?: string; last_good_at?: string | null } | null
    if (!payload) return { status: 'not_live' }
    if (payload.status === 'not_live') return { status: 'not_live' }
    if (payload.status === 'error') return { status: 'error', lastGoodAt: payload.last_good_at ?? null }
    if (payload.status === 'ok') return { status: 'ok', body: payload }
    return { status: 'not_live' }
  } catch {
    return { status: 'not_live' }
  }
}

export async function reviewMembership(body: Record<string, unknown>): Promise<{ error?: string; state?: string }> {
  try {
    const res = await fetch(`${functionsBase}/review-membership`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify(body),
    })
    const payload = (await res.json().catch(() => ({}))) as { error?: string; state?: string }
    if (!res.ok) return { error: payload.error || 'Could not update the request.' }
    return { state: payload.state }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not update the request.' }
  }
}

export async function registerCandidate(payload: {
  full_name: string
  email: string
  role: string
  region: string
  consent: boolean
  turnstile_token: string
  invite_token?: string | null
  invite_reason?: string | null
  first_touch?: Record<string, string | null>
  last_touch?: Record<string, string | null>
  analytics_id?: string | null
  resend?: boolean
  company_fax?: string
  form_started_at?: number
}): Promise<{ error?: string; errorCode?: string; dryRun?: boolean }> {
  try {
    const res = await fetch(`${functionsBase}/register-candidate`, {
      method: 'POST',
      headers: await anonHeaders(),
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      error_code?: string
      dry_run?: boolean
    }
    if (!res.ok) return { error: body.error || 'Could not register.', errorCode: body.error_code || 'server' }
    return { dryRun: Boolean(body.dry_run), errorCode: '' }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not register.', errorCode: 'server' }
  }
}

export async function verifyCandidate(payload: {
  email?: string
  code?: string
  token?: string
}): Promise<{
  error?: string
  errorCode?: string
  tokenHash?: string
  alreadyVerified?: boolean
  method?: string
}> {
  try {
    const res = await fetch(`${functionsBase}/verify-candidate`, {
      method: 'POST',
      headers: await anonHeaders(),
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      error_code?: string
      token_hash?: string
      already_verified?: boolean
      method?: string
    }
    if (!res.ok) return { error: body.error || 'That code is not valid.', errorCode: body.error_code || 'invalid_code' }
    return {
      tokenHash: body.token_hash,
      alreadyVerified: Boolean(body.already_verified),
      method: body.method,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'That code is not valid.', errorCode: 'server' }
  }
}

export async function decideApplication(
  applicationId: string,
  decision: 'accepted' | 'rejected',
): Promise<{
  error?: string
  message?: string
  dryRun?: boolean
  inviteEventId?: string | null
}> {
  try {
    const res = await fetch(`${functionsBase}/decide-application`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({
        application_id: applicationId,
        decision,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
      dry_run?: boolean
      invite_event_id?: string
    }
    if (!res.ok) return { error: body.error || `Decision failed (${res.status})` }
    return {
      message: body.message,
      dryRun: Boolean(body.dry_run),
      inviteEventId: body.invite_event_id ?? null,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Decision failed' }
  }
}

export type DryRunInvite = {
  confirmUrl: string | null
  loginUrl: string
  otp: string | null
  tempPassword: string | null
}

export async function admitMember(
  applicationId: string,
  seat: FoundingSeat,
  capacity: CapacityPayload,
): Promise<{
  error?: string
  message?: string
  dryRun?: boolean
  dryRunInvite?: DryRunInvite
}> {
  try {
    const res = await fetch(`${functionsBase}/admit-member`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({
        application_id: applicationId,
        seat,
        investable_capacity_usd: capacity.investable_capacity_usd,
        fo_aum_usd: capacity.fo_aum_usd,
        turnover_usd: capacity.turnover_usd,
        include_in_public_aggregates: capacity.include_in_public_aggregates,
        capacity_verified: capacity.capacity_verified,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
      dry_run?: boolean
      dry_run_invite?: {
        confirm_url?: string | null
        login_url?: string
        otp?: string | null
        temp_password?: string | null
      }
    }
    if (!res.ok) return { error: body.error || `Admit failed (${res.status})` }
    const invite = body.dry_run_invite
    return {
      message: body.message,
      dryRun: Boolean(body.dry_run),
      dryRunInvite: invite
        ? {
            confirmUrl: invite.confirm_url ?? null,
            loginUrl: invite.login_url || '',
            otp: invite.otp ?? null,
            tempPassword: invite.temp_password ?? null,
          }
        : undefined,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Admit failed' }
  }
}

export type MemberAdminRow = {
  user_id: string
  email: string
  seat: MemberSeat
  status: 'invited' | 'active' | 'suspended'
  invites_remaining: number
  invites_granted: number
  tier?: 'founding' | 'member' | null
  tiers?: string[] | null
  founding_number?: number | null
}

const MEMBER_ADMIN_COLUMNS =
  'user_id, email, seat, status, invites_remaining, invites_granted, tier, founding_number, tiers'
const MEMBER_ADMIN_COLUMNS_LEGACY =
  'user_id, email, seat, status, invites_remaining, invites_granted, tier, founding_number'

/** Reads tiers when the column exists. Falls back until that migration is applied. */
export async function fetchAdminMembers(): Promise<{
  data: MemberAdminRow[] | null
  error: { message: string } | null
}> {
  const full = await supabase
    .from('members')
    .select(MEMBER_ADMIN_COLUMNS)
    .order('invited_at', { ascending: false })
  if (!full.error) return { data: full.data as MemberAdminRow[] | null, error: null }
  if (!/tiers/i.test(full.error.message)) return { data: null, error: full.error }
  const legacy = await supabase
    .from('members')
    .select(MEMBER_ADMIN_COLUMNS_LEGACY)
    .order('invited_at', { ascending: false })
  if (legacy.error) return { data: null, error: legacy.error }
  return { data: (legacy.data ?? []) as MemberAdminRow[], error: null }
}

export async function staffSetMemberTiers(
  userId: string,
  tiers: string[],
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('set_member_tiers', {
    p_user_id: userId,
    p_tiers: tiers,
  })
  if (error) return { error: error.message }
  return {}
}

export async function inviteSponsor(input: {
  email: string
  company: string
}): Promise<{
  error?: string
  message?: string
  dryRun?: boolean
  dryRunInvite?: DryRunInvite
}> {
  try {
    const res = await fetch(`${functionsBase}/invite-sponsor`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({
        email: input.email.trim(),
        company: input.company.trim(),
        seat: 'sponsor',
      }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
      dry_run?: boolean
      dry_run_invite?: {
        confirm_url?: string | null
        login_url?: string
        otp?: string | null
        temp_password?: string | null
      }
    }
    const invite = body.dry_run_invite
    const dryRunInvite = invite
      ? {
          confirmUrl: invite.confirm_url ?? null,
          loginUrl: invite.login_url || '',
          otp: invite.otp ?? null,
          tempPassword: invite.temp_password ?? null,
        }
      : undefined
    if (!res.ok) {
      return { error: body.error || `Sponsor invite failed (${res.status})`, dryRunInvite }
    }
    return {
      message: body.message,
      dryRun: Boolean(body.dry_run),
      dryRunInvite,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sponsor invite failed' }
  }
}

export type MemberInviteAdminRow = {
  id: string
  application_id: string | null
  channel: 'email' | 'whatsapp'
  status: string
  inviter_member_id: string
}

export type InviteLookup =
  | { valid: true; inviterLabel: string }
  | { valid: false; state: 'invalid' | 'expired' | 'used' | 'limited' }

export async function lookupMemberInvite(token: string): Promise<InviteLookup> {
  const { data, error } = await supabase.rpc('lookup_member_invite', { p_token: token })
  if (error || !data || typeof data !== 'object') return { valid: false, state: 'invalid' }
  const row = data as { valid?: boolean; state?: string; inviter_label?: string }
  if (row.valid && row.inviter_label) {
    return { valid: true, inviterLabel: row.inviter_label }
  }
  const state = row.state
  if (state === 'expired' || state === 'used' || state === 'limited') {
    return { valid: false, state }
  }
  return { valid: false, state: 'invalid' }
}

/** Best-effort desk alert. The queue is the record if this call is not deployed yet. */
export async function notifyDeskIntro(introId: string): Promise<void> {
  try {
    await fetch(`${functionsBase}/notify-desk-intro`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({ intro_id: introId }),
    })
  } catch {
    // Accept already saved. Staff still see the desk queue.
  }
}

export async function sendDeskNote(input: { topic: string; message: string }): Promise<{ error?: string }> {
  const cleaned = cleanDeskNote(input)
  if (!cleaned.ok) return { error: cleaned.error }
  try {
    const res = await fetch(`${functionsBase}/contact-desk`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({ topic: cleaned.topic, message: cleaned.message }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      const message = typeof body.error === 'string' ? body.error : ''
      const safe = message.length > 0 && message.length < 180 && !message.includes('@')
      return { error: safe ? message : 'Could not reach the desk. Try again.' }
    }
    return {}
  } catch (err) {
    return { error: err instanceof Error ? 'Could not reach the desk. Try again.' : 'Could not reach the desk. Try again.' }
  }
}

export async function sendMemberInvite(input: {
  channel: 'email' | 'whatsapp'
  email?: string
  phone?: string
  name?: string
}): Promise<{
  error?: string
  message?: string
  dryRun?: boolean
  invitesRemaining?: number
  applyUrl?: string
  whatsappUrl?: string | null
}> {
  try {
    const res = await fetch(`${functionsBase}/send-member-invite`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({
        channel: input.channel,
        email: input.email || null,
        phone: input.phone || null,
        name: input.name || null,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
      dry_run?: boolean
      invites_remaining?: number
      apply_url?: string
      whatsapp_url?: string | null
    }
    if (!res.ok) return { error: body.error || `Invite failed (${res.status})` }
    return {
      message: body.message,
      dryRun: Boolean(body.dry_run),
      invitesRemaining: body.invites_remaining,
      applyUrl: body.apply_url,
      whatsappUrl: body.whatsapp_url ?? null,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invite failed' }
  }
}

export type EmailEventAdminRow = {
  id: string
  created_at: string
  kind: string
  recipient: string
  subject: string
  status: string
  detail?: string | null
}

export type StaffDirectoryRow = {
  email: string
  role: string
  created_at: string
}

export async function inviteMaster(input?: {
  email?: string
  seat?: FoundingSeat
  admitMember?: boolean
  role?: 'master'
}): Promise<{
  error?: string
  message?: string
  dryRun?: boolean
  dryRunInvite?: DryRunInvite
}> {
  const payload: Record<string, unknown> = {}
  if (input?.email) payload.email = input.email.trim()
  if (input?.seat) payload.seat = input.seat
  if (input && input.admitMember === false) payload.admit_member = false
  if (input?.role === 'master') payload.role = 'master'
  try {
    const res = await fetch(`${functionsBase}/invite-master`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
      dry_run?: boolean
      dry_run_invite?: {
        confirm_url?: string | null
        login_url?: string
        otp?: string | null
        temp_password?: string | null
      }
    }
    const invite = body.dry_run_invite
    const dryRunInvite = invite
      ? {
          confirmUrl: invite.confirm_url ?? null,
          loginUrl: invite.login_url || '',
          otp: invite.otp ?? null,
          tempPassword: invite.temp_password ?? null,
        }
      : undefined
    if (!res.ok) {
      return { error: body.error || body.message || `Invite failed (${res.status})`, dryRunInvite }
    }
    return {
      message: body.message,
      dryRun: Boolean(body.dry_run),
      dryRunInvite,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invite failed' }
  }
}

export async function setMemberStatus(
  userId: string,
  action: 'suspend' | 'restore',
): Promise<{ error?: string; message?: string; status?: string }> {
  try {
    const res = await fetch(`${functionsBase}/set-member-status`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({ user_id: userId, action }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
      status?: string
    }
    if (!res.ok) return { error: body.error || `Update failed (${res.status})` }
    return { message: body.message, status: body.status }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Update failed' }
  }
}

export async function staffSetAvatarStyle(
  userId: string,
  style: AvatarStyle,
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('staff_set_avatar_style', {
    p_user_id: userId,
    p_style: style,
  })
  if (error) return { error: error.message }
  return {}
}

export async function staffSetMemberCapacity(
  userId: string,
  capacity: CapacityPayload,
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('staff_set_member_capacity', {
    p_user_id: userId,
    p_investable_capacity_usd: capacity.investable_capacity_usd,
    p_fo_aum_usd: capacity.fo_aum_usd,
    p_turnover_usd: capacity.turnover_usd,
    p_include_in_public_aggregates: capacity.include_in_public_aggregates,
    p_capacity_verified: capacity.capacity_verified,
  })
  if (error) return { error: error.message }
  return {}
}

export async function fetchPlatformStats(): Promise<PlatformStats | null> {
  const { data, error } = await supabase
    .from('platform_stats')
    .select(
      'investment_capability_usd, fo_aum_usd, turnover_usd, founding_admitted_count, founding_ksa_count, founding_intl_count, contributors_investment_n, contributors_fo_n, contributors_turnover_n, updated_at',
    )
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) return null
  return parsePlatformStats(data)
}

export type MajlisStatus = 'pending_approval' | 'published' | 'rejected' | 'cancelled' | 'hidden'
export type MajlisRsvpStatus = 'registered' | 'waitlist' | 'cancelled'

export type MajlisEventRow = {
  id: string
  host_member_id: string
  title: string
  description: string
  region: string
  focus_tags: string[]
  starts_at: string
  ends_at: string
  timezone: string
  capacity: number
  venue_name: string
  venue_address: string | null
  venue_visibility: string
  status: MajlisStatus
  rejection_feedback: string | null
  admin_note: string | null
  approved_at: string | null
  created_at: string
  map_lat: number | null
  map_lng: number | null
  rsvp_opens_at: string | null
  founding_priority_ends_at: string | null
  featured: boolean
  sponsor_label: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  registered_count: number
  waitlist_count: number
  my_rsvp_status: MajlisRsvpStatus | null
  my_waitlist_position: number | null
  host_avatar_style?: StoredAvatarStyle | null
  host_avatar_path?: string | null
}

export type MajlisSponsorEvent = {
  id: string
  title: string
  description: string
  region: string
  focus_tags: string[]
  starts_at: string
  ends_at: string
  timezone: string
  capacity: number
  venue_name: string
  status: 'published'
  map_lat: number | null
  map_lng: number | null
  rsvp_opens_at: string | null
  founding_priority_ends_at: string | null
  featured: boolean
  sponsor_label: string | null
  registered_count: number
  waitlist_count: number
}

export type MajlisRosterRow = {
  id: string
  event_id: string
  member_id: string
  status: MajlisRsvpStatus
  waitlist_position: number | null
  registered_at: string
  cancelled_at: string | null
  email?: string | null
  full_name: string | null
  avatar_style?: StoredAvatarStyle | null
  avatar_path?: string | null
}

const MAJLIS_BASE =
  'id, host_member_id, title, description, region, focus_tags, starts_at, ends_at, timezone, capacity, venue_name, venue_address, venue_visibility, status, rejection_feedback, admin_note, approved_at, created_at'
const MAJLIS_EXTRA =
  'map_lat, map_lng, rsvp_opens_at, founding_priority_ends_at, featured, sponsor_label, cancelled_at, cancel_reason, registered_count, waitlist_count, my_rsvp_status, my_waitlist_position'
const MAJLIS_COLUMNS = `${MAJLIS_BASE}, ${MAJLIS_EXTRA}`
const SPONSOR_COLUMNS =
  'id, title, description, region, focus_tags, starts_at, ends_at, timezone, capacity, venue_name, status, map_lat, map_lng, rsvp_opens_at, founding_priority_ends_at, featured, sponsor_label, registered_count, waitlist_count'

function shapeMissing(message: string): boolean {
  return /does not exist|schema cache|Could not find the/i.test(message)
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeEvent(row: MajlisEventRow): MajlisEventRow {
  return {
    ...row,
    focus_tags: row.focus_tags ?? [],
    map_lat: num(row.map_lat),
    map_lng: num(row.map_lng),
    rsvp_opens_at: row.rsvp_opens_at ?? null,
    founding_priority_ends_at: row.founding_priority_ends_at ?? null,
    featured: Boolean(row.featured),
    sponsor_label: row.sponsor_label ?? null,
    cancelled_at: row.cancelled_at ?? null,
    cancel_reason: row.cancel_reason ?? null,
    registered_count: num(row.registered_count) ?? 0,
    waitlist_count: num(row.waitlist_count) ?? 0,
    my_rsvp_status: row.my_rsvp_status ?? null,
    my_waitlist_position: num(row.my_waitlist_position),
  }
}

const MAJLIS_HOST = 'host_avatar_style, host_avatar_path'

export async function fetchMajlisEvents(): Promise<
  { error: string } | { events: MajlisEventRow[] }
> {
  const withHost = await supabase
    .from('majlis_events_member')
    .select(`${MAJLIS_COLUMNS}, ${MAJLIS_HOST}`)
    .order('starts_at', { ascending: true })
  if (!withHost.error) {
    return { events: ((withHost.data ?? []) as MajlisEventRow[]).map(normalizeEvent) }
  }
  if (!shapeMissing(withHost.error.message)) return { error: withHost.error.message }
  const extended = await supabase
    .from('majlis_events_member')
    .select(MAJLIS_COLUMNS)
    .order('starts_at', { ascending: true })
  if (!extended.error) {
    return { events: ((extended.data ?? []) as MajlisEventRow[]).map(normalizeEvent) }
  }
  if (!shapeMissing(extended.error.message)) return { error: extended.error.message }
  const basic = await supabase
    .from('majlis_events_member')
    .select(MAJLIS_BASE)
    .order('starts_at', { ascending: true })
  if (basic.error) return { error: basic.error.message }
  return { events: ((basic.data ?? []) as MajlisEventRow[]).map((row) => normalizeEvent(row)) }
}

export async function fetchSponsorMajlis(): Promise<
  { error: string } | { events: MajlisSponsorEvent[]; unavailable?: boolean }
> {
  const { data, error } = await supabase
    .from('majlis_events_sponsor')
    .select(SPONSOR_COLUMNS)
    .order('starts_at', { ascending: true })
  if (error) {
    if (shapeMissing(error.message)) return { events: [], unavailable: true }
    return { error: error.message }
  }
  return {
    events: ((data ?? []) as MajlisSponsorEvent[]).map((row) => ({
      ...row,
      focus_tags: row.focus_tags ?? [],
      map_lat: num(row.map_lat),
      map_lng: num(row.map_lng),
      featured: Boolean(row.featured),
      registered_count: num(row.registered_count) ?? 0,
      waitlist_count: num(row.waitlist_count) ?? 0,
    })),
  }
}

export async function fetchMajlisRoster(
  eventId: string,
  options?: { includeEmail?: boolean },
): Promise<{ error: string } | { rows: MajlisRosterRow[] }> {
  if (options?.includeEmail === true) return fetchMajlisRosterColumns(eventId, true)
  return fetchMajlisRosterColumns(eventId, false)
}

async function fetchMajlisRosterColumns(
  eventId: string,
  includeEmail: boolean,
): Promise<{ error: string } | { rows: MajlisRosterRow[] }> {
  const withStyle = includeEmail
    ? await supabase
        .from('majlis_roster')
        .select(
          'id, event_id, member_id, status, waitlist_position, registered_at, cancelled_at, email, full_name, avatar_style, avatar_path',
        )
        .eq('event_id', eventId)
        .order('registered_at', { ascending: true })
    : await supabase
        .from('majlis_roster')
        .select(
          'id, event_id, member_id, status, waitlist_position, registered_at, cancelled_at, full_name, avatar_style, avatar_path',
        )
        .eq('event_id', eventId)
        .order('registered_at', { ascending: true })
  if (!withStyle.error) return { rows: (withStyle.data ?? []) as unknown as MajlisRosterRow[] }
  if (!shapeMissing(withStyle.error.message)) return { error: withStyle.error.message }
  const plain = includeEmail
    ? await supabase
        .from('majlis_roster')
        .select('id, event_id, member_id, status, waitlist_position, registered_at, cancelled_at, email, full_name')
        .eq('event_id', eventId)
        .order('registered_at', { ascending: true })
    : await supabase
        .from('majlis_roster')
        .select('id, event_id, member_id, status, waitlist_position, registered_at, cancelled_at, full_name')
        .eq('event_id', eventId)
        .order('registered_at', { ascending: true })
  if (plain.error) return { error: plain.error.message }
  return { rows: (plain.data ?? []) as unknown as MajlisRosterRow[] }
}

export async function applyForMajlis(input: {
  title: string
  description: string
  region: string
  focusTags: string[]
  startsAtUtc: string
  endsAtUtc: string
  capacity: number
  venueName: string
  venueAddress: string
}): Promise<{ error?: string; id?: string; status?: string }> {
  try {
    const res = await fetch(`${functionsBase}/majlis-apply`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        region: input.region,
        focus_tags: input.focusTags,
        starts_at: input.startsAtUtc,
        ends_at: input.endsAtUtc,
        capacity: input.capacity,
        venue_name: input.venueName,
        venue_address: input.venueAddress,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      id?: string
      status?: string
    }
    if (!res.ok) return { error: body.error || `Submit failed (${res.status})` }
    return { id: body.id, status: body.status }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Submit failed' }
  }
}

export async function rsvpMajlis(
  eventId: string,
  action: 'register' | 'cancel',
): Promise<{ error?: string; status?: MajlisRsvpStatus; waitlist_position?: number | null }> {
  try {
    const res = await fetch(`${functionsBase}/majlis-rsvp`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({ event_id: eventId, action }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      status?: MajlisRsvpStatus
      waitlist_position?: number | null
    }
    if (!res.ok) return { error: body.error || `Registration failed (${res.status})` }
    return { status: body.status, waitlist_position: body.waitlist_position }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Registration failed' }
  }
}

export async function downloadMajlisIcs(eventId: string): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${functionsBase}/majlis-ics`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({ event_id: eventId }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { error: body.error || `Calendar download failed (${res.status})` }
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'majlis.ics'
    link.click()
    URL.revokeObjectURL(url)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Calendar download failed' }
  }
}

export async function majlisAdminAction(
  body: Record<string, unknown>,
): Promise<{ error?: string; message?: string }> {
  try {
    const res = await fetch(`${functionsBase}/majlis-admin-action`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify(body),
    })
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) return { error: payload.error || `Update failed (${res.status})` }
    return { message: 'Saved.' }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Update failed' }
  }
}

export async function decideMajlis(
  eventId: string,
  decision: 'accept' | 'reject',
  note: string,
): Promise<{ error?: string; message?: string; status?: string }> {
  try {
    const res = await fetch(`${functionsBase}/majlis-approve`, {
      method: 'POST',
      headers: await staffHeaders(),
      body: JSON.stringify({ event_id: eventId, decision, note }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
      status?: string
    }
    if (!res.ok) return { error: body.error || `Decision failed (${res.status})` }
    return { message: body.message, status: body.status }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Decision failed' }
  }
}

export async function requestReBoardRoleIntro(roleId: string): Promise<'ok' | 'error'> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return 'error'
    const res = await fetch(`${functionsBase}/request-re-intro`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role_id: roleId }),
    })
    if (!res.ok) return 'error'
    return 'ok'
  } catch {
    return 'error'
  }
}

export async function requestRePartnerIntro(partnerId: string): Promise<'ok' | 'error'> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return 'error'
    const res = await fetch(`${functionsBase}/request-re-intro`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ partner_id: partnerId }),
    })
    if (!res.ok) return 'error'
    return 'ok'
  } catch {
    return 'error'
  }
}

export async function expressReClubInterest(opportunityId: string): Promise<'ok' | 'error'> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return 'error'
    const res = await fetch(`${functionsBase}/request-re-intro`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interest_opportunity_id: opportunityId }),
    })
    if (!res.ok) return 'error'
    return 'ok'
  } catch {
    return 'error'
  }
}

export async function requestReOpportunityIntro(opportunityId: string): Promise<'ok' | 'error'> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return 'error'
    const res = await fetch(`${functionsBase}/request-re-intro`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ opportunity_id: opportunityId }),
    })
    if (!res.ok) return 'error'
    return 'ok'
  } catch {
    return 'error'
  }
}

export async function requestMandateIntro(mandateId: string): Promise<'ok' | 'error'> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return 'error'
    const res = await fetch(`${functionsBase}/request-mandate-intro`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mandate_id: mandateId }),
    })
    if (!res.ok) return 'error'
    return 'ok'
  } catch {
    return 'error'
  }
}

function plainStaffError(message: string): string {
  if (message.includes('category_taken')) return 'That category is already held.'
  if (message.includes('not_allowed')) return 'Staff only.'
  if (message.includes('invalid_category')) return 'Choose a category from the list.'
  if (message.includes('invalid_sponsor')) return 'Choose an invited or active sponsor.'
  return message
}

export async function fetchSponsorDesk(): Promise<{ error: string } | { desk: SponsorDesk }> {
  const { data, error } = await supabase.rpc('sponsor_desk')
  if (error) return { error: error.message }
  const desk = presentSponsorDesk(data)
  if (!desk) return { error: 'Could not read the sponsorship.' }
  return { desk }
}

export async function fetchSponsorCatalog(): Promise<{ error: string } | { catalog: SponsorCatalog }> {
  const { data, error } = await supabase.rpc('staff_list_sponsor_catalog')
  if (error) return { error: plainStaffError(error.message) }
  const catalog = presentSponsorCatalog(data)
  if (!catalog) return { error: 'Could not read sponsor packages.' }
  return { catalog }
}

export async function saveSponsorPackage(value: PackageSave): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('staff_save_sponsor_package', {
    p_slug: value.slug,
    p_name: value.name,
    p_price_label: value.price_label,
    p_majlis_slots: value.majlis_slots,
    p_intro_credits: value.intro_credits,
    p_room_credits: value.room_credits,
    p_active: value.active,
    p_is_placeholder: value.is_placeholder,
  })
  if (error) return { error: plainStaffError(error.message) }
  return {}
}

export async function assignSponsorPackage(memberId: string, packageSlug: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('staff_assign_sponsor_package', {
    p_member_id: memberId,
    p_package_slug: packageSlug,
  })
  if (error) return { error: plainStaffError(error.message) }
  return {}
}

export async function assignSponsorCategory(memberId: string, categorySlug: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('staff_assign_sponsor_category', {
    p_member_id: memberId,
    p_category_slug: categorySlug,
  })
  if (error) return { error: plainStaffError(error.message) }
  return {}
}

export async function setMajlisPresentedBy(input: {
  eventId: string
  memberId: string | null
  label: string
}): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('staff_set_majlis_presented_by', {
    p_event_id: input.eventId,
    p_member_id: input.memberId,
    p_label: input.label,
  })
  if (error) return { error: plainStaffError(error.message) }
  return {}
}

export async function fetchFoundingCapacity(): Promise<
  { error: string } | FoundingCapacity
> {
  const { data, error } = await supabase.rpc('founding_capacity')
  if (error) return { error: error.message }
  const parsed = parseCapacity(data)
  if (!parsed) return { error: 'Capacity is unavailable.' }
  return parsed
}

import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { parseCapacity, type FoundingCapacity, type FoundingSeat } from './member'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.',
  )
}

export const supabase = createClient<Database>(url, anonKey)

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
  linkedin_url: string
  job_titles: string
  companies: string
}): Promise<{ error?: string; dryRun?: boolean; id?: string }> {
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
    }
    if (!res.ok) return { error: body.error || `Submit failed (${res.status})` }
    return { dryRun: Boolean(body.dry_run), id: body.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Submit failed' }
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

export async function fetchFoundingCapacity(): Promise<
  { error: string } | FoundingCapacity
> {
  const { data, error } = await supabase.rpc('founding_capacity')
  if (error) return { error: error.message }
  const parsed = parseCapacity(data)
  if (!parsed) return { error: 'Capacity is unavailable.' }
  return parsed
}

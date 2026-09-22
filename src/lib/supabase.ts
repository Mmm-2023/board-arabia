import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.',
  )
}

export const supabase = createClient<Database>(url, anonKey)

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected'

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
}

const functionsBase = `${url.replace(/\/$/, '')}/functions/v1`

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? anonKey
  return {
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
  }
}

export async function notifyApplicationSubmitted(applicationId: string): Promise<{
  error?: string
  dryRun?: boolean
}> {
  try {
    const res = await fetch(`${functionsBase}/notify-application`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ application_id: applicationId }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      dry_run?: boolean
    }
    if (!res.ok) return { error: body.error || `Notify failed (${res.status})` }
    return { dryRun: Boolean(body.dry_run) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Notify failed' }
  }
}

export async function decideApplication(
  applicationId: string,
  decision: 'accepted' | 'rejected',
): Promise<{
  error?: string
  message?: string
  inviteEventId?: string | null
  dryRun?: boolean
}> {
  try {
    const res = await fetch(`${functionsBase}/decide-application`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ application_id: applicationId, decision }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: string
      dry_run?: boolean
      invite_mode?: string
    }
    if (!res.ok) return { error: body.error || `Decision failed (${res.status})` }
    return {
      message: body.message,
      dryRun: Boolean(body.dry_run),
      inviteEventId: body.invite_mode === 'private_booking_link' ? 'private_link' : null,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Decision failed' }
  }
}

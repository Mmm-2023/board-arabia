import type { Json } from './database.types'
import type { PublicMajlisSnapshot } from './publicMajlis'
import { PUBLIC_MAJLIS_CONSENT } from './publicMajlis'
import { supabase } from './supabase'

const KEY = 'ba-public-majlis-draft'

export type PublicMajlisDraft = {
  eventId: string
  snapshot: PublicMajlisSnapshot
  consent: string
}

export function savePublicMajlisDraft(draft: PublicMajlisDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, consent: draft.consent || PUBLIC_MAJLIS_CONSENT }))
  } catch {
    // The request can be sent again from the majlis page.
  }
}

export function readPublicMajlisDraft(): PublicMajlisDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PublicMajlisDraft>
    if (!parsed || typeof parsed.eventId !== 'string' || !parsed.snapshot) return null
    const snap = parsed.snapshot
    if (!snap.full_name || !snap.phone || !snap.company || !snap.role) return null
    return {
      eventId: parsed.eventId,
      snapshot: {
        full_name: snap.full_name,
        phone: snap.phone,
        company: snap.company,
        role: snap.role,
        linkedin: snap.linkedin || '',
        why: snap.why || '',
      },
      consent: typeof parsed.consent === 'string' && parsed.consent ? parsed.consent : PUBLIC_MAJLIS_CONSENT,
    }
  } catch {
    return null
  }
}

export function clearPublicMajlisDraft() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Leave the stored request in place.
  }
}

export async function flushPublicMajlisDraft(): Promise<'none' | 'sent' | 'error'> {
  const draft = readPublicMajlisDraft()
  if (!draft) return 'none'
  const { data, error } = await supabase.rpc('submit_own_majlis_application', {
    p_event: draft.eventId,
    p_snapshot: { ...draft.snapshot, company_fax: '' } as Json,
    p_consent: draft.consent,
  })
  if (error) return 'error'
  const code =
    data && typeof data === 'object' && 'error_code' in data ? String((data as { error_code?: unknown }).error_code || '') : ''
  if (code === 'rate_limited') return 'error'
  clearPublicMajlisDraft()
  return 'sent'
}

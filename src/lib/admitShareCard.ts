import { safeAdmitShareHref } from './admitShareHref'
import { supabase } from './supabase'

export type AdmitShareCardState = { show: false } | { show: true; href: string }

function functionsBase(): string {
  return String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
}

async function memberHeaders(): Promise<HeadersInit | null> {
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
  const base = functionsBase()
  if (!base || !anon) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  return {
    Authorization: `Bearer ${token}`,
    apikey: anon,
    'Content-Type': 'application/json',
  }
}

/** Asks the server whether to show the card. A failure hides it. */
export async function loadAdmitShareCard(): Promise<AdmitShareCardState> {
  try {
    const headers = await memberHeaders()
    const base = functionsBase()
    if (!headers || !base) return { show: false }
    const res = await fetch(`${base}/functions/v1/admit-li-share-card`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'status' }),
    })
    if (!res.ok) return { show: false }
    const body = (await res.json().catch(() => null)) as { show?: unknown; href?: unknown } | null
    if (body?.show !== true) return { show: false }
    const href = safeAdmitShareHref(body.href)
    if (!href) return { show: false }
    return { show: true, href }
  } catch {
    return { show: false }
  }
}

export async function dismissAdmitShareCard(): Promise<boolean> {
  try {
    const headers = await memberHeaders()
    const base = functionsBase()
    if (!headers || !base) return false
    const res = await fetch(`${base}/functions/v1/admit-li-share-card`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'dismiss' }),
    })
    return res.ok
  } catch {
    return false
  }
}

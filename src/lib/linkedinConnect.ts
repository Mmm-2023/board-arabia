import { LINKEDIN_CONNECT_ENABLED, officialLinkedInAuthorizeUrl } from './linkedinFlag'
import { supabase } from './supabase'

export type LinkedInProfilePatch = {
  full_name: string | null
  headline: string | null
  company: string | null
  linkedin_url: string | null
  photo_saved: boolean
}

export type LinkedInResult =
  | { status: 'off' }
  | { status: 'authorize'; url: string }
  | { status: 'applied'; profile: LinkedInProfilePatch; refreshed: boolean }
  | { status: 'cancelled' }
  | { status: 'technical' }

const STATE_KEY = 'ba.linkedin.oauth.state'
const LINKED_KEY = 'ba.linkedin.linked'

const exchangeCache = new Map<string, Promise<LinkedInResult>>()

function rememberState(): string {
  const state = crypto.randomUUID()
  sessionStorage.setItem(STATE_KEY, state)
  return state
}

export function linkedInStateMatches(state: string | null): boolean {
  if (!state || typeof sessionStorage === 'undefined') return false
  const saved = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(STATE_KEY)
  return Boolean(saved) && saved === state
}

export function linkedInLinked() {
  if (typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem(LINKED_KEY) === '1'
}

export function markLinkedInLinked() {
  sessionStorage.setItem(LINKED_KEY, '1')
}

function functionsBase() {
  return `${String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1`
}

async function authHeaders(): Promise<HeadersInit | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!token || !anonKey) return null
  return {
    Authorization: `Bearer ${token}`,
    apikey: String(anonKey),
    'Content-Type': 'application/json',
  }
}

function readPatch(value: unknown): LinkedInProfilePatch | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const text = (key: string) => {
    const item = row[key]
    return typeof item === 'string' ? item.trim() : ''
  }
  return {
    full_name: text('full_name') || null,
    headline: text('headline') || null,
    company: text('company') || null,
    linkedin_url: text('linkedin_url') || null,
    photo_saved: row.photo_saved === true,
  }
}

async function postLinkedIn(body: Record<string, string>): Promise<LinkedInResult> {
  if (!LINKEDIN_CONNECT_ENABLED) return { status: 'off' }
  const headers = await authHeaders()
  if (!headers) return { status: 'technical' }
  try {
    const response = await fetch(`${functionsBase()}/linkedin-oauth`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!response.ok || !payload) return { status: 'technical' }
    const authorize = officialLinkedInAuthorizeUrl(payload.authorize_url)
    if (authorize) return { status: 'authorize', url: authorize }
    const profile = readPatch(payload.profile)
    if (payload.ok === true && profile) {
      const refreshed = linkedInLinked()
      markLinkedInLinked()
      return { status: 'applied', profile, refreshed }
    }
    return { status: 'technical' }
  } catch {
    return { status: 'technical' }
  }
}

export async function startLinkedInConnect(): Promise<LinkedInResult> {
  if (!LINKEDIN_CONNECT_ENABLED) return { status: 'off' }
  const state = rememberState()
  const redirectUri = `${window.location.origin}/dashboard/profile`
  return postLinkedIn({ action: 'start', state, redirect_uri: redirectUri })
}

export function finishLinkedInConnect(code: string, state: string): Promise<LinkedInResult> {
  if (!LINKEDIN_CONNECT_ENABLED) return Promise.resolve({ status: 'off' })
  const key = `${state}:${code}`
  const cached = exchangeCache.get(key)
  if (cached) return cached
  const pending = postLinkedIn({ action: 'exchange', code, state, redirect_uri: `${window.location.origin}/dashboard/profile` })
  exchangeCache.set(key, pending)
  return pending
}

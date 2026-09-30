import { BANNER_VERSION, NOTICE_VERSION } from '../../../supabase/functions/_shared/consent_versions.ts'

export const CONSENT_COOKIE = 'ba_consent'
export const ANALYTICS_ID_COOKIE = 'ba_analytics_id'
export const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ConsentChoice = 'accept' | 'reject'

export type StoredConsent = {
  choice: ConsentChoice
  consentId: string
  bannerVersion: string
  noticeVersion: string
  expiresAt: number
  analyticsId: string | null
}

export function shouldAsk(cookieHeader: string, now: number, bannerVersion = BANNER_VERSION): boolean {
  const stored = readConsent(cookieHeader, now)
  if (!stored) return true
  if (stored.bannerVersion !== bannerVersion) return true
  return false
}

export function readConsent(cookieHeader: string, now: number): StoredConsent | null {
  const raw = readCookie(cookieHeader, CONSENT_COOKIE)
  if (!raw) return null
  const parts = raw.split('|')
  if (parts.length !== 7 || parts[0] !== 'v1') return null
  const choice = parts[1]
  if (choice !== 'accept' && choice !== 'reject') return null
  const consentId = parts[2]?.toLowerCase() ?? ''
  if (!UUID_RE.test(consentId)) return null
  const bannerVersion = parts[3] ?? ''
  const noticeVersion = parts[4] ?? ''
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(bannerVersion)) return null
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(noticeVersion)) return null
  const expiresAt = Number(parts[5])
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null
  const analyticsRaw = parts[6] ?? ''
  const analyticsId = analyticsRaw && UUID_RE.test(analyticsRaw) ? analyticsRaw.toLowerCase() : null
  if (choice === 'reject') {
    return { choice, consentId, bannerVersion, noticeVersion, expiresAt, analyticsId: null }
  }
  return { choice, consentId, bannerVersion, noticeVersion, expiresAt, analyticsId }
}

export function consentRecord(choice: ConsentChoice, consentId: string, analyticsId: string | null, now: number): StoredConsent {
  return {
    choice,
    consentId,
    bannerVersion: BANNER_VERSION,
    noticeVersion: NOTICE_VERSION,
    expiresAt: now + CONSENT_TTL_MS,
    analyticsId: choice === 'accept' ? analyticsId : null,
  }
}

export function consentCookiePair(stored: StoredConsent, secure: boolean): string {
  const analytics = stored.choice === 'accept' && stored.analyticsId ? stored.analyticsId : ''
  const value = [
    'v1',
    stored.choice,
    stored.consentId,
    stored.bannerVersion,
    stored.noticeVersion,
    String(stored.expiresAt),
    analytics,
  ].join('|')
  const maxAge = Math.max(0, Math.floor((stored.expiresAt - Date.now()) / 1000))
  return cookieAssignment(CONSENT_COOKIE, value, maxAge, secure)
}

export function analyticsIdCookiePair(analyticsId: string | null, secure: boolean): string {
  if (!analyticsId) return cookieAssignment(ANALYTICS_ID_COOKIE, '', 0, secure)
  return cookieAssignment(ANALYTICS_ID_COOKIE, analyticsId, Math.floor(CONSENT_TTL_MS / 1000), secure)
}

export function readCookie(header: string, name: string): string | null {
  const parts = header.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    if (trimmed.slice(0, eq) !== name) continue
    return decodeURIComponent(trimmed.slice(eq + 1))
  }
  return null
}

function cookieAssignment(name: string, value: string, maxAge: number, secure: boolean): string {
  const secureFlag = secure ? '; Secure' : ''
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`
}

const POSTHOG_KEY = /^(ph_|ba_first_touch$|ba_last_touch$|ba_analytics_id$)/

export function isPosthogStorageKey(key: string): boolean {
  return POSTHOG_KEY.test(key)
}

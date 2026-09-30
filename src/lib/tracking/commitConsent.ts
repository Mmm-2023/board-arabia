import { BANNER_VERSION, NOTICE_VERSION } from '../../../supabase/functions/_shared/consent_versions.ts'
import { ANALYTICS_CONFIG } from './flags.ts'
import {
  analyticsIdCookiePair,
  consentCookiePair,
  consentRecord,
  isPosthogStorageKey,
  type ConsentChoice,
} from './consent.ts'
import { clearAttributionStorage, persistAcceptedTouch, rememberAnalyticsId, resetTouchMemory } from './touch.ts'

export async function commitConsent(choice: ConsentChoice, language: 'en' | 'ar') {
  if (typeof document === 'undefined') return
  const now = Date.now()
  const consentId = crypto.randomUUID()
  const analyticsId = choice === 'accept' ? crypto.randomUUID() : null
  const stored = consentRecord(choice, consentId, analyticsId, now)
  const secure = window.location.protocol === 'https:'
  document.cookie = consentCookiePair(stored, secure)
  document.cookie = analyticsIdCookiePair(analyticsId, secure)
  rememberAnalyticsId(analyticsId)
  if (choice === 'accept') {
    persistAcceptedTouch(window.localStorage, now)
  } else {
    clearAnalyticsStorage()
    resetTouchMemory()
    rememberAnalyticsId(null)
    const ph = (window as { posthog?: { reset?: () => void; opt_out_capturing?: () => void } }).posthog
    ph?.opt_out_capturing?.()
    ph?.reset?.()
  }
  if (!ANALYTICS_CONFIG.enabled) return
  await postConsentLog({
    consent_id: consentId,
    choice,
    banner_version: BANNER_VERSION,
    notice_version: NOTICE_VERSION,
    language,
  })
}

export function clearAnalyticsStorage() {
  const drop: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key && isPosthogStorageKey(key)) drop.push(key)
  }
  for (const key of drop) localStorage.removeItem(key)
  clearAttributionStorage(window.localStorage)
  const names = document.cookie.split(';').map((part) => part.split('=')[0]?.trim() ?? '')
  for (const name of names) {
    if (!name || name === 'ba_consent' || name === 'ba_no_track' || name === 'ba_track_pref') continue
    if (name.startsWith('ph_') || name === 'ba_analytics_id') {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
    }
  }
}

async function postConsentLog(body: {
  consent_id: string
  choice: ConsentChoice
  banner_version: string
  notice_version: string
  language: 'en' | 'ar'
}) {
  const base = String(import.meta.env?.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const anon = String(import.meta.env?.VITE_SUPABASE_ANON_KEY || '')
  if (!base || !anon) return
  await fetch(`${base}/functions/v1/consent-log`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anon}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined)
}

import { sanitizeTouch, type TouchRecord } from '../../../supabase/functions/_shared/attribution.ts'
import { readConsent } from './consent.ts'

export const FIRST_TOUCH_KEY = 'ba_first_touch'
export const LAST_TOUCH_KEY = 'ba_last_touch'

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

let memoryFirst: TouchRecord | null = null
let memoryLast: TouchRecord | null = null
let memoryAnalyticsId: string | null = null

export function resetTouchMemory() {
  memoryFirst = null
  memoryLast = null
  memoryAnalyticsId = null
}

export function rememberAnalyticsId(id: string | null) {
  memoryAnalyticsId = id
}

export function touchFromHref(href: string, referrer: string, now = Date.now()): TouchRecord {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return sanitizeTouch({}, now)
  }
  const raw: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(key)
    if (value) raw[key] = value
  }
  raw.landing_path = url.pathname || '/'
  const host = referrerHost(referrer)
  if (host && host !== url.hostname.toLowerCase()) raw.referrer_host = host
  raw.at = new Date(now).toISOString()
  return sanitizeTouch(raw, now)
}

export function referrerHost(referrer: string): string | null {
  if (!referrer) return null
  try {
    return new URL(referrer).hostname.toLowerCase()
  } catch {
    return null
  }
}

type KeyValueStore = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/**
 * Holds first touch in memory until Accept. localStorage is used only after Accept.
 * First touch is never overwritten. Last touch is replaced.
 */
export function observeVisit(href: string, referrer: string, cookieHeader: string, storage: KeyValueStore | null, now = Date.now()) {
  const touch = touchFromHref(href, referrer, now)
  if (!memoryFirst) memoryFirst = touch
  memoryLast = touch
  const consent = readConsent(cookieHeader, now)
  if (consent?.choice !== 'accept' || !storage) return
  const storedFirst = parseStored(storage.getItem(FIRST_TOUCH_KEY), now)
  if (storedFirst) memoryFirst = storedFirst
  else storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(memoryFirst))
  storage.setItem(LAST_TOUCH_KEY, JSON.stringify(memoryLast))
}

export function attributionBody(href: string, referrer: string, cookieHeader: string, storage: KeyValueStore | null, now = Date.now()) {
  const current = touchFromHref(href, referrer, now)
  const consent = readConsent(cookieHeader, now)
  let first = memoryFirst
  let last = memoryLast
  if (consent?.choice === 'accept' && storage) {
    const storedFirst = parseStored(storage.getItem(FIRST_TOUCH_KEY), now)
    const storedLast = parseStored(storage.getItem(LAST_TOUCH_KEY), now)
    if (storedFirst) first = storedFirst
    if (storedLast) last = storedLast
  }
  if (!first) first = current
  if (!last) last = current
  const analyticsId = consent?.choice === 'accept' ? consent.analyticsId || memoryAnalyticsId : null
  return {
    first_touch: first,
    last_touch: {
      source: last.source,
      medium: last.medium,
      campaign: last.campaign,
    },
    analytics_id: analyticsId,
    attribution_version: 1,
  }
}

export function memoryTouch(): { first: TouchRecord | null; last: TouchRecord | null } {
  return { first: memoryFirst, last: memoryLast }
}

/** Call only after Accept. First touch already in storage is kept. */
export function persistAcceptedTouch(storage: KeyValueStore, now = Date.now()) {
  if (!memoryFirst) return
  const storedFirst = parseStored(storage.getItem(FIRST_TOUCH_KEY), now)
  if (storedFirst) memoryFirst = storedFirst
  else storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(memoryFirst))
  if (memoryLast) storage.setItem(LAST_TOUCH_KEY, JSON.stringify(memoryLast))
}

export function readSubmitAttribution() {
  if (typeof window === 'undefined') return {}
  return attributionBody(window.location.href, document.referrer, document.cookie, window.localStorage)
}

function parseStored(raw: string | null, now: number): TouchRecord | null {
  if (!raw) return null
  try {
    const touch = sanitizeTouch(JSON.parse(raw), now)
    if (!touch.at && !touch.source && !touch.medium && !touch.campaign && !touch.referrer_host && !touch.landing_path) {
      return null
    }
    return touch
  } catch {
    return null
  }
}

export function clearAttributionStorage(storage: KeyValueStore) {
  storage.removeItem(FIRST_TOUCH_KEY)
  storage.removeItem(LAST_TOUCH_KEY)
}

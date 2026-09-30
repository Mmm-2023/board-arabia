/**
 * Public analytics call site.
 * Live capture stays off unless VITE_ANALYTICS_ENABLED is the exact string true.
 * PR #85 should import track from this module and drop its no-op src/lib/analytics.ts.
 * Consent is the ba_consent cookie from the banner, not a localStorage flag.
 */
import { sanitizeProperties, BANNED_PROPERTIES } from './tracking/allowlist.ts'
import { readConsent } from './tracking/consent.ts'
import { PRECONSENT_EVENTS } from './tracking/decide.ts'
import { ANALYTICS_CONFIG } from './tracking/flags.ts'

const EVENTS = new Set<string>([
  ...PRECONSENT_EVENTS,
  'register_start',
  'register_basic',
  'register_error',
  'email_verified',
  'checklist_step_done',
  'checklist_complete',
  'request_full_membership',
  'approved',
  'login',
  'application_submitted',
])

const BANNED = new Set<string>(BANNED_PROPERTIES)

export type AnalyticsProps = Record<string, string | number | boolean>

type Sink = (event: string, props: AnalyticsProps) => void

let sink: Sink | null = null
let enabledOverride: boolean | null = null
let consentOverride: boolean | null = null

export function setAnalyticsSinkForTests(next: Sink | null) {
  sink = next
}

export function setAnalyticsEnabledForTests(value: boolean | null) {
  enabledOverride = value
}

export function setAnalyticsConsentForTests(value: boolean | null) {
  consentOverride = value
}

function analyticsOn() {
  if (enabledOverride != null) return enabledOverride
  return ANALYTICS_CONFIG.enabled
}

function accepted() {
  if (typeof document === 'undefined') return false
  return readConsent(document.cookie, Date.now())?.choice === 'accept'
}

function captureBlocked() {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('ba_qa') === '1') return true
    if (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')) return true
    if (typeof document !== 'undefined' && /(?:^|;\s*)ba_no_track=1(?:;|$)/.test(document.cookie)) return true
  } catch {
    return true
  }
  return false
}

/** Events that are not on the pre-consent list wait for Accept. A banned property drops the whole event. */
export function track(event: string, props?: Record<string, unknown>) {
  if (!analyticsOn()) return
  if (captureBlocked()) return
  if (!EVENTS.has(event)) return
  const preconsent = PRECONSENT_EVENTS.includes(event as (typeof PRECONSENT_EVENTS)[number])
  if (consentOverride === false) return
  if (consentOverride !== true && !preconsent && !accepted()) return
  const raw = props ?? {}
  for (const key of Object.keys(raw)) {
    if (BANNED.has(key.toLowerCase())) return
  }
  const clean = sanitizeProperties(raw)
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue
    if (!(key in clean)) return
  }
  if (sink) {
    sink(event, clean)
    return
  }
  if (typeof window === 'undefined') return
  void import('./tracking/browser.ts').then((mod) => mod.capture(event, clean))
}

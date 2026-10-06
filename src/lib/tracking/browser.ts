import { supabase } from '../supabase.ts'
import { sanitizeProperties } from './allowlist.ts'
import { ANALYTICS_CONFIG } from './flags.ts'
import { runCapture, type CaptureDeps } from './capture.ts'
import { isBlockedPath, posthogScriptUrl, type CaptureContext } from './decide.ts'
import { readConsent, readCookie } from './consent.ts'
import { NO_TRACK_COOKIE } from './staffOptOut.ts'
import { memoryTouch, referrerHost } from './touch.ts'

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

let scriptUrlLoaded: string | null = null
let staffKnown: boolean | null = null

export function resetBrowserCaptureForTests() {
  scriptUrlLoaded = null
  staffKnown = null
}

export function noteStaffSession(active: boolean) {
  staffKnown = active
}

export async function capture(event: string, properties: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  if (!ANALYTICS_CONFIG.enabled) return
  const ctx = readContext()
  if (staffKnown == null) {
    ctx.staffSession = await detectStaffSession()
  }
  const merged = sanitizeProperties({ ...commonProperties(ctx), ...properties })
  await runCapture(event, merged, ANALYTICS_CONFIG, ctx, browserDeps()).catch(() => undefined)
}

export function trackApplyClick(location: string, label: string) {
  void capture('cta_apply_click', { cta_location: location, cta_label: label })
}

export function trackLoginClick(location: string) {
  void capture('login_click', { location })
}

function readContext(): CaptureContext {
  return {
    hostname: window.location.hostname,
    path: window.location.pathname,
    search: window.location.search,
    webdriver: navigator.webdriver === true,
    userAgent: navigator.userAgent,
    noTrack: readCookie(document.cookie, NO_TRACK_COOKIE) === '1',
    staffSession: staffKnown === true,
    doNotTrack: doNotTrackEnabled(),
    consent: consentState(),
  }
}

function doNotTrackEnabled(): boolean {
  const nav = navigator as Navigator & { msDoNotTrack?: string }
  const win = window as Window & { doNotTrack?: string }
  const value = nav.doNotTrack || win.doNotTrack || nav.msDoNotTrack
  return value === '1' || value === 'yes'
}

function consentState(): CaptureContext['consent'] {
  const stored = readConsent(document.cookie, Date.now())
  if (!stored) return 'unknown'
  return stored.choice
}

function commonProperties(ctx: CaptureContext): Record<string, unknown> {
  const params = new URLSearchParams(window.location.search)
  const touch = memoryTouch().first
  const props: Record<string, unknown> = {
    path: window.location.pathname,
    page_type: pageType(window.location.pathname),
    device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
    consent_state: ctx.consent === 'accept' ? 'accepted' : 'anonymous',
  }
  const host = referrerHost(document.referrer)
  if (host) props.referrer_host = host
  for (const key of UTM_KEYS) {
    const value = params.get(key)
    if (value) props[key] = value
  }
  if (touch?.source) props.first_touch_source = touch.source
  if (touch?.medium) props.first_touch_medium = touch.medium
  return props
}

function pageType(path: string): string {
  if (path === '/') return 'home'
  if (path === '/apply') return 'apply'
  if (path === '/login' || path === '/login/staff') return 'login'
  if (path === '/for-members' || path === '/for-capital' || path === '/partners' || path === '/how-it-works' || path === '/about' || path === '/privacy' || path === '/security' || path === '/terms') {
    return 'marketing'
  }
  return 'other'
}

async function detectStaffSession(): Promise<boolean> {
  if (staffKnown === true) return true
  let active = false
  try {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (userId) {
      const { data: row } = await supabase.from('staff_users').select('user_id').eq('user_id', userId).maybeSingle()
      active = Boolean(row)
    }
  } catch {
    active = false
  }
  if (active) staffKnown = true
  return active
}

function browserDeps(): CaptureDeps {
  return {
    randomId: () => crypto.randomUUID(),
    nowIso: () => new Date().toISOString(),
    fetch: async (url, body) => {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'omit',
      })
    },
    loadScript: (url) => {
      if (scriptUrlLoaded === url || document.querySelector(`script[data-ba-posthog="${url}"]`)) return
      scriptUrlLoaded = url
      installPosthog(url)
    },
    readAnalyticsId: () => readConsent(document.cookie, Date.now())?.analyticsId ?? null,
    captureIdentified: (event, distinctId, properties) => {
      const ph = (window as PosthogWindow).posthog
      if (!ph) return
      ph.identify(distinctId)
      ph.capture(event, properties)
    },
  }
}

type PosthogWindow = {
  posthog?: {
    init: (key: string, options: Record<string, unknown>) => void
    identify: (id: string) => void
    capture: (event: string, properties: Record<string, unknown>) => void
    reset?: () => void
    opt_out_capturing?: () => void
  }
}

function installPosthog(url: string) {
  const key = ANALYTICS_CONFIG.posthogKey
  if (!key) return
  const expected = posthogScriptUrl(ANALYTICS_CONFIG.posthogHost)
  if (url !== expected) return
  const holder = window as PosthogWindow & { __SV?: number }
  if (!holder.posthog) {
    const queue: unknown[][] = []
    const stub = {
      init: () => undefined,
      identify: (...args: unknown[]) => queue.push(['identify', ...args]),
      capture: (...args: unknown[]) => queue.push(['capture', ...args]),
    }
    holder.posthog = stub as PosthogWindow['posthog']
  }
  const script = document.createElement('script')
  script.async = true
  script.crossOrigin = 'anonymous'
  script.src = url
  script.dataset.baPosthog = url
  script.addEventListener('load', () => {
    holder.posthog?.init(key, {
      api_host: ANALYTICS_CONFIG.posthogHost,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: 'identified_only',
      persistence: 'localStorage+cookie',
      advanced_disable_feature_flags: true,
    })
  })
  document.head.appendChild(script)
}

export function posthogLoaded(): boolean {
  return scriptUrlLoaded != null
}

export { isBlockedPath }

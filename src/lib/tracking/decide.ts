import type { readAnalyticsConfig } from './flags.ts'

export const PRECONSENT_EVENTS = ['page_view', 'page_engaged', 'cta_apply_click', 'login_click'] as const

export type AnalyticsConfig = ReturnType<typeof readAnalyticsConfig>

export type CaptureContext = {
  hostname: string
  path: string
  search: string
  webdriver: boolean
  userAgent: string
  noTrack: boolean
  staffSession: boolean
  doNotTrack?: boolean
  consent: 'unknown' | 'accept' | 'reject'
}

export type CapturePlan =
  | { kind: 'skip'; reason: string }
  | { kind: 'anonymous' }
  | { kind: 'identified' }

const PUBLIC_HOSTS = new Set(['boardarabia.com', 'www.boardarabia.com'])

export function planCapture(config: AnalyticsConfig, ctx: CaptureContext, eventName: string): CapturePlan {
  if (!config.enabled) return { kind: 'skip', reason: 'flag' }
  if (isBlockedPath(ctx.path)) return { kind: 'skip', reason: 'path' }
  if (ctx.noTrack || ctx.staffSession) return { kind: 'skip', reason: 'staff' }
  if (ctx.webdriver || isHeadless(ctx.userAgent)) return { kind: 'skip', reason: 'bot' }
  if (ctx.doNotTrack) return { kind: 'skip', reason: 'dnt' }
  if (hasQaFlag(ctx.search)) return { kind: 'skip', reason: 'qa' }
  if (!PUBLIC_HOSTS.has(ctx.hostname.toLowerCase())) return { kind: 'skip', reason: 'host' }
  if (!config.posthogKey) return { kind: 'skip', reason: 'key' }
  if (ctx.consent === 'reject') return { kind: 'skip', reason: 'reject' }
  if (ctx.consent !== 'accept') {
    if (config.preconsentMode === 'none') return { kind: 'skip', reason: 'preconsent_none' }
    if (!PRECONSENT_EVENTS.includes(eventName as (typeof PRECONSENT_EVENTS)[number])) {
      return { kind: 'skip', reason: 'preconsent_event' }
    }
    return { kind: 'anonymous' }
  }
  return { kind: 'identified' }
}

export function isBlockedPath(path: string): boolean {
  return path.startsWith('/admin') || path.startsWith('/dashboard') || path.startsWith('/ops')
}

function isHeadless(userAgent: string): boolean {
  return /Headless|PhantomJS|Playwright|Puppeteer/i.test(userAgent)
}

function hasQaFlag(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return params.get('ba_qa') === '1'
}

export function posthogScriptUrl(host: string): string {
  const assets = host === 'https://eu.i.posthog.com' ? 'https://eu-assets.i.posthog.com' : host
  return `${assets}/static/array.js`
}

export function posthogCaptureUrl(host: string): string {
  return `${host.replace(/\/$/, '')}/i/v0/e/`
}

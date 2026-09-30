import { ATTRIBUTION_VERSION } from './consent_versions.ts'

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)|\d{8,}/
const TOKEN_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/
const HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
const PATH_RE = /^\/[a-z0-9/_-]{0,99}$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const FUTURE_SKEW_MS = 5 * 60 * 1000

export type TouchRecord = {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  referrer_host: string | null
  landing_path: string | null
  at: string | null
}

export type AttributionColumns = {
  ft_source?: string
  ft_medium?: string
  ft_campaign?: string
  ft_content?: string
  ft_term?: string
  ft_referrer_host?: string
  ft_landing_path?: string
  ft_at?: string
  lt_source?: string
  lt_medium?: string
  lt_campaign?: string
  analytics_id?: string
  attribution_version?: number
}

const ALIASES: Record<string, keyof TouchRecord> = {
  source: 'source',
  utm_source: 'source',
  medium: 'medium',
  utm_medium: 'medium',
  campaign: 'campaign',
  utm_campaign: 'campaign',
  content: 'content',
  utm_content: 'content',
  term: 'term',
  utm_term: 'term',
  referrer_host: 'referrer_host',
  landing_path: 'landing_path',
  at: 'at',
}

export function emptyTouch(): TouchRecord {
  return {
    source: null,
    medium: null,
    campaign: null,
    content: null,
    term: null,
    referrer_host: null,
    landing_path: null,
    at: null,
  }
}

export function containsPersonalContact(value: string): boolean {
  return EMAIL_RE.test(value) || PHONE_RE.test(value)
}

function cleanToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase().slice(0, 100)
  if (!text || containsPersonalContact(text) || !TOKEN_RE.test(text)) return null
  return text
}

function cleanHost(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase().slice(0, 100)
  if (!text || containsPersonalContact(text) || !HOST_RE.test(text)) return null
  return text
}

function cleanPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase().slice(0, 100)
  if (!text || containsPersonalContact(text) || !PATH_RE.test(text)) return null
  return text
}

function cleanAt(value: unknown, now: number): string | null {
  if (typeof value !== 'string' || value.length > 40) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  if (parsed > now + FUTURE_SKEW_MS) return null
  if (parsed < now - NINETY_DAYS_MS) return null
  return new Date(parsed).toISOString()
}

/** Allowlisted keys only. Unknown keys are dropped. Email and phone shapes are dropped. */
export function sanitizeTouch(input: unknown, now = Date.now()): TouchRecord {
  const touch = emptyTouch()
  if (!input || typeof input !== 'object' || Array.isArray(input)) return touch
  const record = input as Record<string, unknown>
  for (const [key, raw] of Object.entries(record)) {
    const field = ALIASES[key]
    if (!field || touch[field]) continue
    if (field === 'at') touch.at = cleanAt(raw, now)
    else if (field === 'referrer_host') touch.referrer_host = cleanHost(raw)
    else if (field === 'landing_path') touch.landing_path = cleanPath(raw)
    else touch[field] = cleanToken(raw)
  }
  return touch
}

export function sanitizeAnalyticsId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  if (!UUID_RE.test(text)) return null
  return text
}

function assignTouch(
  columns: AttributionColumns,
  prefix: 'ft' | 'lt',
  touch: TouchRecord,
  fields: (keyof TouchRecord)[],
) {
  for (const field of fields) {
    const value = touch[field]
    if (!value) continue
    const column = `${prefix}_${field}` as keyof AttributionColumns
    ;(columns as Record<string, string | number>)[column] = value
  }
}

/**
 * Columns for applications. Invalid keys are omitted.
 * Older clients that send no touch payload still submit.
 */
export function attributionColumns(body: Record<string, unknown>, now = Date.now()): AttributionColumns {
  const first = sanitizeTouch(body.first_touch, now)
  const last = sanitizeTouch(body.last_touch, now)
  const columns: AttributionColumns = {}
  assignTouch(columns, 'ft', first, [
    'source',
    'medium',
    'campaign',
    'content',
    'term',
    'referrer_host',
    'landing_path',
    'at',
  ])
  assignTouch(columns, 'lt', last, ['source', 'medium', 'campaign'])
  const analyticsId = sanitizeAnalyticsId(body.analytics_id)
  if (analyticsId) columns.analytics_id = analyticsId
  if (Object.keys(columns).length > 0) columns.attribution_version = ATTRIBUTION_VERSION
  return columns
}

export type StoredAttribution = {
  ft_source: string | null
  ft_medium: string | null
  ft_campaign: string | null
  ft_content: string | null
  ft_term: string | null
  ft_referrer_host: string | null
  ft_landing_path: string | null
  ft_at: string | null
  lt_source: string | null
  lt_medium: string | null
  lt_campaign: string | null
  analytics_id: string | null
  attribution_version: number
}

/** Same shape PR #85's register path can import. analytics_id must be a uuid. */
export function readTouch(input: unknown): TouchRecord {
  return sanitizeTouch(input)
}

export function storeAttribution(input: {
  first: unknown
  last: unknown
  analyticsId: unknown
}): StoredAttribution {
  const first = sanitizeTouch(input.first)
  const last = sanitizeTouch(input.last)
  return {
    ft_source: first.source,
    ft_medium: first.medium,
    ft_campaign: first.campaign,
    ft_content: first.content,
    ft_term: first.term,
    ft_referrer_host: first.referrer_host,
    ft_landing_path: first.landing_path,
    ft_at: first.at,
    lt_source: last.source,
    lt_medium: last.medium,
    lt_campaign: last.campaign,
    analytics_id: sanitizeAnalyticsId(input.analyticsId),
    attribution_version: ATTRIBUTION_VERSION,
  }
}

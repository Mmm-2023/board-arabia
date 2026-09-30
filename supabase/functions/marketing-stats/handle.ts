/**
 * Staff marketing-stats. Fixed HogQL only. Aggregates only.
 * The PostHog read key is the Supabase secret POSTHOG_PERSONAL_API_KEY.
 * It is never written to the repo and never returned to the browser.
 * ANALYTICS_ENABLED must be the exact string true, and the key must be present,
 * or the response is not_live.
 */

export const EU_QUERY_HOST = 'https://eu.posthog.com'
export const CACHE_MS = 15 * 60 * 1000
export const CACHE_RETENTION_MS = 24 * 60 * 60 * 1000

const PAID = `properties.utm_medium IN ('paid_social', 'cpc', 'display', 'paid_email', 'partner_paid')`
const CLICK = `(${PAID} OR properties.gclid != '' OR properties.li_fat_id != '')`

const CHANNEL_SQL = {
  all: '1 = 1',
  paid: CLICK,
  organic: `NOT (${CLICK})`,
} as const

export type StatsChannel = keyof typeof CHANNEL_SQL

export type StatsRange = {
  from: string
  to: string
  channel: StatsChannel
}

export type StatsEnv = {
  enabled?: string | null
  personalKey?: string | null
  projectId?: string | null
}

const BANNED_KEYS = [
  'email',
  'phone',
  'ip',
  '$ip',
  'distinct_id',
  'person_id',
  'scale_band',
  'statement',
  'cr_number',
  'turnover',
  'fo_aum',
  'investable_capacity',
  'capacity',
  'name',
  'linkedin',
]

export function personalKeyOk(value: string | null | undefined) {
  const key = value?.trim() || ''
  if (!key || key.startsWith('phc_') || /\s/.test(key)) return false
  if (key.length < 20 || key.length > 200) return false
  return /^[A-Za-z0-9_-]+$/.test(key)
}

export function projectIdOk(value: string | null | undefined) {
  return /^[0-9]{1,12}$/.test(value?.trim() || '')
}

export function liveDecision(env: StatsEnv): 'live' | 'not_live' {
  if (env.enabled?.trim() !== 'true') return 'not_live'
  if (!personalKeyOk(env.personalKey) || !projectIdOk(env.projectId)) return 'not_live'
  return 'live'
}

export function parseStatsRequest(body: unknown, now: Date): { ok: true; value: StatsRange } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Could not read the range.' }
  const row = body as Record<string, unknown>
  const from = stamp(row.from)
  const to = stamp(row.to)
  if (!from || !to || to <= from) return { ok: false, error: 'Could not read the range.' }
  if (to.getTime() - from.getTime() > 400 * 24 * 60 * 60 * 1000) return { ok: false, error: 'Could not read the range.' }
  if (to.getTime() > now.getTime() + 2 * 24 * 60 * 60 * 1000) return { ok: false, error: 'Could not read the range.' }
  const channel = row.channel === 'paid' || row.channel === 'organic' ? row.channel : 'all'
  return { ok: true, value: { from: hogStamp(from), to: hogStamp(to), channel } }
}

function stamp(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function hogStamp(date: Date) {
  const iso = date.toISOString().slice(0, 19).replace('T', ' ')
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso)) throw new Error('bad stamp')
  return iso
}

export function cacheKey(range: StatsRange) {
  return `v1|${range.from}|${range.to}|${range.channel}`
}

export function hogqlBundle(range: StatsRange) {
  const where = `timestamp >= toDateTime('${range.from}') AND timestamp < toDateTime('${range.to}') AND (${CHANNEL_SQL[range.channel]})`
  return {
    visits: `SELECT count() AS visits FROM events WHERE event = 'page_view' AND ${where}`,
    unique_visitors: `SELECT count(DISTINCT person_id) AS unique_visitors FROM events WHERE event = 'page_view' AND properties.consent_state = 'accepted' AND ${where}`,
    register_clicks: `SELECT count() AS register_clicks FROM events WHERE event = 'cta_apply_click' AND ${where}`,
    events_last_24h: `SELECT count() AS events_last_24h FROM events WHERE timestamp >= now() - INTERVAL 1 DAY AND event IN ('page_view', 'page_engaged', 'cta_apply_click')`,
    series: `SELECT toDate(timestamp) AS day, count() AS visits FROM events WHERE event = 'page_view' AND ${where} GROUP BY day ORDER BY day`,
    countries: `SELECT properties.$geoip_country_name AS country, count() AS visits FROM events WHERE event = 'page_view' AND ${where} GROUP BY country ORDER BY visits DESC LIMIT 40`,
    cities: `SELECT properties.$geoip_city_name AS city, count() AS visits FROM events WHERE event = 'page_view' AND ${where} GROUP BY city ORDER BY visits DESC LIMIT 80`,
    pages: `SELECT properties.path AS path, countIf(event = 'page_view') AS views, count(DISTINCT if(event = 'page_view' AND properties.consent_state = 'accepted', person_id, NULL)) AS uniques, medianIf(toFloat(properties.engaged_seconds), event = 'page_engaged') AS median_engaged, avgIf(toFloat(properties.max_scroll_pct), event = 'page_engaged') AS avg_scroll, countIf(event = 'page_engaged' AND properties.reached_75 = true) AS reached, countIf(event = 'page_engaged') AS engaged, countIf(event = 'cta_apply_click') AS clicks FROM events WHERE event IN ('page_view', 'page_engaged', 'cta_apply_click') AND ${where} GROUP BY path ORDER BY views DESC LIMIT 30`,
    sources: `SELECT if(properties.utm_source = '', 'direct', properties.utm_source) AS source, if(properties.utm_medium = '', 'none', properties.utm_medium) AS medium, count() AS visits FROM events WHERE event = 'page_view' AND ${where} GROUP BY source, medium ORDER BY visits DESC LIMIT 40`,
  }
}

export function queryUrl(projectId: string) {
  if (!projectIdOk(projectId)) throw new Error('bad project')
  return `${EU_QUERY_HOST}/api/projects/${projectId.trim()}/query/`
}

export type Bucket = number | 'lt5'

function bucket(value: number): Bucket {
  if (!Number.isFinite(value) || value <= 0) return 0
  const rounded = Math.round(value)
  if (rounded < 5) return 'lt5'
  return rounded
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return null
}

export function rowsOf(result: unknown): unknown[][] {
  if (!result || typeof result !== 'object') return []
  const results = (result as { results?: unknown }).results
  if (!Array.isArray(results)) return []
  return results.map((line) => {
    if (Array.isArray(line)) return line
    if (line && typeof line === 'object') return Object.values(line as Record<string, unknown>)
    return []
  })
}

function placeName(value: unknown) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > 60 || text.includes('@') || /\d{6,}/.test(text)) return null
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(text)) return null
  return text
}

function token(value: unknown) {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  if (!text || text === 'direct' || text === 'none') return text || null
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(text)) return null
  return text
}

function pathName(value: unknown) {
  if (typeof value !== 'string') return null
  if (!/^\/[a-z0-9/_-]{0,80}$/i.test(value)) return null
  return value
}

export function shapeStats(raw: Record<string, unknown>, generatedAt: string) {
  const visits = bucket(asNumber(rowsOf(raw.visits)[0]?.[0]) ?? 0)
  const unique = bucket(asNumber(rowsOf(raw.unique_visitors)[0]?.[0]) ?? 0)
  const clicks = bucket(asNumber(rowsOf(raw.register_clicks)[0]?.[0]) ?? 0)
  const recent = bucket(asNumber(rowsOf(raw.events_last_24h)[0]?.[0]) ?? 0)
  const series = rowsOf(raw.series)
    .map((line) => {
      const day = typeof line[0] === 'string' ? line[0].slice(0, 10) : ''
      const count = asNumber(line[1])
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || count == null) return null
      return { day, visits: bucket(count) }
    })
    .filter((row): row is { day: string; visits: Bucket } => Boolean(row))

  const countries = rowsOf(raw.countries)
    .map((line) => {
      const label = placeName(line[0])
      const count = asNumber(line[1])
      if (!label || count == null) return null
      return { label, visits: bucket(count) }
    })
    .filter((row): row is { label: string; visits: Bucket } => Boolean(row))

  const cityRows = rowsOf(raw.cities)
    .map((line) => {
      const label = placeName(line[0])
      const count = asNumber(line[1])
      if (!label || count == null) return null
      return { label, visits: count }
    })
    .filter((row): row is { label: string; visits: number } => Boolean(row))
  const named = cityRows.filter((row) => row.visits >= 5)
  const other = cityRows.filter((row) => row.visits < 5).reduce((sum, row) => sum + row.visits, 0)
  const cities = named.map((row) => ({ label: row.label, visits: bucket(row.visits) }))
  if (other > 0) cities.push({ label: 'Other', visits: bucket(other) })

  const pages = rowsOf(raw.pages)
    .map((line) => {
      const path = pathName(line[0])
      const views = asNumber(line[1])
      const uniques = asNumber(line[2])
      const median = asNumber(line[3])
      const scroll = asNumber(line[4])
      const reached = asNumber(line[5])
      const engaged = asNumber(line[6])
      const pageClicks = asNumber(line[7])
      if (!path || views == null) return null
      const hidden = views < 5
      const reachedPct = engaged && engaged > 0 && reached != null ? Math.round((reached / engaged) * 100) : 0
      const rate = !hidden && pageClicks != null ? Math.round((pageClicks / views) * 100) : null
      return {
        path,
        views: bucket(views),
        unique: bucket(uniques ?? 0),
        median_engaged_seconds: hidden ? ('lt5' as const) : Math.max(0, Math.round(median ?? 0)),
        avg_scroll: hidden ? ('lt5' as const) : Math.max(0, Math.min(100, Math.round(scroll ?? 0))),
        reached_75_pct: hidden ? ('lt5' as const) : Math.max(0, Math.min(100, reachedPct)),
        register_click_rate: rate,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  const sources = rowsOf(raw.sources)
    .map((line) => {
      const source = token(line[0]) || 'direct'
      const medium = token(line[1]) || 'none'
      const count = asNumber(line[2])
      if (count == null) return null
      return { source, medium, visits: bucket(count) }
    })
    .filter((row): row is { source: string; medium: string; visits: Bucket } => Boolean(row))

  return {
    status: 'ok' as const,
    cached: false,
    generated_at: generatedAt,
    visits,
    unique_visitors: unique,
    unique_visitors_label: 'estimate' as const,
    register_clicks: clicks,
    events_last_24h: recent,
    series,
    countries,
    cities,
    pages,
    sources,
  }
}

export function responseIsAggregate(body: unknown) {
  const text = JSON.stringify(body)
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return false
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text)) return false
  if (text.includes('phx_') || text.includes('phc_')) return false
  const keys = collectKeys(body)
  return BANNED_KEYS.every((key) => !keys.has(key))
}

function collectKeys(value: unknown, out = new Set<string>()) {
  if (!value || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out)
    return out
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out.add(key)
    collectKeys(child, out)
  }
  return out
}

export function notLiveBody() {
  return { status: 'not_live' as const }
}

export function errorBody(lastGoodAt: string | null) {
  return {
    status: 'error' as const,
    message: 'Site analytics could not be loaded.',
    last_good_at: lastGoodAt,
  }
}

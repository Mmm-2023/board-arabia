/** Staff marketing aggregates. Counts under 5 stay masked. No person fields. */

export type Bucket = number | 'lt5'

export type FunnelCounts = {
  form_sent: Bucket
  email_verified: Bucket
  legacy_applications: Bucket
  checklist_complete: Bucket
  full_requested: Bucket
  approved: Bucket
  legacy_approved: Bucket
}

export type SourceRow = {
  source: string
  medium: string
  kind: 'paid' | 'organic'
  line: 'candidate' | 'legacy'
  registrations: Bucket
  approved: Bucket
}

export type DayRow = {
  day: string
  registrations: Bucket
}

export type ChecklistRow = {
  step: string
  count: Bucket
}

export type FunnelPayload = {
  from: string
  to: string
  channel: 'all' | 'paid' | 'organic'
  funnel: FunnelCounts
  checklist: ChecklistRow[]
  sources: SourceRow[]
  days: DayRow[]
  has_quiet_days: boolean
  has_spend: boolean
}

export type StatsStatus = 'ok' | 'not_live' | 'error' | 'loading'

export type PageStat = {
  path: string
  views: Bucket
  unique: Bucket
  median_engaged_seconds: Bucket
  avg_scroll: Bucket
  reached_75_pct: Bucket
  register_click_rate: Bucket | null
}

export type PlaceStat = {
  label: string
  visits: Bucket
}

export type VisitDay = {
  day: string
  visits: Bucket
}

export type VisitSource = {
  source: string
  medium: string
  visits: Bucket
}

export type StatsPayload = {
  status: 'ok'
  cached?: boolean
  generated_at: string
  visits: Bucket
  unique_visitors: Bucket
  register_clicks: Bucket
  events_last_24h: Bucket
  series: VisitDay[]
  countries: PlaceStat[]
  cities: PlaceStat[]
  pages: PageStat[]
  sources: VisitSource[]
}

export const PAID_MEDIUMS = ['paid_social', 'cpc', 'display', 'paid_email', 'partner_paid'] as const

export const CHECKLIST_LABELS: Record<string, string> = {
  email: 'Email verified',
  role: 'Role',
  company_title: 'Company and title',
  linkedin: 'LinkedIn',
  scale_band: 'Scale step',
  sectors: 'Sector and Vision 2030 tags',
  statement: 'Short statement',
  cr_number: 'Commercial registration',
  referral: 'Referral',
  capacity: 'Investable capacity',
  phone: 'Phone',
}

const TEST_EMAIL = /(^|[.+_-])test([.+_@-]|$)/

/**
 * A test token in the local part, or the whole example.com domain.
 * Pass null to check the token only. The default domain is example.com.
 */
export function isTestEmail(email: string | null | undefined, testDomain: string | null = '@example.com') {
  const value = (email || '').trim().toLowerCase()
  if (!value) return false
  if (TEST_EMAIL.test(value)) return true
  if (!testDomain) return false
  return value.endsWith(testDomain.toLowerCase())
}

export function isPaidMedium(medium: string | null | undefined) {
  return PAID_MEDIUMS.includes((medium || '').trim().toLowerCase() as (typeof PAID_MEDIUMS)[number])
}

export function bucketCount(n: number): Bucket {
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n < 5) return 'lt5'
  return Math.round(n)
}

export function formatCount(value: Bucket | null | undefined) {
  if (value == null) return 'Not live yet'
  if (value === 'lt5') return 'Fewer than 5'
  return String(value)
}

export function formatDelta(current: Bucket, previous: Bucket | null) {
  if (previous == null) return null
  if (current === 'lt5' || previous === 'lt5') return null
  const diff = current - previous
  if (diff === 0) return 'No change'
  if (diff > 0) return `Up ${diff}`
  return `Down ${Math.abs(diff)}`
}

export function freshnessLine(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hh = parts.find((part) => part.type === 'hour')?.value ?? '00'
  const mm = parts.find((part) => part.type === 'minute')?.value ?? '00'
  return `Site data updated ${hh}:${mm} AST · Registrations live`
}

export function firstTouchChip(source: string | null | undefined, medium: string | null | undefined) {
  const rawLeft = (source || '').trim()
  const rawRight = (medium || '').trim()
  if (!rawLeft && !rawRight) return null
  if ((rawLeft && !cleanToken(rawLeft)) || (rawRight && !cleanToken(rawRight))) return null
  const left = cleanToken(rawLeft)
  const right = cleanToken(rawRight)
  if (left && right) return `${left} / ${right}`
  return left || right
}

function cleanToken(value: string | null | undefined) {
  const text = (value || '').trim().toLowerCase()
  if (!text || text.length > 100) return null
  if (text.includes('@') || /\d{8,}/.test(text)) return null
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(text)) return null
  return text
}

export type RangeId = '7' | '30' | '90' | 'custom'
export type ChannelId = 'all' | 'paid' | 'organic'

export function astDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function addDays(isoDate: string, days: number) {
  const start = new Date(`${isoDate}T00:00:00+03:00`)
  start.setUTCDate(start.getUTCDate() + days)
  return astDate(start)
}

function dayStamp(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

export function windowFor(range: RangeId, now: Date, customFrom?: string, customTo?: string) {
  const today = astDate(now)
  const end = addDays(today, 1)
  const fromStamp = dayStamp(customFrom)
  const toStamp = dayStamp(customTo)
  if (range === 'custom' && fromStamp && toStamp && fromStamp <= toStamp) {
    const to = addDays(toStamp, 1)
    const fromDate = new Date(`${fromStamp}T00:00:00+03:00`)
    const toDate = new Date(`${to}T00:00:00+03:00`)
    if (toDate.getTime() - fromDate.getTime() <= 366 * 24 * 60 * 60 * 1000) {
      return { from: fromDate, to: toDate }
    }
  }
  const days = range === '7' ? 7 : range === '90' ? 90 : 30
  return { from: new Date(`${addDays(today, 1 - days)}T00:00:00+03:00`), to: new Date(`${end}T00:00:00+03:00`) }
}

export function previousWindow(from: Date, to: Date) {
  const span = to.getTime() - from.getTime()
  return { from: new Date(from.getTime() - span), to: new Date(from.getTime()) }
}

export function readMarketingSearch(params: URLSearchParams, now = new Date()) {
  const rangeRaw = params.get('range')
  const range: RangeId = rangeRaw === '7' || rangeRaw === '90' || rangeRaw === 'custom' ? rangeRaw : '30'
  const channelRaw = params.get('channel')
  const channel: ChannelId = channelRaw === 'paid' || channelRaw === 'organic' ? channelRaw : 'all'
  const compare = params.get('compare') === '1'
  const customFrom = params.get('from') || ''
  const customTo = params.get('to') || ''
  const window = windowFor(range, now, customFrom, customTo)
  return { range, channel, compare, customFrom, customTo, window, previous: previousWindow(window.from, window.to) }
}

export function attentionLine(input: {
  analyticsLive: boolean
  eventsLast24h: Bucket | null
  funnel: FunnelCounts
  previous: FunnelCounts | null
  sources: SourceRow[]
  visitSources: VisitSource[]
}) {
  if (input.analyticsLive && input.eventsLast24h === 0) return 'No site events in the last 24 hours.'
  const quietSource = input.visitSources.find((row) => numeric(row.visits) >= 5 && registrationsFor(input.sources, row) === 0)
  if (quietSource) return `${quietSource.source} / ${quietSource.medium} has visits and no registrations.`
  const drop = largestDrop(input.funnel, input.previous)
  if (drop) return drop
  if (input.funnel.email_verified === 0 && input.funnel.legacy_applications === 0) {
    return 'No registrations in this range.'
  }
  if (!input.analyticsLive) return 'Registration numbers are live. Site tracking is not on yet.'
  return 'No unusual drop in this range.'
}

function registrationsFor(sources: SourceRow[], visit: VisitSource) {
  const row = sources.find((item) => item.source === visit.source && item.medium === visit.medium && item.line === 'candidate')
  if (!row) return 0
  return numeric(row.registrations)
}

function numeric(value: Bucket) {
  return value === 'lt5' ? 0 : value
}

const DROP_PAIRS: [keyof FunnelCounts, keyof FunnelCounts, string][] = [
  ['form_sent', 'email_verified', 'Form sent to email verified'],
  ['email_verified', 'checklist_complete', 'Email verified to checklist'],
  ['checklist_complete', 'full_requested', 'Checklist to full request'],
  ['full_requested', 'approved', 'Full request to approved'],
]

function largestDrop(funnel: FunnelCounts, previous: FunnelCounts | null) {
  let best: { label: string; size: number } | null = null
  for (const [from, to, label] of DROP_PAIRS) {
    const start = numeric(funnel[from])
    const end = numeric(funnel[to])
    if (start < 5 || end < 0) continue
    const size = start - end
    if (size < 5) continue
    if (!best || size > best.size) best = { label, size }
  }
  if (!best) return null
  if (previous) {
    const prior = DROP_PAIRS.map(([from, to]) => numeric(previous[from]) - numeric(previous[to])).reduce((a, b) => Math.max(a, b), 0)
    if (prior >= 5 && best.size > prior) return `${best.label} is the largest drop, and it widened versus the previous period.`
  }
  return `${best.label} is the largest drop in this range.`
}

export function topSource(sources: SourceRow[]) {
  let best: SourceRow | null = null
  for (const row of sources) {
    if (row.line !== 'candidate') continue
    if (typeof row.registrations !== 'number' || row.registrations < 5) continue
    if (!best || numeric(row.registrations) > numeric(best.registrations)) best = row
  }
  if (best) return `${best.source} / ${best.medium}`
  const named = sources.filter((row) => row.line === 'candidate')
  if (named.length === 1) return `${named[0].source} / ${named[0].medium}`
  if (named.length > 1) return 'Fewer than 5'
  return null
}

export function visitRate(visits: Bucket | null, registrations: Bucket) {
  if (visits == null) return 'Not live yet'
  if (visits === 'lt5' || registrations === 'lt5' || visits === 0) return 'Approximate'
  return `${Math.round((registrations / visits) * 100)}%`
}

export function registrationTotal(funnel: FunnelCounts): Bucket {
  const email = funnel.email_verified
  const legacy = funnel.legacy_applications
  if (email === 'lt5' || legacy === 'lt5') {
    if (email === 'lt5' && legacy === 0) return 'lt5'
    if (legacy === 'lt5' && email === 0) return 'lt5'
    if (typeof email === 'number' && typeof legacy === 'number') return bucketCount(email + legacy)
    return 'lt5'
  }
  return bucketCount(email + legacy)
}

export function emptyFunnel(): FunnelPayload {
  const zero: Bucket = 0
  return {
    from: '',
    to: '',
    channel: 'all',
    funnel: {
      form_sent: zero,
      email_verified: zero,
      legacy_applications: zero,
      checklist_complete: zero,
      full_requested: zero,
      approved: zero,
      legacy_approved: zero,
    },
    checklist: [],
    sources: [],
    days: [],
    has_quiet_days: false,
    has_spend: false,
  }
}

function asBucket(value: unknown): Bucket | null {
  if (value === 'lt5') return 'lt5'
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value < 5 && value > 0 ? 'lt5' : Math.round(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) return asBucket(Number(value))
  return null
}

export function parseFunnel(input: unknown): FunnelPayload | null {
  if (!input || typeof input !== 'object') return null
  const row = input as Record<string, unknown>
  const funnel = row.funnel
  if (!funnel || typeof funnel !== 'object') return null
  const counts = funnel as Record<string, unknown>
  const keys = ['form_sent', 'email_verified', 'legacy_applications', 'checklist_complete', 'full_requested', 'approved', 'legacy_approved'] as const
  const parsed = {} as FunnelCounts
  for (const key of keys) {
    const value = asBucket(counts[key])
    if (value == null) return null
    parsed[key] = value
  }
  const channel = row.channel === 'paid' || row.channel === 'organic' ? row.channel : 'all'
  return {
    from: typeof row.from === 'string' ? row.from : '',
    to: typeof row.to === 'string' ? row.to : '',
    channel,
    funnel: parsed,
    checklist: parseChecklist(row.checklist),
    sources: parseSources(row.sources),
    days: parseDays(row.days),
    has_quiet_days: row.has_quiet_days === true,
    has_spend: row.has_spend === true,
  }
}

function parseChecklist(input: unknown): ChecklistRow[] {
  if (!Array.isArray(input)) return []
  const rows: ChecklistRow[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.step !== 'string' || !CHECKLIST_LABELS[row.step]) continue
    const count = asBucket(row.count)
    if (count == null) continue
    rows.push({ step: row.step, count })
  }
  return rows
}

function parseSources(input: unknown): SourceRow[] {
  if (!Array.isArray(input)) return []
  const rows: SourceRow[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const source = cleanToken(typeof row.source === 'string' ? row.source : null)
    const medium = cleanToken(typeof row.medium === 'string' ? row.medium : null) || 'none'
    if (!source) continue
    const registrations = asBucket(row.registrations)
    const approved = asBucket(row.approved)
    if (registrations == null || approved == null) continue
    rows.push({
      source,
      medium,
      kind: row.kind === 'paid' || isPaidMedium(medium) ? 'paid' : 'organic',
      line: row.line === 'legacy' ? 'legacy' : 'candidate',
      registrations,
      approved,
    })
  }
  return rows
}

function parseDays(input: unknown): DayRow[] {
  if (!Array.isArray(input)) return []
  const rows: DayRow[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)) continue
    const registrations = asBucket(row.registrations)
    if (registrations == null || registrations === 'lt5' || registrations < 5) continue
    rows.push({ day: row.day, registrations })
  }
  return rows
}

export function marketingCsv(funnel: FunnelPayload, stats: StatsPayload | null) {
  const lines = ['metric,value,source']
  const add = (metric: string, value: string, source: string) => {
    lines.push(`${metric},${csvCell(value)},${source}`)
  }
  add('form_sent', formatCount(funnel.funnel.form_sent), 'supabase')
  add('email_verified', formatCount(funnel.funnel.email_verified), 'supabase')
  add('legacy_applications', formatCount(funnel.funnel.legacy_applications), 'supabase')
  add('checklist_complete', formatCount(funnel.funnel.checklist_complete), 'supabase')
  add('full_requested', formatCount(funnel.funnel.full_requested), 'supabase')
  add('approved', formatCount(funnel.funnel.approved), 'supabase')
  if (stats) {
    add('visits', formatCount(stats.visits), 'posthog')
    add('unique_visitors_estimate', formatCount(stats.unique_visitors), 'posthog')
    add('register_clicks', formatCount(stats.register_clicks), 'posthog')
  }
  for (const row of funnel.sources) {
    add(`registrations_${row.line}_${row.source}_${row.medium}`, formatCount(row.registrations), 'supabase')
  }
  return lines.join('\n')
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '')}"`
}

export function countsAreZero(funnel: FunnelPayload) {
  return Object.values(funnel.funnel).every((value) => value === 0)
}

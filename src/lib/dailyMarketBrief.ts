import { bareHostname, barePathPrefix } from '../../supabase/functions/_shared/outlet_allowlist.ts'
import { supabase } from './supabase'

export const DAILY_BRIEF_TITLE = 'Daily brief'
export const DAILY_BRIEF_EMPTY = "Today's brief is not ready yet"
export const DAILY_BRIEF_EMPTY_BODY = 'Check back later.'
export const DAILY_BRIEF_WEEKEND_TITLE = 'No brief on Fridays and Saturdays'
export const DAILY_BRIEF_WEEKEND_BODY = 'The brief runs Sunday to Thursday. The next one is on Sunday.'
export const DAILY_BRIEF_INTRO =
  'What moved in Saudi business, in about two minutes. Summaries are written by AI from the linked reports.'
export const DAILY_BRIEF_AI_LABEL = 'AI summary'
export const DAILY_BRIEF_FOOTER =
  'AI summaries of public reporting. For information only, not advice. A mention is not an endorsement of any company or person. Check the source and do your own due diligence.'
export const DAILY_BRIEF_LOADING = "Loading today's brief"
export const DAILY_BRIEF_ERROR_TITLE = 'We could not load the brief'
export const DAILY_BRIEF_ERROR_BODY = 'Your other pages still work. Try again in a moment.'
export const DAILY_BRIEF_ERROR_BUTTON = 'Try again'
export const DAILY_BRIEF_OPEN = 'Open the brief'
export const DAILY_BRIEF_NOT_CONFIGURED = 'Not configured: search key not set.'
export const DAILY_BRIEF_PATH = '/dashboard/market-brief'
export const HEADLINE_MAX = 90
export const SUMMARY_MAX = 300

const GROUPS = ['deals', 'regulation', 'leadership'] as const

export type DailyBriefGroup = (typeof GROUPS)[number]

export const DAILY_BRIEF_GROUP_LABEL: Record<DailyBriefGroup, string> = {
  deals: 'Deals',
  regulation: 'Regulation',
  leadership: 'Board and leadership',
}

export type DailyBriefItem = {
  group: DailyBriefGroup
  headline: string
  summary: string
  outlet: string
  url: string
  dated: string
}

export type PublishStatus = 'draft' | 'approved' | 'published'

export type MemberBrief = {
  briefDate: string
  generatedAt: string
  items: DailyBriefItem[]
}

export type OutletDraft = {
  id: string
  name: string
  domain: string
  pathPrefix: string
  enabled: boolean
  sortOrder: number
}

export type AdminBriefLatest = {
  briefDate: string
  status: 'ok' | 'not_configured' | 'failed' | 'empty'
  publishStatus: PublishStatus
  generatedAt: string
  itemCount: number
  items: DailyBriefItem[]
}

export type AdminBriefState = {
  enabled: boolean
  membersVisible: boolean
  outlets: OutletDraft[]
  latest: AdminBriefLatest | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const REVIEW_LABEL: Record<PublishStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  published: 'Published',
}

export function briefDateLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return ''
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return ''
  return `${Number(match[3])} ${month} ${match[1]}`
}

export function calendarLabel(iso: string, withYear: boolean): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  const weekday = WEEKDAYS[date.getUTCDay()]
  const monthName = MONTHS_LONG[month - 1]
  if (!weekday || !monthName) return ''
  return withYear ? `${weekday} ${day} ${monthName} ${year}` : `${weekday} ${day} ${monthName}`
}

export function riyadhTodayKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function riyadhIsWeekend(now: Date): boolean {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Riyadh', weekday: 'short' }).format(now)
  return day === 'Fri' || day === 'Sat'
}

export function briefUpdatedLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = parts.find((part) => part.type === 'hour')?.value ?? ''
  const minute = parts.find((part) => part.type === 'minute')?.value ?? ''
  if (!hour || !minute) return ''
  return `Updated ${hour}:${minute} Riyadh time`
}

export function briefRunStamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const month = MONTHS[Number(pick('month')) - 1]
  if (!month || !pick('year') || !pick('day')) return ''
  return `${Number(pick('day'))} ${month} ${pick('year')}, ${pick('hour')}:${pick('minute')}`
}

export function dailyBriefStatusLine(input: {
  searchConfigured: boolean | null
  latest: AdminBriefLatest | null
}): string {
  if (input.searchConfigured === false) return DAILY_BRIEF_NOT_CONFIGURED
  if (input.latest?.status === 'not_configured') return DAILY_BRIEF_NOT_CONFIGURED
  if (!input.latest) return input.searchConfigured === null ? '' : 'No run yet.'
  const stamp = briefRunStamp(input.latest.generatedAt) || briefDateLabel(input.latest.briefDate)
  const review = input.latest.publishStatus ? ` ${REVIEW_LABEL[input.latest.publishStatus]}.` : ''
  return `Last run ${stamp}. ${input.latest.itemCount} items.${review}`
}

function httpsUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    if (url.port && url.port !== '443') return null
    return url.href
  } catch {
    return null
  }
}

function plainEnglish(value: string, max: number): boolean {
  if (!value || value.length > max) return false
  if (value.includes('\u2014') || value.includes('\u2013')) return false
  if (/[\u0600-\u06FF]/.test(value)) return false
  return true
}

function presentItem(value: unknown): DailyBriefItem | null {
  if (!value || typeof value !== 'object') return null
  const row = value as {
    group?: unknown
    headline?: unknown
    summary?: unknown
    outlet?: unknown
    url?: unknown
    dated?: unknown
  }
  if (typeof row.group !== 'string' || !GROUPS.includes(row.group as DailyBriefGroup)) return null
  if (
    typeof row.headline !== 'string' ||
    typeof row.summary !== 'string' ||
    typeof row.outlet !== 'string' ||
    typeof row.url !== 'string'
  ) {
    return null
  }
  const headline = row.headline.replace(/\s+/g, ' ').trim()
  const summary = row.summary.replace(/\s+/g, ' ').trim()
  const outlet = row.outlet.replace(/\s+/g, ' ').trim()
  if (!plainEnglish(headline, HEADLINE_MAX) || !plainEnglish(summary, SUMMARY_MAX)) return null
  if (!outlet || outlet.length > 120) return null
  const url = httpsUrl(row.url)
  if (!url) return null
  const dated = typeof row.dated === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.dated) ? row.dated.slice(0, 10) : ''
  if (!dated) return null
  return { group: row.group as DailyBriefGroup, headline, summary, outlet, url, dated }
}

export function orderedBriefItems(items: DailyBriefItem[]): DailyBriefItem[] {
  const rank: Record<DailyBriefGroup, number> = { deals: 0, regulation: 1, leadership: 2 }
  const sorted = [...items].sort((left, right) => rank[left.group] - rank[right.group] || right.dated.localeCompare(left.dated))
  const counts: Record<DailyBriefGroup, number> = { deals: 0, regulation: 0, leadership: 0 }
  const kept: DailyBriefItem[] = []
  for (const item of sorted) {
    if (kept.length >= 8) break
    if (counts[item.group] >= 3) continue
    counts[item.group] += 1
    kept.push(item)
  }
  return kept
}

export function presentMemberBrief(data: unknown): MemberBrief | null {
  if (!data || typeof data !== 'object') return null
  const row = data as { brief_date?: unknown; generated_at?: unknown; items?: unknown }
  if (typeof row.brief_date !== 'string' || !Array.isArray(row.items)) return null
  const items = orderedBriefItems(row.items.map(presentItem).filter((item): item is DailyBriefItem => item !== null))
  if (items.length === 0) return null
  return {
    briefDate: row.brief_date.slice(0, 10),
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : row.brief_date,
    items,
  }
}

export function presentAdminBrief(data: unknown): AdminBriefState | null {
  if (!data || typeof data !== 'object') return null
  const row = data as {
    enabled?: unknown
    members_visible?: unknown
    outlets?: unknown
    latest?: unknown
  }
  if (!Array.isArray(row.outlets)) return null
  const outlets: OutletDraft[] = []
  for (const value of row.outlets) {
    if (!value || typeof value !== 'object') continue
    const outlet = value as {
      id?: unknown
      name?: unknown
      domain?: unknown
      path_prefix?: unknown
      enabled?: unknown
      sort_order?: unknown
    }
    if (typeof outlet.id !== 'string' || typeof outlet.name !== 'string' || typeof outlet.domain !== 'string') continue
    outlets.push({
      id: outlet.id,
      name: outlet.name,
      domain: outlet.domain,
      pathPrefix: typeof outlet.path_prefix === 'string' ? outlet.path_prefix : '',
      enabled: outlet.enabled === true,
      sortOrder: typeof outlet.sort_order === 'number' ? outlet.sort_order : outlets.length + 1,
    })
  }
  return {
    enabled: row.enabled === true,
    membersVisible: row.members_visible === true,
    outlets,
    latest: presentLatest(row.latest),
  }
}

function presentLatest(value: unknown): AdminBriefLatest | null {
  if (!value || typeof value !== 'object') return null
  const row = value as {
    brief_date?: unknown
    status?: unknown
    generated_at?: unknown
    item_count?: unknown
    items?: unknown
  }
  if (typeof row.brief_date !== 'string' || typeof row.status !== 'string') return null
  if (row.status !== 'ok' && row.status !== 'not_configured' && row.status !== 'failed' && row.status !== 'empty') {
    return null
  }
  const items = orderedBriefItems(
    Array.isArray(row.items) ? row.items.map(presentItem).filter((item): item is DailyBriefItem => item !== null) : [],
  )
  const publish = (row as { publish_status?: unknown }).publish_status
  const publishStatus: PublishStatus = publish === 'approved' || publish === 'published' ? publish : 'draft'
  return {
    briefDate: row.brief_date.slice(0, 10),
    status: row.status,
    publishStatus,
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : row.brief_date,
    itemCount: typeof row.item_count === 'number' ? row.item_count : items.length,
    items,
  }
}

export function outletFieldError(name: string, domain: string, pathPrefix: string): string {
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 120 || trimmed.includes('@')) return 'Enter an outlet name.'
  if (!bareHostname(domain)) return 'Enter a bare hostname.'
  if (barePathPrefix(pathPrefix) === 'invalid') return 'Path prefix must start with / and have no trailing slash.'
  return ''
}

export type MemberBriefLoad =
  | { status: 'ready'; brief: MemberBrief }
  | { status: 'empty' }
  | { status: 'error' }

export async function loadMemberDailyBrief(): Promise<MemberBriefLoad> {
  const { data, error } = await supabase.rpc('market_brief_for_member')
  if (error) return { status: 'error' }
  const brief = presentMemberBrief(data)
  if (!brief) return { status: 'empty' }
  return { status: 'ready', brief }
}

export async function readMemberDailyBrief(): Promise<MemberBrief | null> {
  const loaded = await loadMemberDailyBrief()
  return loaded.status === 'ready' ? loaded.brief : null
}

export async function readAdminDailyBrief(): Promise<AdminBriefState | null> {
  const { data, error } = await supabase.rpc('market_brief_admin_state')
  if (error) return null
  return presentAdminBrief(data)
}

export async function saveDailyBriefSettings(enabled: boolean, membersVisible: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('market_brief_save_settings', {
    p_enabled: enabled,
    p_members_visible: membersVisible,
  })
  return !error
}

export async function saveDailyBriefOutlet(input: {
  id: string | null
  name: string
  domain: string
  pathPrefix: string
  enabled: boolean
}): Promise<boolean> {
  const domain = bareHostname(input.domain)
  const prefix = barePathPrefix(input.pathPrefix)
  if (!domain || prefix === 'invalid') return false
  const { error } = await supabase.rpc('market_brief_save_outlet', {
    p_id: input.id,
    p_name: input.name.trim(),
    p_domain: domain,
    p_path_prefix: prefix,
    p_enabled: input.enabled,
  })
  return !error
}

export async function reorderDailyBriefOutlets(ids: string[]): Promise<boolean> {
  const { error } = await supabase.rpc('market_brief_reorder_outlets', { p_ids: ids })
  return !error
}

export async function setDailyBriefPublish(briefDate: string, next: 'approved' | 'published'): Promise<boolean> {
  const { error } = await supabase.rpc('market_brief_set_publish', {
    p_brief_date: briefDate,
    p_next: next,
  })
  return !error
}

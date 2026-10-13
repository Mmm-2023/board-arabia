import { bareHostname, barePathPrefix } from '../../supabase/functions/_shared/outlet_allowlist.ts'
import { supabase } from './supabase'

export const DAILY_BRIEF_TITLE = 'Daily market brief'
export const DAILY_BRIEF_EMPTY = 'No brief today.'
export const DAILY_BRIEF_AI_LABEL = 'AI summary'
export const DAILY_BRIEF_FOOTER =
  'AI-generated from the linked sources. Check the source before relying on it. Not investment advice.'
export const DAILY_BRIEF_NOT_CONFIGURED = 'Not configured: search key not set.'
export const DAILY_BRIEF_PATH = '/dashboard/market-brief'

const GROUPS = ['deals', 'regulation', 'leadership'] as const

export type DailyBriefGroup = (typeof GROUPS)[number]

export const DAILY_BRIEF_GROUP_LABEL: Record<DailyBriefGroup, string> = {
  deals: 'Deals',
  regulation: 'Regulation',
  leadership: 'Board and leadership',
}

export type DailyBriefItem = {
  group: DailyBriefGroup
  summary: string
  outlet: string
  url: string
  dated: string
}

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

export function briefDateLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return ''
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return ''
  return `${Number(match[3])} ${month} ${match[1]}`
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
  return `Last run ${stamp}. ${input.latest.itemCount} items.`
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

function presentItem(value: unknown): DailyBriefItem | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { group?: unknown; summary?: unknown; outlet?: unknown; url?: unknown; dated?: unknown }
  if (typeof row.group !== 'string' || !GROUPS.includes(row.group as DailyBriefGroup)) return null
  if (typeof row.summary !== 'string' || typeof row.outlet !== 'string' || typeof row.url !== 'string') return null
  const summary = row.summary.replace(/\s+/g, ' ').trim()
  const outlet = row.outlet.replace(/\s+/g, ' ').trim()
  if (!summary || summary.length > 400 || !outlet || outlet.length > 120) return null
  if (summary.includes('\u2014') || summary.includes('\u2013')) return null
  if (/[\u0600-\u06FF]/.test(summary)) return null
  const url = httpsUrl(row.url)
  if (!url) return null
  const dated = typeof row.dated === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.dated) ? row.dated.slice(0, 10) : ''
  if (!dated) return null
  return { group: row.group as DailyBriefGroup, summary, outlet, url, dated }
}

export function presentMemberBrief(data: unknown): MemberBrief | null {
  if (!data || typeof data !== 'object') return null
  const row = data as { brief_date?: unknown; generated_at?: unknown; items?: unknown }
  if (typeof row.brief_date !== 'string' || !Array.isArray(row.items)) return null
  const items = row.items.map(presentItem).filter((item): item is DailyBriefItem => item !== null)
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
  const items = Array.isArray(row.items)
    ? row.items.map(presentItem).filter((item): item is DailyBriefItem => item !== null)
    : []
  return {
    briefDate: row.brief_date.slice(0, 10),
    status: row.status,
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

export async function readMemberDailyBrief(): Promise<MemberBrief | null> {
  const { data, error } = await supabase.rpc('market_brief_for_member')
  if (error) return null
  return presentMemberBrief(data)
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

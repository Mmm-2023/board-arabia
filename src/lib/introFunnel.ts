/** Staff introduction funnel. Public and sponsor surfaces must use audience "public". */

import { astDate } from './marketing.ts'

export const INTRO_RANGES = ['month', '30', 'quarter', 'custom'] as const
export type IntroRangeId = (typeof INTRO_RANGES)[number]

export type IntroFunnelAudience = 'staff' | 'public'

export type IntroFunnelCounts = {
  requested: number
  accepted: number
  met: number
  deal_started: number
}

export type IntroFunnelEvent = {
  requestedAt: string
  decidedAt: string | null
  status: 'pending' | 'accepted' | 'declined'
  metAt: string | null
  dealStartedAt: string | null
  sample: boolean
}

export type IntroWindow = { ok: true; from: Date; to: Date } | { ok: false; error: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_CUSTOM_MS = 366 * 24 * 60 * 60 * 1000

/**
 * Shared display rule. Staff see the number. Sponsor and public views show
 * "Fewer than 5" for 1 through 4. Zero stays 0. Five and above stay the number.
 */
export function formatIntroCount(count: number, audience: IntroFunnelAudience): string {
  if (!Number.isFinite(count) || count <= 0) return '0'
  const n = Math.floor(count)
  if (audience === 'public' && n < 5) return 'Fewer than 5'
  return String(n)
}

export function presentIntroFunnel(counts: IntroFunnelCounts, audience: IntroFunnelAudience) {
  return {
    requested: formatIntroCount(counts.requested, audience),
    accepted: formatIntroCount(counts.accepted, audience),
    met: formatIntroCount(counts.met, audience),
    deal_started: formatIntroCount(counts.deal_started, audience),
  }
}

export function introFunnelUpdatedLine(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hh = parts.find((part) => part.type === 'hour')?.value ?? '00'
  const mm = parts.find((part) => part.type === 'minute')?.value ?? '00'
  return `Updated ${hh}:${mm} AST`
}

export function formatDealStartedWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function riyadhStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+03:00`)
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

function monthStamp(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function introFunnelBounds(
  range: IntroRangeId,
  now: Date,
  customFrom = '',
  customTo = '',
): IntroWindow {
  const today = astDate(now)
  const [yearText, monthText] = today.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  if (range === 'month') {
    const next = addMonths(year, month, 1)
    return { ok: true, from: riyadhStart(monthStamp(year, month)), to: riyadhStart(monthStamp(next.year, next.month)) }
  }
  if (range === 'quarter') {
    const startMonth = month <= 3 ? 1 : month <= 6 ? 4 : month <= 9 ? 7 : 10
    const next = addMonths(year, startMonth, 3)
    return {
      ok: true,
      from: riyadhStart(monthStamp(year, startMonth)),
      to: riyadhStart(monthStamp(next.year, next.month)),
    }
  }
  if (range === '30') {
    return { ok: true, from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now }
  }
  if (!DAY.test(customFrom) || !DAY.test(customTo)) {
    return { ok: false, error: 'Choose a start date and an end date.' }
  }
  if (customFrom > customTo) {
    return { ok: false, error: 'Choose a start date on or before the end date.' }
  }
  const from = riyadhStart(customFrom)
  const to = riyadhStart(shiftDay(customTo, 1))
  if (to.getTime() - from.getTime() > MAX_CUSTOM_MS) {
    return { ok: false, error: 'Keep a custom range to 366 days or fewer.' }
  }
  return { ok: true, from, to }
}

function shiftDay(isoDate: string, days: number): string {
  const start = riyadhStart(isoDate)
  start.setUTCDate(start.getUTCDate() + days)
  return astDate(start)
}

function inRange(iso: string | null, from: Date, to: Date): boolean {
  if (!iso) return false
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return false
  return time >= from.getTime() && time < to.getTime()
}

export type MeetYesAnswer = {
  introId: string
  outcome: 'yes' | 'not_yet' | 'no'
  at: string
  sample?: boolean
}

/**
 * Distinct introductions where either party answered yes.
 * The introduction is dated by the earliest yes, inside a half-open range.
 * Sample pairs are skipped. A later yes does not move that date.
 */
export function introMetCount(answers: readonly MeetYesAnswer[], from: Date, to: Date): number {
  if (!(from.getTime() < to.getTime())) return 0
  const earliest = new Map<string, { at: number; sample: boolean }>()
  for (const answer of answers) {
    if (answer.outcome !== 'yes' || !answer.introId) continue
    const at = new Date(answer.at).getTime()
    if (Number.isNaN(at)) continue
    const current = earliest.get(answer.introId)
    if (!current || at < current.at) earliest.set(answer.introId, { at, sample: answer.sample === true })
  }
  let count = 0
  for (const row of earliest.values()) {
    if (row.sample) continue
    if (row.at >= from.getTime() && row.at < to.getTime()) count += 1
  }
  return count
}

/** Stage counts for a half-open range. Sample rows are skipped. Met stays 0 when metAt is null. */
export function countIntroFunnel(rows: readonly IntroFunnelEvent[], from: Date, to: Date): IntroFunnelCounts {
  const counts: IntroFunnelCounts = { requested: 0, accepted: 0, met: 0, deal_started: 0 }
  for (const row of rows) {
    if (row.sample) continue
    if (inRange(row.requestedAt, from, to)) counts.requested += 1
    if (row.status === 'accepted' && inRange(row.decidedAt, from, to)) counts.accepted += 1
    if (inRange(row.metAt, from, to)) counts.met += 1
    if (inRange(row.dealStartedAt, from, to)) counts.deal_started += 1
  }
  return counts
}

export function countsAreZero(counts: IntroFunnelCounts): boolean {
  return counts.requested === 0 && counts.accepted === 0 && counts.met === 0 && counts.deal_started === 0
}

function whole(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

export function presentIntroFunnelPayload(raw: unknown): { counts: IntroFunnelCounts; updatedAt: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const requested = whole(row.requested)
  const accepted = whole(row.accepted)
  const met = whole(row.met)
  const dealStarted = whole(row.deal_started)
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : ''
  if (requested == null || accepted == null || met == null || dealStarted == null) return null
  if (updatedAt.includes('@')) return null
  return {
    counts: { requested, accepted, met, deal_started: dealStarted },
    updatedAt,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function presentIntroDeals(raw: unknown): Record<string, string> {
  if (!Array.isArray(raw)) return {}
  const map: Record<string, string> = {}
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const at = typeof row.deal_started_at === 'string' ? row.deal_started_at : ''
    if (!UUID.test(id) || !at || Number.isNaN(new Date(at).getTime())) continue
    map[id] = at
  }
  return map
}

export function introFunnelDenied(message: string): boolean {
  return /not_allowed|42501/i.test(message)
}

export function introDealAllowed(row: { kind: string; status: string; is_demo: boolean }): boolean {
  return row.kind === 'member' && row.status === 'accepted' && !row.is_demo
}

export function introDealError(message: string): string {
  if (/sample_blocked/i.test(message)) return 'Sample requests stay as they are.'
  if (/not_allowed|42501/i.test(message)) return 'This page is for admin.'
  if (/not_found/i.test(message)) return 'That introduction cannot be tagged.'
  return 'Could not save the deal tag. Retry.'
}

/** Weekly intro suggestions and once-only nudges. Pure planning. No secrets. */

import { boardMail } from './mail.ts'

export const INTROS_SCHEDULE_SECRET = 'INTROS_SCHEDULE_SECRET'
export const INTROS_SCHEDULE_HEADER = 'x-intros-schedule-secret'
/** Suggested introductions per member per ISO week. Admin will own this later via settings. */
export const WEEKLY_INTRO_SUGGESTION_CAP = 2
export const PENDING_NUDGE_MS = 3 * 24 * 60 * 60 * 1000
export const MEET_NUDGE_MS = 7 * 24 * 60 * 60 * 1000

const ADMITTED_STATUS = new Set(['invited', 'active'])
const TARGET_SEATS = new Set(['ksa', 'intl'])

export type PlanMember = {
  id: string
  email: string
  status: string
  seat: string
  isDemo: boolean
  fullName: string
  sectorTags: string[]
  visionThemes: string[]
  region: string
  sample: boolean
  directoryHidden: boolean
}

export type PlanIntro = {
  id: string
  requesterId: string
  targetId: string
  status: string
  requestedAt: string
  decidedAt: string | null
  pendingNudgeSent: boolean
  meetRequesterSent: boolean
  meetTargetSent: boolean
}

export type PlannedSuggestion = {
  memberId: string
  suggestedId: string
  isoYear: number
  isoWeek: number
  rank: number
  reason: string
}

/** A suggestion row already stored for the previous ISO week. */
export type PriorSuggestion = {
  memberId: string
  suggestedId: string
  reason: string
  rank: number
}

export type WeeklyIntroRefill = {
  rows: PlannedSuggestion[]
  carried: number
  added: number
}

export type PlannedNudge = {
  kind: 'pending' | 'meet'
  introId: string
  memberId: string
  email: string
  party: 'requester' | 'target'
}

export type IntroWeekPlan = {
  isoYear: number
  isoWeek: number
  suggestions: PlannedSuggestion[]
  pendingNudges: PlannedNudge[]
  meetNudges: PlannedNudge[]
  membersRefilled: number
  carried: number
  added: number
}

export type SuggestReport = {
  ok: true
  dry_run: boolean
  iso_year: number
  iso_week: number
  members_refilled: number
  carried: number
  new: number
  suggestions: Array<{ member_id: string; suggested_id: string; rank: number; reason: string }>
  pending_nudges: Array<{ intro_id: string; target_id: string }>
  meet_nudges: Array<{ intro_id: string; member_id: string }>
  mail_ready: boolean
  wrote: boolean
  sent: number
}

export function isoWeekParts(date: Date): { year: number; week: number } {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const year = utc.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year, week }
}

export function previousIsoWeek(date: Date): { year: number; week: number } {
  return isoWeekParts(new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000))
}

export function isExampleMemberName(fullName: string): boolean {
  return /\bexample\b/i.test(fullName)
}

export function suggestionReason(input: {
  sectors: readonly string[]
  themes: readonly string[]
  region: string
}): string {
  const sector = input.sectors[0] ? lowerFirst(input.sectors[0]) : ''
  const theme = input.themes[0] ? lowerFirst(input.themes[0]) : ''
  const region = input.region.trim()
  if (sector && region) return `Both work on ${sector} in ${region}.`
  if (sector && theme) return `Both work on ${sector} and ${theme}.`
  if (sector) return `Both work on ${sector}.`
  if (theme && region) return `Both focus on ${theme} in ${region}.`
  if (theme) return `Both focus on ${theme}.`
  if (region) return `Both are in ${region}.`
  return ''
}

export function scheduleAuthorized(secret: string, header: string): boolean {
  const left = secret.trim()
  const right = header.trim()
  if (!left || !right) return false
  return safeEqual(left, right)
}

export function pendingIntroNudgeMail(site: string): { subject: string; text: string; html: string } {
  const url = introsUrl(site)
  return {
    subject: 'An introduction is waiting',
    ...boardMail(
      [
        'A member asked for an introduction. It has been waiting for three days.',
        '',
        'Open Intros to accept or decline.',
        url,
      ].join('\n'),
      `<p>A member asked for an introduction. It has been waiting for three days.</p><p>Open Intros to accept or decline.</p><p><a href="${url}">Open Intros</a></p>`,
    ),
  }
}

export function meetIntroNudgeMail(site: string): { subject: string; text: string; html: string } {
  const url = introsUrl(site)
  return {
    subject: 'Did you meet?',
    ...boardMail(
      [
        'It has been a week since an introduction was accepted.',
        '',
        'Open Intros and say whether you met.',
        url,
      ].join('\n'),
      `<p>It has been a week since an introduction was accepted.</p><p>Open Intros and say whether you met.</p><p><a href="${url}">Open Intros</a></p>`,
    ),
  }
}

export function planIntroWeek(input: {
  now: Date
  members: readonly PlanMember[]
  intros: readonly PlanIntro[]
  priorSuggestions: readonly PriorSuggestion[]
  membersWithCurrentWeek: readonly string[]
}): IntroWeekPlan {
  const week = isoWeekParts(input.now)
  const byId = new Map(input.members.map((member) => [member.id, member]))
  const blocked = blockedPairs(input.intros)
  const current = new Set(input.membersWithCurrentWeek)
  const suggestions: PlannedSuggestion[] = []
  let carried = 0
  let added = 0
  for (const member of input.members) {
    const refill = nextWeeklyIntroSuggestions({
      member,
      members: input.members,
      prior: input.priorSuggestions,
      alreadyThisWeek: current.has(member.id),
      blocked,
      week,
    })
    if (refill.rows.length === 0) continue
    suggestions.push(...refill.rows)
    carried += refill.carried
    added += refill.added
  }
  return {
    isoYear: week.year,
    isoWeek: week.week,
    suggestions,
    pendingNudges: pendingNudges(input.intros, byId, input.now),
    meetNudges: meetNudges(input.intros, byId, input.now),
    membersRefilled: new Set(suggestions.map((row) => row.memberId)).size,
    carried,
    added,
  }
}

/**
 * One member's set for ISO week W.
 * Last week's still-open suggestions come first, then new ranked candidates.
 * Never more than WEEKLY_INTRO_SUGGESTION_CAP.
 * A member who already has rows this week is left untouched until next week.
 * Still open means no introduction was requested either way, the suggested
 * member is still admitted, not a demo or sample, not hidden from the directory,
 * and the pair is not blocked. Carried rows keep the same reason.
 */
export function nextWeeklyIntroSuggestions(input: {
  member: PlanMember
  members: readonly PlanMember[]
  prior: readonly PriorSuggestion[]
  alreadyThisWeek: boolean
  blocked: ReadonlySet<string>
  week: { year: number; week: number }
}): WeeklyIntroRefill {
  if (input.alreadyThisWeek || !isRecipient(input.member)) return { rows: [], carried: 0, added: 0 }
  const byId = new Map(input.members.map((member) => [member.id, member]))
  const seen = new Set<string>()
  const carriedPrior = input.prior
    .filter((row) => row.memberId === input.member.id)
    .filter((row) => carryStillOpen(row, input.member, byId, input.blocked))
    .sort((left, right) => left.rank - right.rank || left.suggestedId.localeCompare(right.suggestedId))
    .filter((row) => {
      if (seen.has(row.suggestedId)) return false
      seen.add(row.suggestedId)
      return true
    })
    .slice(0, WEEKLY_INTRO_SUGGESTION_CAP)
  const carriedRows = carriedPrior.map((row, index) => ({
    memberId: input.member.id,
    suggestedId: row.suggestedId,
    isoYear: input.week.year,
    isoWeek: input.week.week,
    rank: index + 1,
    reason: row.reason,
  }))
  const room = WEEKLY_INTRO_SUGGESTION_CAP - carriedRows.length
  const addedRows =
    room <= 0
      ? []
      : rankedCandidates(input.member, input.members, input.blocked, seen, input.week, room, carriedRows.length)
  return { rows: [...carriedRows, ...addedRows], carried: carriedRows.length, added: addedRows.length }
}

export async function runSuggestIntros(input: {
  dryRun: boolean
  mailReady: boolean
  plan: IntroWeekPlan
  writeSuggestions: (rows: readonly PlannedSuggestion[]) => Promise<void>
  claimPending: (introId: string) => Promise<boolean>
  releasePending: (introId: string) => Promise<void>
  claimMeet: (introId: string, party: 'requester' | 'target') => Promise<boolean>
  releaseMeet: (introId: string, party: 'requester' | 'target') => Promise<void>
  send: (nudge: PlannedNudge, mail: { subject: string; text: string; html: string }) => Promise<'sent' | 'skipped' | 'error'>
  pendingMail: { subject: string; text: string; html: string }
  meetMail: { subject: string; text: string; html: string }
}): Promise<SuggestReport> {
  const report = baseReport(input.plan, input.dryRun, input.mailReady)
  // Dry run returns before any suggestion insert or nudge send.
  if (input.dryRun) return report

  if (input.plan.suggestions.length > 0) {
    await input.writeSuggestions(input.plan.suggestions)
    report.wrote = true
  }

  if (!input.mailReady) return report

  for (const nudge of input.plan.pendingNudges) {
    const claimed = await input.claimPending(nudge.introId)
    if (!claimed) continue
    const sent = await input.send(nudge, input.pendingMail)
    if (sent === 'sent') report.sent += 1
    else await input.releasePending(nudge.introId)
  }

  for (const nudge of input.plan.meetNudges) {
    const claimed = await input.claimMeet(nudge.introId, nudge.party)
    if (!claimed) continue
    const sent = await input.send(nudge, input.meetMail)
    if (sent === 'sent') report.sent += 1
    else await input.releaseMeet(nudge.introId, nudge.party)
  }

  return report
}

function rankedCandidates(
  member: PlanMember,
  members: readonly PlanMember[],
  blocked: ReadonlySet<string>,
  exclude: ReadonlySet<string>,
  week: { year: number; week: number },
  limit: number,
  rankStart: number,
): PlannedSuggestion[] {
  if (limit <= 0) return []
  const ranked = members
    .flatMap((other) => {
      if (!isTarget(other) || other.id === member.id || exclude.has(other.id)) return []
      if (blocked.has(pairKey(member.id, other.id))) return []
      const sectors = shared(member.sectorTags, other.sectorTags)
      const themes = shared(member.visionThemes, other.visionThemes)
      const region = sameRegion(member.region, other.region) ? other.region.trim() : ''
      const reason = suggestionReason({ sectors, themes, region })
      if (!reason || reason.includes('@')) return []
      const score = sectors.length * 3 + themes.length * 2 + (region ? 2 : 0)
      if (score <= 0) return []
      return [{ id: other.id, score, reason }]
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit)

  return ranked.map((item, index) => ({
    memberId: member.id,
    suggestedId: item.id,
    isoYear: week.year,
    isoWeek: week.week,
    rank: rankStart + index + 1,
    reason: item.reason,
  }))
}

function carryStillOpen(
  row: PriorSuggestion,
  member: PlanMember,
  byId: ReadonlyMap<string, PlanMember>,
  blocked: ReadonlySet<string>,
): boolean {
  if (row.suggestedId === member.id) return false
  if (!row.reason.trim() || row.reason.includes('@')) return false
  if (blocked.has(pairKey(member.id, row.suggestedId))) return false
  const target = byId.get(row.suggestedId)
  return Boolean(target && isTarget(target))
}

function pendingNudges(
  intros: readonly PlanIntro[],
  byId: ReadonlyMap<string, PlanMember>,
  now: Date,
): PlannedNudge[] {
  const due: PlannedNudge[] = []
  for (const intro of intros) {
    if (intro.status !== 'pending' || intro.pendingNudgeSent) continue
    if (ageMs(intro.requestedAt, now) < PENDING_NUDGE_MS) continue
    const requester = byId.get(intro.requesterId)
    const target = byId.get(intro.targetId)
    if (!requester || !target || !canNudge(requester) || !canNudge(target)) continue
    const email = target.email.trim()
    if (!email || email.includes(' ')) continue
    due.push({
      kind: 'pending',
      introId: intro.id,
      memberId: target.id,
      email,
      party: 'target',
    })
  }
  return due
}

function meetNudges(
  intros: readonly PlanIntro[],
  byId: ReadonlyMap<string, PlanMember>,
  now: Date,
): PlannedNudge[] {
  const due: PlannedNudge[] = []
  for (const intro of intros) {
    if (intro.status !== 'accepted' || !intro.decidedAt) continue
    if (ageMs(intro.decidedAt, now) < MEET_NUDGE_MS) continue
    const requester = byId.get(intro.requesterId)
    const target = byId.get(intro.targetId)
    if (!requester || !target || !canNudge(requester) || !canNudge(target)) continue
    if (!intro.meetRequesterSent) {
      const email = requester.email.trim()
      if (email && !email.includes(' ')) {
        due.push({ kind: 'meet', introId: intro.id, memberId: requester.id, email, party: 'requester' })
      }
    }
    if (!intro.meetTargetSent) {
      const email = target.email.trim()
      if (email && !email.includes(' ')) {
        due.push({ kind: 'meet', introId: intro.id, memberId: target.id, email, party: 'target' })
      }
    }
  }
  return due
}

function canNudge(member: PlanMember): boolean {
  return isRecipient(member)
}

function isRecipient(member: PlanMember): boolean {
  return ADMITTED_STATUS.has(member.status) && !member.isDemo && !member.sample && !isExampleMemberName(member.fullName)
}

function isTarget(member: PlanMember): boolean {
  return isRecipient(member) && TARGET_SEATS.has(member.seat) && !member.directoryHidden
}

function blockedPairs(intros: readonly PlanIntro[]): Set<string> {
  const pairs = new Set<string>()
  for (const intro of intros) {
    if (!intro.requesterId || !intro.targetId || intro.requesterId === intro.targetId) continue
    pairs.add(pairKey(intro.requesterId, intro.targetId))
  }
  return pairs
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`
}

function shared(left: readonly string[], right: readonly string[]): string[] {
  const wanted = new Set(right.map((item) => item.trim().toLowerCase()).filter(Boolean))
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of left) {
    const clean = item.trim()
    const key = clean.toLowerCase()
    if (!clean || !wanted.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(clean)
  }
  return out
}

function sameRegion(left: string, right: string): boolean {
  const a = left.trim().toLowerCase()
  const b = right.trim().toLowerCase()
  return a.length > 0 && a === b
}

function ageMs(iso: string, now: Date): number {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return -1
  return now.getTime() - at
}

function lowerFirst(value: string): string {
  const trimmed = value.trim()
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
}

function introsUrl(site: string): string {
  return `${site.replace(/\/$/, '')}/dashboard/people/intros`
}

function baseReport(plan: IntroWeekPlan, dryRun: boolean, mailReady: boolean): SuggestReport {
  return {
    ok: true,
    dry_run: dryRun,
    iso_year: plan.isoYear,
    iso_week: plan.isoWeek,
    members_refilled: plan.membersRefilled,
    carried: plan.carried,
    new: plan.added,
    suggestions: plan.suggestions.map((row) => ({
      member_id: row.memberId,
      suggested_id: row.suggestedId,
      rank: row.rank,
      reason: row.reason,
    })),
    pending_nudges: plan.pendingNudges.map((row) => ({
      intro_id: row.introId,
      target_id: row.memberId,
    })),
    meet_nudges: plan.meetNudges.map((row) => ({
      intro_id: row.introId,
      member_id: row.memberId,
    })),
    mail_ready: mailReady,
    wrote: false,
    sent: 0,
  }
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}

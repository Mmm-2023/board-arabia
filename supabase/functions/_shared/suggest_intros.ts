/** Weekly intro suggestions and once-only nudges. Pure planning. No secrets. */

import { boardMail } from './mail.ts'

export const INTROS_SCHEDULE_SECRET = 'INTROS_SCHEDULE_SECRET'
export const INTROS_SCHEDULE_HEADER = 'x-intros-schedule-secret'
export const SUGGESTIONS_PER_MEMBER = 3
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
  noop: boolean
  suggestions: PlannedSuggestion[]
  pendingNudges: PlannedNudge[]
  meetNudges: PlannedNudge[]
}

export type SuggestReport = {
  ok: true
  dry_run: boolean
  iso_year: number
  iso_week: number
  suggestions_noop: boolean
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
  weekAlreadyHasSuggestions: boolean
  members: readonly PlanMember[]
  intros: readonly PlanIntro[]
}): IntroWeekPlan {
  const week = isoWeekParts(input.now)
  const byId = new Map(input.members.map((member) => [member.id, member]))
  const blocked = blockedPairs(input.intros)
  const suggestions = input.weekAlreadyHasSuggestions
    ? []
    : input.members.flatMap((member) => suggestionsFor(member, input.members, blocked, week))
  return {
    isoYear: week.year,
    isoWeek: week.week,
    noop: input.weekAlreadyHasSuggestions,
    suggestions,
    pendingNudges: pendingNudges(input.intros, byId, input.now),
    meetNudges: meetNudges(input.intros, byId, input.now),
  }
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
  if (input.dryRun) return report

  if (!input.plan.noop && input.plan.suggestions.length > 0) {
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

function suggestionsFor(
  member: PlanMember,
  members: readonly PlanMember[],
  blocked: ReadonlySet<string>,
  week: { year: number; week: number },
): PlannedSuggestion[] {
  if (!isRecipient(member)) return []
  const ranked = members
    .flatMap((other) => {
      if (!isTarget(other) || other.id === member.id) return []
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
    .slice(0, SUGGESTIONS_PER_MEMBER)

  return ranked.map((item, index) => ({
    memberId: member.id,
    suggestedId: item.id,
    isoYear: week.year,
    isoWeek: week.week,
    rank: index + 1,
    reason: item.reason,
  }))
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
  return isRecipient(member) && TARGET_SEATS.has(member.seat)
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
    suggestions_noop: plan.noop,
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

/**
 * Same inclusion rules as marketing_funnel_counts, before the lt5 mask.
 * The database function is what staff call. This mirror is for the test that
 * two accepted legacy applications are approved through the date fallback.
 */
import { bucketCount, isPaidMedium, isTestEmail, type Bucket, type FunnelPayload } from './marketing.ts'

export type CandidateCount = {
  email: string
  createdAt: string
  emailVerifiedAt: string | null
  submittedAt: string | null
  approvedAt: string | null
  ftSource: string | null
  ftMedium: string | null
  demo: boolean
  staff: boolean
}

export type LegacyCount = {
  email: string
  createdAt: string
  status: string
  admittedAt: string | null
  memberCreatedAt: string | null
  decisionAt: string | null
  memberDemo: boolean
  ftSource: string | null
  ftMedium: string | null
  staff: boolean
}

export type StepCount = {
  email: string
  at: string
  step: string
  kind: 'checklist_step' | 'checklist_complete'
  ftMedium: string | null
  demo: boolean
  staff: boolean
}

type Raw = {
  form_sent: number
  email_verified: number
  legacy_applications: number
  checklist_complete: number
  full_requested: number
  candidate_approved: number
  legacy_approved: number
  approved: number
}

function inRange(value: string | null, from: string, to: string) {
  if (!value) return false
  return value >= from && value < to
}

function excluded(email: string, demo: boolean, staff: boolean) {
  return demo || staff || isTestEmail(email)
}

function channelOk(medium: string | null, channel: 'all' | 'paid' | 'organic') {
  const paid = isPaidMedium(medium)
  if (channel === 'paid') return paid
  if (channel === 'organic') return !paid
  return true
}

/** admitted_at, then a non-demo member created_at, then decision_at when accepted. */
export function legacyApprovedAt(row: LegacyCount) {
  if (row.admittedAt) return row.admittedAt
  if (!row.memberDemo && row.memberCreatedAt) return row.memberCreatedAt
  if (row.status === 'accepted') return row.decisionAt
  return null
}

export function rawFunnel(
  candidates: CandidateCount[],
  legacy: LegacyCount[],
  steps: StepCount[],
  from: string,
  to: string,
  channel: 'all' | 'paid' | 'organic' = 'all',
): Raw {
  const people = candidates.filter((row) => !excluded(row.email, row.demo, row.staff) && channelOk(row.ftMedium, channel))
  const apps = legacy.filter((row) => !excluded(row.email, row.memberDemo, row.staff) && channelOk(row.ftMedium, channel))
  const events = steps.filter((row) => !excluded(row.email, row.demo, row.staff) && channelOk(row.ftMedium, channel))
  const form_sent = people.filter((row) => inRange(row.createdAt, from, to)).length
  const email_verified = people.filter((row) => inRange(row.emailVerifiedAt, from, to)).length
  const legacy_applications = apps.filter((row) => inRange(row.createdAt, from, to)).length
  const checklist_complete = new Set(
    events.filter((row) => row.kind === 'checklist_complete' && inRange(row.at, from, to)).map((row) => row.email),
  ).size
  const full_requested = people.filter((row) => inRange(row.submittedAt, from, to)).length
  const candidate_approved = people.filter((row) => inRange(row.approvedAt, from, to)).length
  const legacy_approved = apps.filter((row) => inRange(legacyApprovedAt(row), from, to)).length
  return {
    form_sent,
    email_verified,
    legacy_applications,
    checklist_complete,
    full_requested,
    candidate_approved,
    legacy_approved,
    approved: candidate_approved + legacy_approved,
  }
}

export function maskedFunnel(raw: Raw): FunnelPayload['funnel'] {
  const mask = (n: number): Bucket => bucketCount(n)
  return {
    form_sent: mask(raw.form_sent),
    email_verified: mask(raw.email_verified),
    legacy_applications: mask(raw.legacy_applications),
    checklist_complete: mask(raw.checklist_complete),
    full_requested: mask(raw.full_requested),
    approved: mask(raw.approved),
    legacy_approved: mask(raw.legacy_approved),
  }
}

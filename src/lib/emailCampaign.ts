import { DIGEST_AUDIENCE_OPTIONS, digestAudienceLabel } from './digestAudience'

export const EMAIL_CATEGORIES = [
  { id: 'weekly_digest', label: 'Weekly email', kind: 'digest' },
  { id: 'news_invitations', label: 'News and invitations', kind: 'campaign' },
] as const

export type EmailCategoryId = (typeof EMAIL_CATEGORIES)[number]['id']
export type CampaignKind = 'digest' | 'campaign'
export type CampaignStatus = 'draft' | 'approved' | 'test_sent' | 'sending' | 'sent' | 'cancelled'

export const AUDIENCE_REASON_LABELS = [
  ['eligible', 'Eligible'],
  ['not_opted_in', 'Not opted in'],
  ['suppressed', 'Suppressed'],
  ['demo', 'Demo'],
  ['anonymised', 'Anonymised'],
  ['inactive', 'Inactive'],
  ['no_address', 'No address'],
  ['hidden', 'Hidden from the directory'],
] as const

export type AudienceCounts = Record<(typeof AUDIENCE_REASON_LABELS)[number][0], number>

export type ReleaseGate = {
  isOwner: boolean
  masterEnabled: boolean
  approved: boolean
  testSentByOwner: boolean
  versionMatches: boolean
  eligible: number
}

export type SendEvent = {
  status: string
  at: string
  isTest: boolean
  url?: string
}

export type SendLog = {
  queued: number
  skipped: number
  sent: number
  delivered: number
  bounced: number
  complained: number
  failed: number
  test: number
  events: SendEvent[]
}

export type CampaignDraft = {
  id: string | null
  kind: CampaignKind
  category: EmailCategoryId
  subject: string
  preheader: string
  bodyText: string
  tiers: string[]
  status: CampaignStatus | 'new'
  digestIssueId: string | null
}

export type CampaignSummary = CampaignDraft & {
  id: string
  audience: AudienceCounts
  release: ReleaseGate
  log: SendLog
}

export type EmailScreen = {
  masterEnabled: boolean
  isOwner: boolean
  campaigns: CampaignSummary[]
}

const emptyCounts = (): AudienceCounts => ({
  eligible: 0,
  not_opted_in: 0,
  suppressed: 0,
  demo: 0,
  anonymised: 0,
  inactive: 0,
  no_address: 0,
  hidden: 0,
})

export function emptyDraft(): CampaignDraft {
  return {
    id: null,
    kind: 'campaign',
    category: 'news_invitations',
    subject: '',
    preheader: '',
    bodyText: '',
    tiers: [],
    status: 'new',
    digestIssueId: null,
  }
}

export function digestDraft(issueId: string, tiers: string[]): CampaignDraft {
  return {
    id: null,
    kind: 'digest',
    category: 'weekly_digest',
    subject: 'This week',
    preheader: '',
    bodyText: 'The approved digest is included with this letter.',
    tiers,
    status: 'new',
    digestIssueId: issueId,
  }
}

function count(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

const address = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

function text(value: unknown, max = 8000): string {
  if (typeof value !== 'string') return ''
  if (address.test(value)) return ''
  return value.slice(0, max)
}

function countsFrom(value: unknown): AudienceCounts {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const counts = emptyCounts()
  for (const [key] of AUDIENCE_REASON_LABELS) counts[key] = count(row[key])
  return counts
}

function gateFrom(value: unknown, isOwner: boolean, masterEnabled: boolean): ReleaseGate {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    isOwner: row.is_owner === true && isOwner,
    masterEnabled: row.master_enabled === true && masterEnabled,
    approved: row.approved === true,
    testSentByOwner: row.test_sent === true,
    versionMatches: row.version_matches === true,
    eligible: count(row.eligible),
  }
}

function logFrom(value: unknown): SendLog {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const events = Array.isArray(row.events) ? row.events : []
  return {
    queued: count(row.queued),
    skipped: count(row.skipped),
    sent: count(row.sent),
    delivered: count(row.delivered),
    bounced: count(row.bounced),
    complained: count(row.complained),
    failed: count(row.failed),
    test: count(row.test),
    events: events.slice(0, 8).flatMap((event) => {
      if (!event || typeof event !== 'object') return []
      const item = event as Record<string, unknown>
      const status = text(item.status, 40)
      const at = text(item.at, 40)
      const url = text(item.url, 500)
      if (!status || !at) return []
      return [{
        status,
        at,
        isTest: item.is_test === true,
        url: url.startsWith('http://') || url.startsWith('https://') ? url : undefined,
      }]
    }),
  }
}

export function presentEmailScreen(value: unknown): EmailScreen | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const isOwner = row.is_owner === true
  const masterEnabled = row.master_enabled === true
  const campaigns = Array.isArray(row.campaigns) ? row.campaigns : []
  const parsed: CampaignSummary[] = []
  for (const item of campaigns) {
    if (!item || typeof item !== 'object') continue
    const campaign = item as Record<string, unknown>
    const id = text(campaign.id, 80)
    const kind = campaign.kind === 'digest' ? 'digest' : campaign.kind === 'campaign' ? 'campaign' : null
    const category = campaign.category === 'weekly_digest' || campaign.category === 'news_invitations' ? campaign.category : null
    const status = ['draft', 'approved', 'test_sent', 'sending', 'sent', 'cancelled'].includes(String(campaign.status))
      ? (campaign.status as CampaignStatus)
      : null
    if (!id || !kind || !category || !status) continue
    const tiers = Array.isArray(campaign.audience_tiers)
      ? campaign.audience_tiers.filter((tier): tier is string => typeof tier === 'string' && !tier.includes('@'))
      : []
    parsed.push({
      id,
      kind,
      category,
      subject: text(campaign.subject, 180),
      preheader: text(campaign.preheader, 180),
      bodyText: text(campaign.body_text),
      tiers,
      status,
      digestIssueId: typeof campaign.digest_issue_id === 'string' ? campaign.digest_issue_id : null,
      audience: countsFrom(campaign.audience),
      release: gateFrom(campaign.release, isOwner, masterEnabled),
      log: logFrom(campaign.log),
    })
  }
  return { masterEnabled, isOwner, campaigns: parsed }
}

export function releaseReady(gate: ReleaseGate): boolean {
  return (
    gate.isOwner &&
    gate.masterEnabled &&
    gate.approved &&
    gate.testSentByOwner &&
    gate.versionMatches &&
    gate.eligible > 0
  )
}

export function releaseBlockers(gate: ReleaseGate): string[] {
  const reasons: string[] = []
  if (!gate.isOwner) reasons.push('Only the owner can release.')
  if (!gate.masterEnabled) reasons.push('The master switch is off.')
  if (!gate.approved) reasons.push('Approve this letter before release.')
  if (!gate.testSentByOwner || !gate.versionMatches) {
    reasons.push('Release stays off until a test of this version has gone to the owner account.')
  }
  if (gate.eligible < 1) reasons.push('There are no eligible members.')
  return reasons
}

export function confirmMatches(typed: string, count: number): boolean {
  return typed.trim() === String(count)
}

export function testSendAllowed(status: CampaignDraft['status']): boolean {
  return status === 'approved' || status === 'test_sent'
}

export function categoryLabel(id: string): string {
  return EMAIL_CATEGORIES.find((item) => item.id === id)?.label ?? ''
}

export function statusLabel(status: string): string {
  if (status === 'draft') return 'Draft'
  if (status === 'approved') return 'Approved'
  if (status === 'test_sent') return 'Test sent'
  if (status === 'sending') return 'Sending'
  if (status === 'sent') return 'Sent'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'new') return 'New'
  return ''
}

export function tierChoices(): Array<{ id: string; label: string }> {
  return DIGEST_AUDIENCE_OPTIONS.map((id) => ({ id, label: digestAudienceLabel(id) }))
}

export const UNSUBSCRIBE_BUTTON = 'Unsubscribe'
export const UNSUBSCRIBE_DONE = 'You are unsubscribed. You can turn emails back on in Your privacy.'

import {
  DIGEST_PREVIEW_INTRO,
  formatDigestWhen,
  type DigestCopyEvent,
  type DigestCopyInput,
  type DigestCopyIntro,
  type DigestCopyMandate,
  type DigestCopyPerson,
} from '../../supabase/functions/_shared/weekly_digest_copy.ts'

const PHONE = /[0-9][0-9 ()+.-]{6,}[0-9]/

export type DigestNote = { text: string }

export type WeeklyDigestModel = DigestCopyInput & {
  mailReady: false
  notes: DigestNote[]
}

export type DigestIssueStatus = 'draft' | 'approved' | 'withdrawn'

export type DigestAuditRow = {
  action: 'created' | 'approved' | 'withdrawn' | 'edited'
  createdAt: string
}

export type DigestIssueModel = {
  sendEnabled: boolean
  mailReady: false
  status: DigestIssueStatus | null
  audience: string[]
  preview: WeeklyDigestModel
  log: DigestAuditRow[]
  source: 'issue' | 'live'
}

function clean(value: unknown, max = 200): string {
  if (typeof value !== 'string') return ''
  const text = value.replaceAll('@', '').replace(/\s+/g, ' ').trim().slice(0, max)
  if (PHONE.test(text)) return ''
  return text
}

function person(raw: unknown): DigestCopyPerson | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const fullName = clean(row.full_name ?? row.fullName, 200)
  if (!fullName) return null
  const id = typeof row.id === 'string' && /^[0-9a-fA-F-]{36}$/.test(row.id) ? row.id : ''
  return {
    fullName,
    headline: clean(row.headline, 160),
    company: clean(row.company, 200),
    ...(id ? { id } : {}),
  }
}

function mandate(raw: unknown): DigestCopyMandate | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const oneLiner = clean(row.one_liner ?? row.oneLiner, 280)
  const sector = clean(row.sector, 120)
  if (!oneLiner || !sector) return null
  const stage = clean(row.stage, 40)
  return {
    sector,
    dealType: clean(row.deal_type ?? row.dealType, 80),
    ticketBand: clean(row.ticket_band ?? row.ticketBand, 40),
    geography: clean(row.geography, 40),
    oneLiner,
    ...(stage ? { stage } : {}),
  }
}

function eventRow(raw: unknown): DigestCopyEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const title = clean(row.title, 160)
  if (!title) return null
  const starts = typeof row.starts_at === 'string' ? row.starts_at : typeof row.when === 'string' ? row.when : ''
  const when = starts.includes('T') || starts.endsWith('Z') ? formatDigestWhen(starts) : clean(starts, 40)
  return {
    title,
    when,
    region: clean(row.region, 80),
    hostName: clean(row.host_name ?? row.hostName, 200) || 'Board Arabia',
    venueAddress: clean(row.venue_address ?? row.venueAddress, 200) || null,
  }
}

function intro(raw: unknown, example = false): DigestCopyIntro | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const fullName = clean(row.full_name ?? row.fullName, 200)
  if (!fullName) return null
  return {
    fullName,
    headline: clean(row.headline, 160),
    company: clean(row.company, 200),
    reason: clean(row.reason, 200),
    example: example || row.example === true,
  }
}

function note(raw: unknown): DigestNote | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const text = clean((raw as Record<string, unknown>).text, 500)
  if (!text) return null
  return { text }
}

function list<T>(value: unknown, map: (row: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row) => {
    const next = map(row)
    return next ? [next] : []
  })
}

export function presentWeeklyDigest(raw: unknown): WeeklyDigestModel | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  return {
    mailReady: false,
    newMembers: list(row.new_members ?? row.newMembers, person),
    newMandates: list(row.new_mandates ?? row.newMandates, mandate),
    upcomingEvents: list(row.upcoming_events ?? row.upcomingEvents, eventRow),
    introductions: list(row.suggestions ?? row.introductions, intro),
    notes: list(row.notes, note),
  }
}

function statusOf(value: unknown): DigestIssueStatus | null {
  if (value === 'draft' || value === 'approved' || value === 'withdrawn') return value
  return null
}

function audit(value: unknown): DigestAuditRow[] {
  if (!Array.isArray(value)) return []
  const rows: DigestAuditRow[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    if (row.action !== 'created' && row.action !== 'approved' && row.action !== 'withdrawn' && row.action !== 'edited') continue
    if (typeof row.created_at !== 'string' && typeof row.createdAt !== 'string') continue
    rows.push({
      action: row.action,
      createdAt: typeof row.created_at === 'string' ? row.created_at : String(row.createdAt),
    })
  }
  return rows
}

function previewFromPayload(payload: unknown, sampleIntros: boolean): WeeklyDigestModel {
  const base = presentWeeklyDigest(payload) ?? emptyDigest()
  if (!sampleIntros) return base
  const raw = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {}
  const sample = list(raw.preview_intros, (row) => intro(row, true))
  return {
    ...base,
    introductions: sample.length > 0 ? sample : [DIGEST_PREVIEW_INTRO],
    notes: base.notes,
  }
}

export function presentDigestSources(raw: unknown): {
  members: WeeklyDigestModel['newMembers']
  mandates: WeeklyDigestModel['newMandates']
  events: WeeklyDigestModel['upcomingEvents']
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { members: [], mandates: [], events: [] }
  }
  const row = raw as Record<string, unknown>
  return {
    members: list(row.members, person),
    mandates: list(row.mandates, mandate),
    events: list(row.events, eventRow),
  }
}

export function emptyDigest(): WeeklyDigestModel {
  return {
    mailReady: false,
    newMembers: [],
    newMandates: [],
    upcomingEvents: [],
    introductions: [],
    notes: [],
  }
}

export function presentDigestIssue(raw: unknown): DigestIssueModel | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const issue = row.issue && typeof row.issue === 'object' && !Array.isArray(row.issue)
    ? (row.issue as Record<string, unknown>)
    : null
  const status = issue ? statusOf(issue.status) : null
  const payload = issue ? issue.payload : row.live
  return {
    sendEnabled: row.send_enabled === true,
    mailReady: false,
    status,
    source: issue ? 'issue' : 'live',
    audience: Array.isArray(issue?.audience) ? issue.audience.filter((item) => typeof item === 'string') : [],
    preview: previewFromPayload(payload, true),
    log: issue ? audit(issue.log) : [],
  }
}

export function digestIsEmpty(model: WeeklyDigestModel): boolean {
  return (
    model.newMembers.length === 0 &&
    model.newMandates.length === 0 &&
    model.upcomingEvents.length === 0 &&
    model.introductions.length === 0 &&
    (model.notes?.length ?? 0) === 0
  )
}

export function digestAuditLabel(action: DigestAuditRow['action']): string {
  if (action === 'created') return 'Prepared'
  if (action === 'approved') return 'Approved'
  if (action === 'edited') return 'Edited'
  return 'Withdrawn'
}

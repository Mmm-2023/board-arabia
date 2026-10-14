import {
  DIGEST_PREVIEW_INTRO,
  DIGEST_SECTION_ORDER,
  formatDigestWhen,
  type DigestCopyEvent,
  type DigestCopyInput,
  type DigestCopyIntro,
  type DigestCopyMandate,
  type DigestCopyPerson,
  type DigestDiaryItem,
  type DigestNamedPerson,
  type DigestNewsItem,
  type DigestPartnerInsight,
  type DigestSectionId,
  type DigestSourceLink,
} from '../../supabase/functions/_shared/weekly_digest_copy.ts'

const PHONE = /[0-9][0-9 ()+.-]{6,}[0-9]/
const HTTP_URL = /^https?:\/\/\S+$/i
const SECTION_IDS = new Set<string>(DIGEST_SECTION_ORDER.map((section) => section.id))

export const DIGEST_NEWS_MIN = 2
export const DIGEST_NEWS_MAX = 4
export const DIGEST_BULLET_MAX = 3
export const DIGEST_DIARY_MAX = 4
export const DIGEST_SENTENCE_MIN = 2
export const DIGEST_SENTENCE_MAX = 3

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
    ...(row.key === true ? { key: true } : {}),
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

export function digestHttpUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.trim().slice(0, 300)
  if (!HTTP_URL.test(text) || text.includes('@')) return ''
  return text
}

export function digestLinkedinUrl(value: unknown): string {
  const text = digestHttpUrl(value)
  if (!text.toLowerCase().startsWith('https://')) return ''
  try {
    const host = new URL(text).hostname.toLowerCase()
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return text
  } catch {
    return ''
  }
  return ''
}

function sourceLink(raw: unknown): DigestSourceLink | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const url = digestHttpUrl(row.url)
  if (!url) return null
  return { label: clean(row.label, 120) || 'Source', url }
}

function namedPerson(raw: unknown): DigestNamedPerson | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const name = clean(row.name, 200)
  if (!name) return null
  const stored = row.linkedin_url ?? row.linkedinUrl
  const linkedinUrl = typeof stored === 'string' && stored.trim() ? digestLinkedinUrl(stored) : ''
  return { name, linkedinUrl: linkedinUrl || null }
}

function sentences(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => clean(item, 280))
    .filter(Boolean)
    .slice(0, DIGEST_SENTENCE_MAX)
}

function newsItem(raw: unknown): DigestNewsItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const headline = clean(row.headline, 160)
  const body = sentences(row.sentences)
  const sources = list(row.sources, sourceLink).slice(0, 6)
  if (!headline || body.length < DIGEST_SENTENCE_MIN || sources.length === 0) return null
  return {
    headline,
    sentences: body,
    boardLens: clean(row.board_lens ?? row.boardLens, 280),
    sources,
    people: list(row.people, namedPerson).slice(0, 6),
  }
}

function diaryItem(raw: unknown): DigestDiaryItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const title = clean(row.title, 160)
  const when = clean(row.when, 40)
  const sources = list(row.sources, sourceLink).slice(0, 4)
  if (!title || !when || sources.length === 0) return null
  return { title, when, sources }
}

function partnerInsight(raw: unknown): DigestPartnerInsight | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const body = sentences(row.sentences)
  const source = sourceLink(row.source)
  if (body.length < DIGEST_SENTENCE_MIN || !source) return null
  return { label: 'Partner content', sentences: body, source }
}

function hiddenSections(raw: unknown): DigestSectionId[] {
  if (!Array.isArray(raw)) return []
  const ids: DigestSectionId[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || !SECTION_IDS.has(item)) continue
    const id = item as DigestSectionId
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

function wholeNumber(value: unknown, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  if (!Number.isInteger(parsed) || parsed < 1) return 0
  return Math.min(max, parsed)
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
    opening: clean(row.opening, 500),
    issueNumber: clean(row.issue_number ?? row.issueNumber, 20) || weekLabel(row.iso_week),
    issueDate: clean(row.issue_date ?? row.issueDate, 40),
    readMinutes: wholeNumber(row.read_minutes ?? row.readMinutes, 30),
    hiddenSections: hiddenSections(row.hidden_sections ?? row.hiddenSections),
    boardroom: list(row.boardroom, newsItem).slice(0, DIGEST_NEWS_MAX),
    deals: list(row.deals, newsItem).slice(0, DIGEST_NEWS_MAX),
    platformBullets: list(row.platform_bullets ?? row.platformBullets, bullet).slice(0, DIGEST_BULLET_MAX),
    featureTip: clean(row.feature_tip ?? row.featureTip, 280),
    keyMembers: list(row.key_members ?? row.keyMembers, person),
    diary: list(row.diary, diaryItem).slice(0, DIGEST_DIARY_MAX),
    partnerInsight: partnerInsight(row.partner_insight ?? row.partnerInsight),
  }
}

function weekLabel(value: unknown): string {
  const week = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  if (!Number.isInteger(week) || week < 1 || week > 53) return ''
  return String(week)
}

function bullet(raw: unknown): string | null {
  const text = clean(raw, 200)
  return text || null
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
    opening: '',
    issueNumber: '',
    issueDate: '',
    readMinutes: 0,
    hiddenSections: [],
    boardroom: [],
    deals: [],
    platformBullets: [],
    featureTip: '',
    keyMembers: [],
    diary: [],
    partnerInsight: null,
  }
}

export function digestHidden(model: WeeklyDigestModel, id: DigestSectionId): boolean {
  return (model.hiddenSections ?? []).includes(id)
}

export function digestSectionHasContent(model: WeeklyDigestModel, id: DigestSectionId): boolean {
  if (id === 'boardroom') return (model.boardroom ?? []).length > 0
  if (id === 'deals') return (model.deals ?? []).length > 0
  if (id === 'platform') {
    return (
      (model.platformBullets ?? []).length > 0 ||
      Boolean(model.featureTip) ||
      model.introductions.length > 0 ||
      (model.notes ?? []).length > 0
    )
  }
  if (id === 'database') {
    return model.newMandates.length > 0 || model.newMembers.length > 0 || (model.keyMembers ?? []).length > 0
  }
  if (id === 'majlis') return model.upcomingEvents.length > 0 || (model.diary ?? []).length > 0
  return Boolean(model.partnerInsight)
}

export function visibleDigestSections(model: WeeklyDigestModel): DigestSectionId[] {
  return DIGEST_SECTION_ORDER.map((section) => section.id).filter(
    (id) => !digestHidden(model, id) && digestSectionHasContent(model, id),
  )
}

export function digestReadMinutes(model: WeeklyDigestModel): number {
  if ((model.readMinutes ?? 0) >= 1) return Math.min(30, model.readMinutes ?? 1)
  const words = digestWords(model)
  if (words < 40) return 1
  return Math.max(1, Math.min(15, Math.round(words / 180)))
}

function digestWords(model: WeeklyDigestModel): number {
  const chunks = [
    model.opening ?? '',
    ...(model.boardroom ?? []).flatMap((item) => [item.headline, ...item.sentences, item.boardLens]),
    ...(model.deals ?? []).flatMap((item) => [item.headline, ...item.sentences, item.boardLens]),
    ...(model.platformBullets ?? []),
    model.featureTip ?? '',
    ...(model.notes ?? []).map((item) => item.text),
    ...model.newMandates.map((item) => item.oneLiner),
    ...(model.diary ?? []).map((item) => item.title),
    ...(model.partnerInsight?.sentences ?? []),
  ]
  return chunks.join(' ').split(/\s+/).filter(Boolean).length
}

export function validateDigestForSave(model: WeeklyDigestModel): string | null {
  for (const id of ['boardroom', 'deals'] as const) {
    const items = model[id] ?? []
    const hidden = digestHidden(model, id)
    if (!hidden && items.length > 0 && (items.length < DIGEST_NEWS_MIN || items.length > DIGEST_NEWS_MAX)) {
      return 'News sections need 2 to 4 items.'
    }
    if (items.length > DIGEST_NEWS_MAX) return 'News sections need 2 to 4 items.'
    for (const item of items) {
      if (!item.headline.trim()) return 'A news item needs a headline.'
      if (item.sentences.filter((sentence) => sentence.trim()).length < DIGEST_SENTENCE_MIN) {
        return 'A news item needs 2 to 3 sentences.'
      }
      if (item.sentences.length > DIGEST_SENTENCE_MAX) return 'A news item needs 2 to 3 sentences.'
      if (item.sources.length < 1) return 'A news item needs a source.'
      for (const source of item.sources) {
        if (!digestHttpUrl(source.url)) return 'Source links must use http or https.'
      }
      for (const personRow of item.people) {
        if (personRow.linkedinUrl && !digestLinkedinUrl(personRow.linkedinUrl)) {
          return 'LinkedIn links must use linkedin.com.'
        }
      }
    }
  }
  if ((model.platformBullets ?? []).length > DIGEST_BULLET_MAX) return 'Platform notes are limited to 3 lines.'
  if ((model.diary ?? []).length > DIGEST_DIARY_MAX) return 'The diary holds up to 4 dates.'
  for (const item of model.diary ?? []) {
    if (!item.when.trim() || item.sources.length < 1 || item.sources.some((source) => !digestHttpUrl(source.url))) {
      return 'A diary date needs a source.'
    }
  }
  const partner = model.partnerInsight
  if (partner) {
    const count = partner.sentences.filter((sentence) => sentence.trim()).length
    if (count < DIGEST_SENTENCE_MIN || count > DIGEST_SENTENCE_MAX || !digestHttpUrl(partner.source.url)) {
      return 'Partner content needs 2 to 3 sentences and one link.'
    }
  }
  return null
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
  return visibleDigestSections(model).length === 0
}

export function digestAuditLabel(action: DigestAuditRow['action']): string {
  if (action === 'created') return 'Prepared'
  if (action === 'approved') return 'Approved'
  if (action === 'edited') return 'Edited'
  return 'Withdrawn'
}

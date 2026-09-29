/**
 * Public-source pitch deck check. Pure helpers shared by Edge and the member page.
 * Citations are only pages actually retrieved. Unknown stays unknown.
 */

import { readStoredAnalysis, type DeckAnalysis } from './deck_analysis.ts'

export const DECK_BUCKET = 'due-diligence-decks'

/**
 * Supabase Edge wall clock is 400s. This budget stays under it with margin
 * and is shorter than a silent multi-minute hang. Heartbeats refresh updated_at
 * at each stage. Silence or age past this budget means the worker died or the run ran out of time.
 */
export const JOB_DEADLINE_MS = 180_000

export const DD_PROGRESS = {
  extract: 18,
  pages: 32,
  model: 46,
  repair: 58,
  fallback: 70,
  sources: 82,
  save: 92,
} as const
export const DECK_MAX_BYTES = 15 * 1024 * 1024
export const NOT_STATED = 'Not stated in the deck'

export const DUE_DILIGENCE_DISCLAIMER =
  'Public sources only. This is not legal advice and it is not formal due diligence. You decide what to do next.'

export const MEMBER_MESSAGES = {
  file: 'Use a PDF or PPTX under 15 MB.',
  notDeck: 'The uploaded file is not a PDF or PPTX.',
  unreadable: 'Could not read this deck. Upload a PDF with selectable text, or a PPTX.',
  scanned:
    'This deck looks like scanned images. Board Arabia cannot read text inside images. Upload a PDF with selectable text, or a PPTX.',
  rate: 'Too many checks today. Try again tomorrow.',
  inflight: 'A check is already running.',
  membersOnly: 'Only members can run a check.',
  start: 'Could not start the check.',
  finish: 'Could not finish the check. Try again later.',
  timedOut: 'This check took too long and stopped. Try again.',
  url: 'Company site must be a public https link.',
  upload: 'Could not upload the deck. Try again.',
  missing: 'That note is not in your history.',
  missingJob: 'That check is not in your history.',
  unauthorized: 'Unauthorized',
  authUnavailable: 'Could not confirm your sign-in. Try again in a moment.',
} as const

const SAFE_MESSAGES = new Set<string>(Object.values(MEMBER_MESSAGES))

const LEGACY_MESSAGES: Record<string, string> = {
  'Could not read this deck. Upload a text-based PDF or PPTX.': MEMBER_MESSAGES.unreadable,
}

export function memberFacingMessage(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback
  if (LEGACY_MESSAGES[raw]) return LEGACY_MESSAGES[raw]
  return SAFE_MESSAGES.has(raw) ? raw : fallback
}

export type ClaimKind = 'team' | 'traction' | 'market' | 'ip' | 'other'
export type ClaimVerdict =
  | 'publicly_consistent'
  | 'not_publicly_verifiable'
  | 'conflict_with_public_sources'
  | 'insufficient_public_data'
export type DeckExt = 'pdf' | 'pptx'

export type DeckClaim = {
  text: string
  kind: ClaimKind
}

export type DeckFacts = {
  company: string
  sector: string
  ask: string
  claims: DeckClaim[]
}

export type RetrievedPage = {
  title: string
  url: string
  text: string
}

export type SourceLink = {
  title: string
  url: string
  quote?: string
}

export type ReportClaim = {
  text: string
  kind: ClaimKind
  verdict: ClaimVerdict
  note: string
  sources: SourceLink[]
}

export type BuiltReport = {
  company_label: string
  sector_label: string
  ask_label: string
  disclaimer: string
  publicly_consistent_pct: number | null
  not_publicly_verifiable_pct: number | null
  claims: ReportClaim[]
  sources: SourceLink[]
  next_steps: string[]
  degraded_notes?: string[]
  analysis?: DeckAnalysis | null
  model_id?: string | null
  model_skip_reason?: string | null
}

export const VERDICT_LABEL: Record<ClaimVerdict, string> = {
  publicly_consistent: 'Publicly consistent',
  not_publicly_verifiable: 'Not publicly verifiable',
  conflict_with_public_sources: 'Conflict with public sources',
  insufficient_public_data: 'Insufficient public data',
}

/** Member-facing verdict. Stored codes stay stable so older notes still open. */
export const VERDICT_SHORT: Record<ClaimVerdict, string> = {
  publicly_consistent: 'Consistent',
  not_publicly_verifiable: 'Not verified',
  conflict_with_public_sources: 'Contradicted',
  insufficient_public_data: 'Not verified',
}

export const DEGRADED_NOTE_SEARCH = 'Independent web checks were not run for this report.'
export const DEGRADED_NOTE_SEARCH_FAILED = 'Independent web checks did not complete for this report.'
export const DEGRADED_NOTE_MODEL = 'The language model was not used for this report.'
export const DEGRADED_NOTE_MODEL_FAILED = 'The language model did not return a draft for this report.'
export const DEGRADED_NOTE_MODEL_FALLBACK = 'The first model did not finish, so this draft used the backup model.'
export const DEGRADED_NOTE_MODEL_PARTIAL = 'Some draft sections did not validate and are marked missing.'
export const INDEPENDENT_EVIDENCE_NOTE = 'The company website does not count as independent evidence.'

const VERDICT_NOTE: Record<ClaimVerdict, string> = {
  publicly_consistent: 'This wording appears on a public page retrieved for this check.',
  not_publicly_verifiable: 'Not found on the public pages retrieved for this check.',
  conflict_with_public_sources: 'A public page retrieved for this check states a different figure for this point.',
  insufficient_public_data: 'Public pages were too thin to compare this point.',
}

export type AreaScore = {
  area: string
  label: ClaimVerdict
  reason: string
}

export type FindingRow = {
  claim: string
  source: string
  finding: string
  status: ClaimVerdict
}

export type FindingSection = {
  number: number
  title: string
  narrative: string
  rows: FindingRow[]
}

export type PresentedReport = {
  assessed_line: string
  documents_reviewed: string
  overview: string
  areas: AreaScore[]
  findings: FindingSection[]
}

const AREA_SPECS: { title: string; kinds: ClaimKind[] | null }[] = [
  { title: 'Entity and company', kinds: null },
  { title: 'Team and founders', kinds: ['team'] },
  { title: 'Traction and partnerships', kinds: ['traction'] },
  { title: 'Market', kinds: ['market'] },
  { title: 'Offer and intellectual property', kinds: ['ip', 'other'] },
]

const KIND_ORDER: ClaimKind[] = ['team', 'traction', 'market', 'ip', 'other']

const STOP = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being',
  'between', 'both', 'but', 'can', 'company', 'could', 'does', 'each', 'from', 'have',
  'into', 'its', 'just', 'more', 'most', 'not', 'our', 'over', 'per', 'than', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'under', 'via', 'was', 'were', 'what', 'when', 'where', 'which', 'while', 'will',
  'with', 'would', 'you', 'your', 'across',
])

const SECTORS = [
  'logistics',
  'fintech',
  'health',
  'energy',
  'software',
  'climate',
  'education',
  'food',
  'industrial',
  'payments',
]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const VERDICT_LANGUAGE =
  /\b(valid|invalid|investable|approved|rejected|fraud|invest|pass)\b/i

export function containsVerdictLanguage(value: string): boolean {
  return VERDICT_LANGUAGE.test(value)
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function deckExtension(name: string): DeckExt | null {
  const lower = name.trim().toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.pptx')) return 'pptx'
  return null
}

export function deckStoragePath(userId: string, deckId: string, ext: DeckExt): string | null {
  if (!isUuid(userId) || !isUuid(deckId)) return null
  return `${userId.toLowerCase()}/${deckId.toLowerCase()}/source.${ext}`
}

export function sniffDeck(bytes: Uint8Array): DeckExt | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf'
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'pptx'
  }
  return null
}

export function safeFileName(name: string, ext: DeckExt): string {
  const cleaned = name
    .replace(/[/\\]/g, ' ')
    .replace(/\.\./g, ' ')
    .replace(/[^\w.\- ()]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
  if (!cleaned || containsVerdictLanguage(cleaned)) return ext === 'pdf' ? 'deck.pdf' : 'deck.pptx'
  return cleaned
}

const LIVE_JOB = ['queued', 'reading', 'checking', 'writing']

export function stageLabel(status: string, progress = 0): string {
  if (status === 'queued') return 'Queued'
  if (status === 'ready') return 'Ready'
  if (status === 'failed') return 'The check stopped'
  if (progress >= DD_PROGRESS.save) return 'Saving the draft'
  if (progress >= DD_PROGRESS.sources) return 'Checking public sources'
  if (progress >= DD_PROGRESS.fallback) return 'Trying the backup model'
  if (progress >= DD_PROGRESS.repair) return 'Repairing the draft'
  if (progress >= DD_PROGRESS.model) return 'Asking the model'
  if (progress >= DD_PROGRESS.pages) return 'Numbering the pages'
  if (progress >= DD_PROGRESS.extract || status === 'reading') return 'Reading the deck'
  if (status === 'writing') return 'Writing the note'
  return 'Working'
}

/** True when an in-flight job is past the deadline and should be marked failed. */
export function shouldFailStaleJob(input: {
  status: string
  updatedAt: string
  createdAt: string
  nowMs: number
}): boolean {
  if (!LIVE_JOB.includes(input.status)) return false
  const updated = Date.parse(input.updatedAt)
  const created = Date.parse(input.createdAt)
  if (!Number.isFinite(updated) || !Number.isFinite(created)) return true
  if (input.nowMs - updated >= JOB_DEADLINE_MS) return true
  return input.nowMs - created >= JOB_DEADLINE_MS
}

/** A model miss that should fail the job. A missing key still finishes as a degraded draft. */
export function isTerminalModelFailure(skipReason: string | null, modelRan: boolean): boolean {
  if (modelRan) return false
  if (!skipReason) return true
  return skipReason !== 'missing_api_key' && skipReason !== 'missing_model' && skipReason !== 'empty_deck'
}

export function parsePublicHttpsUrl(raw: string): { ok: true; url: URL } | { ok: false } {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 300) return { ok: false }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false }
  }
  if (url.protocol !== 'https:') return { ok: false }
  if (url.username || url.password) return { ok: false }
  if (url.port && url.port !== '443') return { ok: false }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host.length > 200 || !host.includes('.')) return { ok: false }
  if (!/^[a-z0-9.-]+$/.test(host)) return { ok: false }
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    host === 'metadata.google.internal'
  ) {
    return { ok: false }
  }
  if (isIpLiteral(host)) return { ok: false }
  return { ok: true, url }
}

export function isPublicIp(ip: string): boolean {
  const value = ip.trim().toLowerCase().split('%')[0] ?? ''
  if (!value) return false
  if (value.includes(':')) {
    if (value === '::1' || value === '::') return false
    if (value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return false
    if (value.startsWith('::ffff:')) return isPublicIp(value.slice('::ffff:'.length))
    return true
  }
  const parts = value.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const a = parts[0] ?? 0
  const b = parts[1] ?? 0
  const c = parts[2] ?? 0
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 192 && b === 0 && c === 2) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a >= 224) return false
  return true
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

export function textFromOfficeXml(xml: string): string {
  const pieces: string[] = []
  const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g
  for (const match of xml.matchAll(re)) {
    const text = decodeEntities(match[1] || '').trim()
    if (text) pieces.push(text)
  }
  return pieces.join(' ').replace(/\s+/g, ' ').trim()
}

export function normalizeDeckText(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code === 0xad) continue
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      out += ' '
      continue
    }
    out += char
  }
  return out
}

function hasDeckControlChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31)) return true
  }
  return false
}

export function extractDeckFacts(text: string, fileName = ''): DeckFacts {
  const source = normalizeDeckText(text).slice(0, 80_000)
  const company = companyFromDeck(source, fileName)
  const sector = titleCaseSector(
    labelFrom(source, 'sector') || labelFrom(source, 'industry') || sectorPhrase(source) || sectorKeyword(source),
  )
  const ask = aimFrom(source)
  return {
    company: scrubLabel(company, 80),
    sector: scrubLabel(sector, 60),
    ask: scrubLabel(ask, 180),
    claims: pickClaims(source),
  }
}

export function isClassificationStamp(value: string): boolean {
  const line = value
    .replace(/[|•*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!line || line.length > 80) return false
  return STAMP_LINE.test(line)
}

export function companyFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/\.(pdf|pptx)$/i, '')
  const drop = new Set([
    'seed', 'investment', 'invest', 'deck', 'pitch', 'investor', 'presentation', 'confidential',
    'draft', 'final', 'pdf', 'pptx', 'the', 'and', 'for', 'series', 'round', 'management', 'case', 'nda',
  ])
  const kept = base
    .split(/[-_\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && /[A-Za-z]/.test(part) && !drop.has(part.toLowerCase()) && !/^v\d+$/i.test(part))
  const first = kept[0]
  if (!first || isClassificationStamp(first)) return ''
  if (/^[A-Z0-9]{2,4}$/.test(first)) return first
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

export function isDegradedCompact(report: BuiltReport): boolean {
  const notes = report.degraded_notes ?? []
  if (notes.length === 0) return false
  return report.sources.length === 0 && report.claims.every((claim) => claim.sources.length === 0)
}

export function degradedBannerText(notes: readonly string[]): string {
  const clean = cleanDegradedNotes(notes)
  if (clean.length === 0) return ''
  const why = clean.length > 1 ? 'Those checks are not available for this run.' : 'That check is not available for this run.'
  return `${clean.join(' ')} ${why}`
}

const SKIP_URL_HOSTS = [
  'wikipedia.org',
  'wikimedia.org',
  'wikidata.org',
  'mediawiki.org',
  'google.com',
  'gstatic.com',
  'googleapis.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'youtu.be',
  't.co',
  'schema.org',
  'w3.org',
]

export function extractCompanyUrl(text: string): string | null {
  const seen = new Set<string>()
  const candidates: { url: string; depth: number }[] = []
  // Accept https://, http://, and bare www. hosts (common in letter-style decks).
  for (const match of text.matchAll(/(?:https?:\/\/|\bwww\.)[^\s<>"')\]]+/gi)) {
    let cleaned = (match[0] || '').replace(/[),.;]+$/g, '')
    if (/^www\./i.test(cleaned)) cleaned = `https://${cleaned}`
    else if (/^http:\/\//i.test(cleaned)) cleaned = `https://${cleaned.slice('http://'.length)}`
    const parsed = parsePublicHttpsUrl(cleaned)
    if (!parsed.ok) continue
    const host = parsed.url.hostname.toLowerCase()
    if (SKIP_URL_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) continue
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
      if (!/\/company\//i.test(parsed.url.pathname)) continue
    }
    if (/\.(pdf|png|jpe?g|gif|webp|zip|pptx?)$/i.test(parsed.url.pathname)) continue
    const url = `${parsed.url.origin}${parsed.url.pathname}`
    if (seen.has(url)) continue
    seen.add(url)
    const depth = parsed.url.pathname.split('/').filter(Boolean).length
    candidates.push({ url, depth })
  }
  candidates.sort((a, b) => a.depth - b.depth)
  return candidates[0]?.url ?? null
}

export function relatedCompanyUrls(companyUrl: string): string[] {
  const parsed = parsePublicHttpsUrl(companyUrl)
  if (!parsed.ok) return []
  const path = parsed.url.pathname.replace(/\/+$/, '')
  if (path) return []
  return ['/about', '/team'].map((suffix) => `${parsed.url.origin}${suffix}`)
}

export function wikiHitMatchesTerm(hitLabel: string, term: string): boolean {
  const hit = new Set(distinctiveTokens(hitLabel))
  const shared = distinctiveTokens(term).filter((token) => hit.has(token))
  return shared.length >= 2
}

const WEAK_HOST_TOKENS = new Set([
  'capital',
  'group',
  'holdings',
  'partners',
  'global',
  'ventures',
  'international',
  'services',
  'limited',
])

export function publicHitMatchesTerm(title: string, url: string, term: string): boolean {
  const parsed = parsePublicHttpsUrl(url)
  if (!parsed.ok) return false
  if (isReferenceHost(parsed.url.hostname)) return wikiHitMatchesTerm(title, term)
  if (wikiHitMatchesTerm(title, term)) return true
  const host = parsed.url.hostname.toLowerCase().replace(/^www\./, '')
  return distinctiveTokens(term).some(
    (token) => token.length >= 5 && !WEAK_HOST_TOKENS.has(token) && host.includes(token),
  )
}

export type ModelFactRead = {
  facts: DeckFacts | null
  claimsReturned: number
  claimsKept: number
}

export function readModelFacts(raw: unknown, deckText: string): ModelFactRead {
  if (!raw || typeof raw !== 'object') return { facts: null, claimsReturned: 0, claimsKept: 0 }
  const row = raw as Record<string, unknown>
  const company = scrubLabel(modelCompany(row.company, deckText), 80)
  const sector = scrubLabel(titleCaseSector(modelSector(row.sector, deckText)), 60)
  const ask = scrubLabel(modelAsk(row.ask, deckText), 180)
  if (!Array.isArray(row.claims)) return { facts: null, claimsReturned: 0, claimsKept: 0 }
  let claimsReturned = 0
  const claims: DeckClaim[] = []
  const seen = new Set<string>()
  const deck = comparableDeck(deckText)
  for (const item of row.claims) {
    if (!item || typeof item !== 'object') continue
    const claim = item as Record<string, unknown>
    if (typeof claim.text !== 'string') continue
    const text = scrubMemberPunctuation(normalizeDeckText(claim.text)).slice(0, 320)
    if (text.length < 8) continue
    claimsReturned += 1
    if (claims.length >= 8) continue
    if (text.length < 24 || text.length > 320) continue
    if (!claimGroundedInDeck(text, deck)) continue
    if (containsVerdictLanguage(text)) continue
    const kind = kindOf(text)
    if (!isClaim(text, kind)) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    claims.push({ text, kind })
  }
  if (claims.length === 0) return { facts: null, claimsReturned, claimsKept: 0 }
  return {
    facts: { company, sector, ask, claims },
    claimsReturned,
    claimsKept: claims.length,
  }
}

export function factsFromModelJson(raw: unknown, deckText: string): DeckFacts | null {
  return readModelFacts(raw, deckText).facts
}

export function mergeModelFacts(model: DeckFacts | null, heuristic: DeckFacts): DeckFacts {
  if (!model || model.claims.length === 0) return heuristic
  const company =
    model.company !== NOT_STATED && !isClassificationStamp(model.company) ? model.company : heuristic.company
  return {
    company,
    sector: model.sector !== NOT_STATED ? model.sector : heuristic.sector,
    ask: model.ask !== NOT_STATED ? model.ask : heuristic.ask,
    claims: model.claims,
  }
}

export function publicSearchTerms(facts: DeckFacts): string[] {
  const terms: string[] = []
  if (facts.company !== NOT_STATED) {
    const company = sanitizeSearchTerm(facts.company)
    if (company) terms.push(company)
    const alias = legalNameAlias(company)
    if (alias && alias.toLowerCase() !== company.toLowerCase() && distinctiveTokens(alias).length >= 2) {
      terms.push(alias)
    }
  }
  const team = facts.claims.find((claim) => claim.kind === 'team')
  const name = team?.text.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/)?.[1]
  if (name && !containsVerdictLanguage(name)) {
    terms.push(facts.company !== NOT_STATED ? `${name} ${sanitizeSearchTerm(facts.company)}` : name)
  }
  const unique: string[] = []
  const seen = new Set<string>()
  for (const term of terms) {
    const key = term.toLowerCase()
    if (!term || seen.has(key)) continue
    seen.add(key)
    unique.push(term)
  }
  return unique.slice(0, 4)
}

export function searchMatchTerm(term: string): string {
  return term.replace(/\s+site:\S+/gi, ' ').replace(/\s+/g, ' ').trim()
}

export function independentSearchTerms(facts: DeckFacts): string[] {
  const terms = [...publicSearchTerms(facts)]
  const legal = facts.company === NOT_STATED ? '' : sanitizeSearchTerm(facts.company).slice(0, 60)
  if (legal) {
    terms.push(`${legal} site:argaam.com`)
    terms.push(`${legal} site:saudiexchange.sa`)
    terms.push(`${legal} site:misa.gov.sa`)
  }
  const unique: string[] = []
  const seen = new Set<string>()
  for (const term of terms) {
    const key = term.toLowerCase()
    if (!term || seen.has(key)) continue
    seen.add(key)
    unique.push(term)
  }
  return unique.slice(0, 8)
}

export function isCompanyOwnedUrl(pageUrl: string, companyUrl: string | null | undefined): boolean {
  if (!companyUrl) return false
  const page = parsePublicHttpsUrl(pageUrl)
  const company = parsePublicHttpsUrl(companyUrl)
  if (!page.ok || !company.ok) return false
  const pageHost = page.url.hostname.toLowerCase().replace(/^www\./, '')
  const companyHost = company.url.hostname.toLowerCase().replace(/^www\./, '')
  if (!pageHost || !companyHost) return false
  return pageHost === companyHost || pageHost.endsWith(`.${companyHost}`)
}

export function isBlockedPublicSourceUrl(raw: string): boolean {
  const parsed = parsePublicHttpsUrl(raw)
  if (!parsed.ok) return true
  return /\/(login|signin|sign-in|log-in|auth|data-?room|dataroom|private)(?:\/|$)/i.test(parsed.url.pathname)
}

export function packReportDisclaimer(notes: readonly string[] | undefined): string {
  let packed = DUE_DILIGENCE_DISCLAIMER
  for (const note of cleanDegradedNotes(notes)) {
    const next = `${packed}\n${note}`
    if (next.length > 400) break
    packed = next
  }
  return packed
}

export function unpackReportDisclaimer(raw: string): { disclaimer: string; degraded_notes: string[] } {
  if (!raw.startsWith(DUE_DILIGENCE_DISCLAIMER)) return { disclaimer: raw, degraded_notes: [] }
  const rest = raw.slice(DUE_DILIGENCE_DISCLAIMER.length).replace(/^\n+/, '')
  if (!rest.trim()) return { disclaimer: DUE_DILIGENCE_DISCLAIMER, degraded_notes: [] }
  return {
    disclaimer: DUE_DILIGENCE_DISCLAIMER,
    degraded_notes: rest
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length >= 8),
  }
}

export function assessmentLog(input: {
  jobId: string
  modelRan: boolean
  modelSkipReason: string | null
  modelId?: string | null
  claimsReturned: number
  claimsKept: number
  sourcesFetched: number
  searchRan: boolean
  searchSkipReason: string | null
}): string {
  return JSON.stringify({
    event: 'dd_assessment',
    job_id: input.jobId,
    model_ran: input.modelRan,
    model_id: input.modelId ?? null,
    model_skip_reason: input.modelSkipReason,
    claims_returned: input.claimsReturned,
    claims_kept: input.claimsKept,
    sources_fetched: input.sourcesFetched,
    search_ran: input.searchRan,
    search_skip_reason: input.searchSkipReason,
  })
}

export function modelJobFields(input: { modelId: string | null; skipReason: string | null }): {
  model_id: string | null
  model_skip_reason: string | null
} {
  const modelId = (input.modelId || '').replace(/[^\w.-]+/g, '').slice(0, 80)
  const reason = (input.skipReason || '').replace(/[^\w:.-]+/g, '_').slice(0, 160)
  return {
    model_id: modelId || null,
    model_skip_reason: reason || null,
  }
}

export function buildReport(
  facts: DeckFacts,
  pages: RetrievedPage[],
  options?: { companyUrl?: string | null; degradedNotes?: readonly string[] },
): BuiltReport {
  const companyUrl = options?.companyUrl?.trim() ? options.companyUrl.trim() : null
  const usable = pages.filter(
    (page) => parsePublicHttpsUrl(page.url).ok && !isBlockedPublicSourceUrl(page.url) && page.text.trim().length >= 40,
  )
  const owned = usable.filter((page) => isCompanyOwnedUrl(page.url, companyUrl))
  const independent = usable.filter((page) => !isCompanyOwnedUrl(page.url, companyUrl))
  const claims = facts.claims.map((claim) => scoreClaim(claim, independent, owned))
  const percents = diligencePercents(claims)
  return {
    company_label: facts.company,
    sector_label: facts.sector,
    ask_label: facts.ask,
    disclaimer: DUE_DILIGENCE_DISCLAIMER,
    publicly_consistent_pct: percents.consistent,
    not_publicly_verifiable_pct: percents.notVerifiable,
    claims,
    sources: independent.map((page) => ({
      title: page.title.replace(/\s+/g, ' ').trim().slice(0, 120) || page.url,
      url: publicUrlWithoutQuery(page.url),
    })),
    next_steps: nextStepsFor(claims),
    degraded_notes: cleanDegradedNotes(options?.degradedNotes),
    analysis: null,
    model_id: null,
    model_skip_reason: null,
  }
}

export function presentReport(report: BuiltReport, fileName: string): PresentedReport {
  const documents = fileName.replace(/\s+/g, ' ').trim() || 'Pitch deck'
  const assessed =
    report.company_label === NOT_STATED
      ? 'Public-source check of claims in the pitch deck.'
      : `Public-source check of claims for ${report.company_label}.`
  const areas = AREA_SPECS.map((spec) => {
    if (!spec.kinds) return { area: spec.title, ...entityScore(report) }
    return { area: spec.title, ...rollupArea(report.claims.filter((claim) => spec.kinds?.includes(claim.kind))) }
  })
  const findings = areas.map((area, index) => {
    const spec = AREA_SPECS[index]
    const claims = spec?.kinds ? report.claims.filter((claim) => spec.kinds?.includes(claim.kind)) : []
    const rows: FindingRow[] =
      !spec?.kinds
        ? [
            {
              claim:
                report.company_label === NOT_STATED
                  ? 'The deck did not name a company.'
                  : `Company name: ${report.company_label}`,
              source: 'Pitch deck',
              finding: area.reason,
              status: area.label,
            },
          ]
        : claims.length > 0
          ? claims.map((claim) => ({
              claim: claim.text,
              source: 'Pitch deck',
              finding: claim.note,
              status: claim.verdict,
            }))
          : [
              {
                claim: 'No checkable point in this area.',
                source: 'Pitch deck',
                finding: area.reason,
                status: area.label,
              },
            ]
    return {
      number: index + 1,
      title: area.area,
      narrative: narrativeFor(area.area, area.label),
      rows,
    }
  })
  return {
    assessed_line: assessed,
    documents_reviewed: documents,
    overview: overviewText(report, documents),
    areas,
    findings,
  }
}

export function diligencePercents(claims: { verdict: ClaimVerdict }[]): {
  consistent: number | null
  notVerifiable: number | null
} {
  if (claims.length === 0) return { consistent: null, notVerifiable: null }
  const consistentCount = claims.filter((claim) => claim.verdict === 'publicly_consistent').length
  const consistent = Math.round((consistentCount / claims.length) * 100)
  return { consistent, notVerifiable: 100 - consistent }
}

export function readStoredReport(input: {
  company_label: unknown
  sector_label: unknown
  ask_label: unknown
  disclaimer: unknown
  publicly_consistent_pct: unknown
  not_publicly_verifiable_pct: unknown
  claims: unknown
  sources: unknown
  next_steps: unknown
  analysis?: unknown
  model_id?: unknown
  model_skip_reason?: unknown
}): BuiltReport | null {
  if (typeof input.company_label !== 'string' || typeof input.sector_label !== 'string') return null
  if (typeof input.ask_label !== 'string' || typeof input.disclaimer !== 'string') return null
  const claims = readClaims(input.claims)
  const sources = readSources(input.sources)
  const nextSteps = readSteps(input.next_steps)
  if (!claims || !sources || !nextSteps) return null
  const consistent = readPercent(input.publicly_consistent_pct)
  const notVerifiable = readPercent(input.not_publicly_verifiable_pct)
  if (consistent === undefined || notVerifiable === undefined) return null
  if ((consistent === null) !== (notVerifiable === null)) return null
  if (consistent !== null && notVerifiable !== null && consistent + notVerifiable !== 100) return null
  const unpacked = unpackReportDisclaimer(input.disclaimer)
  return {
    company_label: input.company_label,
    sector_label: input.sector_label,
    ask_label: input.ask_label,
    disclaimer: unpacked.disclaimer,
    publicly_consistent_pct: consistent,
    not_publicly_verifiable_pct: notVerifiable,
    claims,
    sources,
    next_steps: nextSteps,
    degraded_notes: unpacked.degraded_notes,
    analysis: readStoredAnalysis(input.analysis),
    model_id: typeof input.model_id === 'string' && input.model_id.trim() ? input.model_id.trim().slice(0, 80) : null,
    model_skip_reason:
      typeof input.model_skip_reason === 'string' && input.model_skip_reason.trim()
        ? input.model_skip_reason.trim().slice(0, 160)
        : null,
  }
}

function scoreClaim(claim: DeckClaim, pages: RetrievedPage[], owned: RetrievedPage[]): ReportClaim {
  for (const page of pages) {
    const quote = evidenceSentence(claim.text, page.text, 'support')
    if (!quote) continue
    return {
      ...claim,
      verdict: 'publicly_consistent',
      note: 'This point matches an independent public page retrieved for this check.',
      sources: [sourceWithQuote(page, quote)],
    }
  }
  for (const page of pages) {
    const quote = evidenceSentence(claim.text, page.text, 'conflict')
    if (!quote) continue
    return {
      ...claim,
      verdict: 'conflict_with_public_sources',
      note: VERDICT_NOTE.conflict_with_public_sources,
      sources: [sourceWithQuote(page, quote)],
    }
  }
  if (pages.length === 0 && owned.length > 0) {
    return {
      ...claim,
      verdict: 'not_publicly_verifiable',
      note: INDEPENDENT_EVIDENCE_NOTE,
      sources: [],
    }
  }
  if (pages.length === 0) {
    return {
      ...claim,
      verdict: 'insufficient_public_data',
      note: VERDICT_NOTE.insufficient_public_data,
      sources: [],
    }
  }
  return {
    ...claim,
    verdict: 'not_publicly_verifiable',
    note: 'Not found on the independent public pages retrieved for this check.',
    sources: [],
  }
}

function sourceFromPage(page: RetrievedPage): SourceLink {
  return {
    title: page.title.replace(/\s+/g, ' ').trim().slice(0, 120) || page.url,
    url: publicUrlWithoutQuery(page.url),
  }
}

function sourceWithQuote(page: RetrievedPage, quote: string): SourceLink {
  return { ...sourceFromPage(page), quote: clipQuote(quote) }
}

function evidenceSentence(claim: string, page: string, mode: 'support' | 'conflict'): string | null {
  const claimTokens = distinctiveTokens(claim)
  const figures = significantFigures(claim)
  const parts = page
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 12)
  const candidates = parts.length > 0 ? parts : [page.replace(/\s+/g, ' ').trim()].filter((part) => part.length >= 12)
  for (const sentence of candidates) {
    const sentenceTokens = new Set(distinctiveTokens(sentence))
    const hits = claimTokens.filter((token) => sentenceTokens.has(token))
    // Two shared tokens are enough. The old gate required three on claims with no figure.
    if (hits.length < 2) continue
    if (mode === 'support') {
      if (figures.length > 0 && !figures.some((figure) => figureInPage(figure, sentence))) continue
      return sentence
    }
    if (figures.length === 0) continue
    if (figures.some((figure) => figureInPage(figure, sentence))) continue
    const other = significantFigures(sentence)
    if (other.some((figure) => !figures.some((item) => item.digits === figure.digits && item.scale === figure.scale))) {
      return sentence
    }
  }
  return null
}

function entityScore(report: BuiltReport): { label: ClaimVerdict; reason: string } {
  if (report.company_label === NOT_STATED) {
    return { label: 'insufficient_public_data', reason: 'The deck did not name a company.' }
  }
  if (report.sources.length === 0) {
    return {
      label: 'insufficient_public_data',
      reason: 'No public page was retrieved to compare the company name.',
    }
  }
  const needle = report.company_label.toLowerCase()
  const compact = needle.replace(/[^a-z0-9]+/g, '')
  const tokens = distinctiveTokens(report.company_label).filter((token) => token.length >= 4)
  const hit = report.sources.some((source) => {
    const title = source.title.toLowerCase()
    let host = ''
    try {
      host = new URL(source.url).hostname.toLowerCase().replace(/^www\./, '')
    } catch {
      host = ''
    }
    const hay = `${title} ${host} ${source.url.toLowerCase()}`
    if (title.includes(needle) || host.includes(compact) || hay.includes(needle)) return true
    if (compact && host.replace(/[^a-z0-9]+/g, '').includes(compact)) return true
    const matched = tokens.filter((token) => title.includes(token) || host.includes(token))
    return matched.length >= Math.min(2, tokens.length)
  })
  if (hit) {
    return {
      label: 'publicly_consistent',
      reason: 'The company name appears on a public page retrieved for this check.',
    }
  }
  return {
    label: 'not_publicly_verifiable',
    reason: 'The company name was not found on the public pages retrieved for this check.',
  }
}

function rollupArea(claims: ReportClaim[]): { label: ClaimVerdict; reason: string } {
  if (claims.length === 0) {
    return {
      label: 'insufficient_public_data',
      reason: 'The deck did not state a checkable point in this area.',
    }
  }
  const conflict = claims.find((claim) => claim.verdict === 'conflict_with_public_sources')
  if (conflict) return { label: 'conflict_with_public_sources', reason: conflict.note }
  if (claims.every((claim) => claim.verdict === 'publicly_consistent')) {
    return { label: 'publicly_consistent', reason: VERDICT_NOTE.publicly_consistent }
  }
  if (claims.every((claim) => claim.verdict === 'insufficient_public_data')) {
    return { label: 'insufficient_public_data', reason: VERDICT_NOTE.insufficient_public_data }
  }
  return {
    label: 'not_publicly_verifiable',
    reason: 'Not found on the public pages retrieved for this check.',
  }
}

function narrativeFor(title: string, label: ClaimVerdict): string {
  if (label === 'publicly_consistent') return `${title} lines up with a public page retrieved for this check.`
  if (label === 'conflict_with_public_sources') {
    return `${title} includes a figure that a public page states differently.`
  }
  if (label === 'not_publicly_verifiable') {
    return `${title} includes points that were not found on the public pages retrieved for this check.`
  }
  return `${title} did not have enough public material to compare.`
}

function overviewText(report: BuiltReport, documents: string): string {
  const sector = report.sector_label === NOT_STATED ? '' : ` Sector in the deck: ${report.sector_label}.`
  const ask = report.ask_label === NOT_STATED ? '' : ` Ask in the deck: ${report.ask_label}.`
  if (report.publicly_consistent_pct === null || report.not_publicly_verifiable_pct === null) {
    return `This assessment reads ${documents} for ${report.company_label}.${sector}${ask} The deck did not state a checkable claim, so there is no percentage. Public sources only. You decide what to do next.`
  }
  return `This assessment reads ${documents} for ${report.company_label} and compares the claims with public pages.${sector}${ask} ${report.publicly_consistent_pct}% of the checkable claims were publicly consistent. ${report.not_publicly_verifiable_pct}% were not publicly verifiable. Where a public page states a different figure, the scorecard says conflict with public sources. This is not legal advice. You decide what to do next.`
}

function nextStepsFor(claims: ReportClaim[]): string[] {
  const steps: string[] = []
  if (claims.length === 0) steps.push(STEP_THIN)
  const gaps = claims.filter((claim) => claim.verdict !== 'publicly_consistent')
  const kinds = new Set(gaps.map((claim) => claim.kind))
  if (kinds.has('team')) steps.push(STEP_PEOPLE)
  if (kinds.has('market')) steps.push(STEP_MARKET)
  if (kinds.has('traction')) steps.push(STEP_TRACTION)
  if (kinds.has('ip')) steps.push(STEP_IP)
  if (kinds.has('other')) steps.push(STEP_OTHER)
  if (claims.length > 0 && gaps.length === 0) steps.push(STEP_INCOMPLETE)
  return [...steps.slice(0, 5), STEP_CLOSE]
}

const STEP_PEOPLE =
  'Name who is public. Which founders or directors already appear on a public company page, registry extract, or news item we can cite?'
const STEP_MARKET =
  'Cite the market figure. Which public source states the market size or growth figure used in the deck (URL or named report)?'
const STEP_TRACTION =
  'Show a public traction proof. Which customer, partner, or pilot is already named on a public page, press note, or filing?'
const STEP_IP =
  'Cite the public filing. Which public filing or page describes the intellectual property claim in the deck?'
const STEP_THIN =
  'The deck did not state a checkable claim. Share the market, traction, team, or IP points you want compared with public sources.'
const STEP_INCOMPLETE = 'Public pages can be incomplete. Ask management what is not on the public record.'
const STEP_OTHER =
  'Cite a public page for the point that was not verified or contradicted.'
const STEP_CLOSE =
  'This note is a public-source assist. It is not formal due diligence and it is not legal advice. You decide the next conversation.'

function pickClaims(text: string): DeckClaim[] {
  const seen = new Set<string>()
  const candidates: DeckClaim[] = []
  for (const sentence of sentences(text)) {
    if (containsVerdictLanguage(sentence) || isClassificationStamp(sentence)) continue
    const kind = kindOf(sentence)
    if (!isClaim(sentence, kind)) continue
    const key = sentence.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({ text: sentence, kind })
  }
  const picked: DeckClaim[] = []
  for (const kind of KIND_ORDER) {
    const hit = candidates.find((claim) => claim.kind === kind)
    if (hit) picked.push(hit)
  }
  for (const claim of candidates) {
    if (picked.length >= 8) break
    if (!picked.includes(claim)) picked.push(claim)
  }
  for (const extra of structuredClaims(text)) {
    if (picked.length >= 8) break
    if (picked.some((claim) => claim.text.toLowerCase() === extra.text.toLowerCase() || overlapsFact(claim, extra))) {
      continue
    }
    picked.push(extra)
  }
  return picked.slice(0, 8)
}

function structuredClaims(text: string): DeckClaim[] {
  const claims: DeckClaim[] = []
  const push = (raw: string, kind: ClaimKind) => {
    const value = scrubMemberPunctuation(raw)
    if (value.length < 24 || value.length > 320) return
    if (containsVerdictLanguage(value) || isClassificationStamp(value)) return
    if (claims.some((claim) => claim.text.toLowerCase() === value.toLowerCase())) return
    claims.push({ text: value, kind })
  }
  const money = '\\$?\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:million|billion|bn|m|k))?'
  for (const match of text.matchAll(new RegExp(`\\b(ARR|annual recurring revenue|revenue)\\b[^.\\n]{0,50}?(${money})`, 'gi'))) {
    const figure = (match[2] || '').replace(/\s+/g, ' ').trim()
    if (!/\d/.test(figure) || !/(?:\$|million|billion|\bm\b|\bbn\b|\bk\b)/i.test(figure)) continue
    const label = /^arr$/i.test(match[1] || '') ? 'ARR' : 'Revenue'
    push(`Reported ${label} in the deck is ${figure}.`, 'traction')
  }
  for (const match of text.matchAll(new RegExp(`\\b((?:pre|post)[\\s-]?money(?:\\s+valuation)?|valuation)\\b[^.\\n]{0,40}?(${money})`, 'gi'))) {
    const figure = (match[2] || '').replace(/\s+/g, ' ').trim()
    if (!/\d/.test(figure) || !/(?:\$|million|billion|\bm\b|\bbn\b|\bk\b)/i.test(figure)) continue
    const label = /post/i.test(match[1] || '') ? 'Post-money valuation' : 'Pre-money valuation'
    push(`${label} in the deck is ${figure}.`, 'other')
  }
  for (const match of text.matchAll(/\b(?:raising|raise|seeking)\b[^.\n]{0,48}?(\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:m|million|billion))?)/gi)) {
    const figure = (match[1] || '').replace(/\s+/g, ' ').trim()
    if (!figure) continue
    push(`The deck states a raise of ${figure}.`, 'other')
  }
  for (const match of text.matchAll(/\b(\d[\d,]*)\s+((?:enterprise|paying)\s+)?(customers|users|subscribers)\b/gi)) {
    const who = `${match[2] || ''}${match[3] || ''}`.replace(/\s+/g, ' ').trim()
    push(`The deck states ${match[1]} ${who}.`, 'traction')
  }
  for (const match of text.matchAll(/\b(?:grew|growing|growth(?:\s+of)?)\b[^.\n]{0,40}?(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)/gi)) {
    push(`Reported growth in the deck is ${match[1]}%.`, 'traction')
  }
  for (const match of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*(?:,|-)?\s*(co-?founder|founder|ceo|cto|cfo|coo)\b/gi)) {
    if (!/^[A-Z]/.test(match[1] || '')) continue
    push(`${match[1]} is named as ${match[2]} in the deck.`, 'team')
  }
  for (const match of text.matchAll(/\b(co-?founder|founder|ceo|cto|cfo|coo)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/gi)) {
    if (!/^[A-Z]/.test(match[2] || '')) continue
    push(`${match[2]} is named as ${match[1]} in the deck.`, 'team')
  }
  return claims
}

function overlapsFact(left: DeckClaim, right: DeckClaim): boolean {
  const leftFigures = significantFigures(left.text).map((figure) => `${figure.digits}:${figure.scale || ''}`)
  const rightFigures = significantFigures(right.text).map((figure) => `${figure.digits}:${figure.scale || ''}`)
  if (leftFigures.length > 0 && leftFigures.some((figure) => rightFigures.includes(figure))) return true
  const leftCount = left.text.match(/\b\d[\d,]*\b/)?.[0]
  const rightCount = right.text.match(/\b\d[\d,]*\b/)?.[0]
  if (
    leftCount &&
    leftCount === rightCount &&
    /customers|users|subscribers/i.test(left.text) &&
    /customers|users|subscribers/i.test(right.text)
  ) {
    return true
  }
  if (left.kind !== right.kind) return false
  const leftPercent = left.text.match(/\d{1,3}(?:\.\d+)?\s*(?:%|percent)/i)?.[0]?.replace(/\s+/g, '')
  const rightPercent = right.text.match(/\d{1,3}(?:\.\d+)?\s*(?:%|percent)/i)?.[0]?.replace(/\s+/g, '')
  if (leftPercent && leftPercent.toLowerCase() === rightPercent?.toLowerCase()) return true
  const name = left.text.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/)
  return Boolean(name && right.text.includes(name[0]) && left.kind === 'team')
}

function isClaim(sentence: string, kind: ClaimKind): boolean {
  if (looksLikeAddress(sentence) || looksLikePhone(sentence)) return false
  if (isTitleOnly(sentence)) return false
  if (hasDeckControlChar(sentence)) return false
  if (kind !== 'other') return true
  return significantFigures(sentence).length > 0 || /\b(raising|raise|seed round|series\s+[a-e])\b/i.test(sentence)
}

function kindOf(sentence: string): ClaimKind {
  if (/\b(patent|trademark|intellectual property)\b/i.test(sentence)) return 'ip'
  if (/\b(founder|co-founder|cofounder|ceo|cto)\b/i.test(sentence) || /\bdirector\b/i.test(sentence)) return 'team'
  if (/\b(revenue|customers?|users|arr|gmv)\b/i.test(sentence)) return 'traction'
  if (/\b(tam|billion|million)\b/i.test(sentence) || /\bmarket size\b/i.test(sentence)) return 'market'
  if (/\bmarket\b/i.test(sentence) && significantFigures(sentence).length > 0) return 'market'
  return 'other'
}

function sentences(text: string): string[] {
  return normalizeDeckText(text)
    .replace(/\r/g, '\n')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => scrubMemberPunctuation(part).replace(/^[*•-]+\s*/, ''))
    .filter((part) => part.length >= 24 && part.length <= 320)
}

function labelFrom(text: string, label: string): string {
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*([^\\n]{2,80})`, 'i'))
  return match?.[1]?.trim() || ''
}

const GENERIC_DECK_TITLE =
  /^(?:strategic\s+)?(?:partnership\s+)?proposal$|^confidential(?:\s+deck)?$|^presentation$|^overview$|^agenda$|^introduction$|^table of contents$/i

const STAMP_LINE =
  /^(?:strictly\s+)?(?:private(?:\s+and)?\s+)?confidential(?:\s+(?:information|management\s+case|deck))?$|^(?:strictly\s+)?private$|^management\s+case$|^confidential\s+management\s+case$|^draft(?:\s+deck)?$|^investor\s+presentation$|^pitch\s+deck$|^nda$|^for\s+discussion\s+only$|^not\s+for\s+distribution$|^internal\s+use\s+only$|^do\s+not\s+(?:distribute|copy|forward)$|^proprietary(?:\s+and\s+confidential)?$|^preliminary(?:\s+draft)?$|^commercially\s+sensitive$|^private\s+and\s+confidential$|^strictly\s+confidential$/i

const COVER_BOILER =
  /^(?:seed(?:\s+round)?|series\s+[a-e]|investment|overview|agenda|introduction|contents|thank you|appendix|team|market|product|traction|financials|the ask|ask)$/i

function titleCaseSector(value: string): string {
  const lower = value.trim().toLowerCase()
  const found = SECTORS.find((sector) => sector === lower)
  if (!found) return value.trim()
  return found.charAt(0).toUpperCase() + found.slice(1)
}

function sectorKeyword(text: string): string {
  const lines = text
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 40)
  for (const line of lines) {
    if (line.length > 32) continue
    const found = SECTORS.find((sector) => new RegExp(`^${sector}$`, 'i').test(line))
    if (found) return found.charAt(0).toUpperCase() + found.slice(1)
  }
  return ''
}

function companyFromDeck(text: string, fileName: string): string {
  const labeled = labelFrom(text, 'company')
  if (labeled && !isClassificationStamp(labeled)) return labeled
  const submitted = submittedByEntity(text)
  if (submitted && !isClassificationStamp(submitted)) return submitted
  const org = titleSlideOrgName(text)
  if (org) return org
  const brand = logoBrandText(text)
  if (brand) return brand
  const email = companyFromEmail(text)
  if (email) return email
  return companyFromFileName(fileName)
}

function coverLines(text: string): string[] {
  return normalizeDeckText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40)
}

function isSkippedCoverLine(line: string): boolean {
  if (line.length < 2 || line.length > 60) return true
  if (/[.!?]/.test(line)) return true
  if (/^https?:\/\//i.test(line)) return true
  if (/\d/.test(line)) return true
  if (isClassificationStamp(line) || GENERIC_DECK_TITLE.test(line) || COVER_BOILER.test(line)) return true
  if (SECTORS.some((sector) => sector.toLowerCase() === line.toLowerCase())) return true
  return false
}

function titleSlideOrgName(text: string): string {
  for (const line of coverLines(text)) {
    if (isSkippedCoverLine(line)) continue
    const words = line.split(/\s+/)
    const org = /\b(inc|llc|ltd|limited|plc|corp|corporation|gmbh|capital|group|holdings|labs|robotics|partners|consortium)\b/i.test(line)
    const titled = words.length >= 2 && words.every((word) => /^[A-Z0-9]/.test(word))
    if (org || titled) return line
  }
  return ''
}

function logoBrandText(text: string): string {
  for (const line of coverLines(text)) {
    if (isSkippedCoverLine(line)) continue
    const words = line.split(/\s+/)
    if (words.length > 3) continue
    if (!/^[A-Za-z0-9][A-Za-z0-9 .&'-]{1,40}$/.test(line)) continue
    return line
  }
  return ''
}

function companyFromEmail(text: string): string {
  const match = text.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i)
  if (!match?.[1]) return ''
  const host = match[1].toLowerCase().replace(/^www\./, '')
  const free = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'proton.me', 'protonmail.com']
  if (free.includes(host)) return ''
  const skip = new Set(['www', 'mail', 'email', 'info', 'hello', 'team', 'example', 'com', 'co', 'io', 'net', 'org', 'sa', 'uk'])
  const brand = host.split('.').find((part) => part.length >= 2 && !skip.has(part))
  if (!brand) return ''
  if (brand.length <= 4) return brand.toUpperCase()
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

function sectorPhrase(text: string): string {
  const match = text.match(/\b(?:sector|industry)\s+is\s+([A-Za-z][A-Za-z &-]{2,40})/i)
  if (!match?.[1]) return ''
  const value = match[1].trim().toLowerCase()
  return SECTORS.find((sector) => value.includes(sector)) || ''
}

function aimFrom(text: string): string {
  const labeled = labelFrom(text, 'aim') || labelFrom(text, 'ask')
  if (labeled && !isClassificationStamp(labeled) && labeled.length >= 8 && labeled.length <= 180) return labeled
  return askFrom(text)
}

function askFrom(text: string): string {
  const parts = normalizeDeckText(text)
    .replace(/\r/g, '\n')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => scrubMemberPunctuation(part).replace(/^[*•-]+\s*/, ''))
  const hit = parts.find((part) => isRaiseAsk(part))
  return hit || ''
}

function isRaiseAsk(part: string): boolean {
  if (part.length < 12 || part.length > 180) return false
  if (/\bseeking to establish\b/i.test(part)) return false
  const money = /\$\s?\d|\b\d[\d,]*(?:\.\d+)?\s*(million|billion)\b/i.test(part)
  const round = /\b(seed round|pre-seed|pre seed|series\s+[a-e])\b/i.test(part)
  const raising = /\b(raising|raise)\b/i.test(part)
  const seeking = /\bseeking\b/i.test(part)
  if (seeking && !money) return false
  if (seeking && money) return true
  if ((raising || round) && (money || round)) return true
  return false
}

function scrubLabel(value: string, max: number): string {
  const cleaned = scrubMemberPunctuation(value).slice(0, max)
  if (!cleaned || containsVerdictLanguage(cleaned)) return NOT_STATED
  return cleaned
}

function scrubMemberPunctuation(value: string): string {
  return value.replace(/\u2014/g, ', ').replace(/\u2013/g, '-').replace(/\s+/g, ' ').trim()
}

function looksLikeAddress(sentence: string): boolean {
  if (/\b(p\.?\s*o\.?\s*box|postal code|zip code)\b/i.test(sentence)) return true
  if (/\b(street|avenue|road|lane|floor|suite|building|block)\b/i.test(sentence) && /\d/.test(sentence)) {
    return true
  }
  if (
    /\b(islamabad|riyadh|jeddah|dubai|abu dhabi|karachi|lahore|doha|manama)\b/i.test(sentence) &&
    /\d/.test(sentence)
  ) {
    return true
  }
  return (
    /\b\d{1,5}-[A-Za-z]{3,}/.test(sentence) &&
    /\b(address|pakistan|saudi|arabia|emirates|qatar|kuwait|bahrain|oman)\b/i.test(sentence)
  )
}

function looksLikePhone(sentence: string): boolean {
  const digits = sentence.match(/\d/g) ?? []
  if (/\b(tel|telephone|phone|mobile|fax|whatsapp)\b/i.test(sentence) && digits.length >= 7) return true
  return /\+\d{1,3}(?:[\s.-]\d{2,4}){2,}/.test(sentence)
}

const CLAIM_VERB =
  /\b(is|are|was|were|has|have|had|does|serves|serve|served|led|leads|leading|raising|raises|raised|seeking|seeks|founded|operates|operating|provides|includes|owns|builds|built|offers|announced|reached|employs|acquired|sells|sold|launched|opens|opened)\b/i

function isTitleOnly(sentence: string): boolean {
  if (sentence.length > 40) return false
  if (significantFigures(sentence).length > 0) return false
  if (CLAIM_VERB.test(sentence)) return false
  return true
}

function comparableDeck(text: string): string {
  return normalizeDeckText(text).replace(/\u2014/g, ', ').replace(/\u2013/g, '-').replace(/\s+/g, ' ').trim().toLowerCase()
}

function cleanModelLabel(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const cleaned = scrubMemberPunctuation(normalizeDeckText(value)).slice(0, max)
  if (!cleaned || containsVerdictLanguage(cleaned)) return ''
  return cleaned
}

function modelCompany(value: unknown, deckText: string): string {
  const cleaned = cleanModelLabel(value, 80)
  if (cleaned && !isClassificationStamp(cleaned) && !GENERIC_DECK_TITLE.test(cleaned) && companyFromModelOk(cleaned, deckText)) return cleaned
  return submittedByEntity(deckText)
}

function modelSector(value: unknown, deckText: string): string {
  const cleaned = cleanModelLabel(value, 60)
  if (cleaned) return cleaned
  return labelFrom(deckText, 'sector') || labelFrom(deckText, 'industry') || sectorKeyword(deckText)
}

function modelAsk(value: unknown, deckText: string): string {
  const cleaned = cleanModelLabel(value, 180)
  if (cleaned && isRaiseAsk(cleaned)) return cleaned
  const submitted = labelFrom(deckText, 'ask')
  if (submitted && isRaiseAsk(submitted)) return submitted
  return askFrom(deckText)
}

function submittedByEntity(text: string): string {
  const match = text.match(/(?:^|\n)\s*submitted by\s*:\s*([^\n]{2,80})/i)
  const value = match?.[1]?.trim() || ''
  if (!value || containsVerdictLanguage(value) || GENERIC_DECK_TITLE.test(value)) return ''
  return value
}

function companyFromModelOk(company: string, deckText: string): boolean {
  const deck = comparableDeck(deckText)
  if (deck.includes(company.toLowerCase())) return true
  const tokens = distinctiveTokens(company).filter((token) => token.length >= 5 && !WEAK_HOST_TOKENS.has(token))
  if (tokens.length === 0) return false
  const deckTokens = new Set(distinctiveTokens(deck))
  return tokens.every((token) => deckTokens.has(token) || [...deckTokens].some((item) => tokensOverlap(token, item)))
}

function claimGroundedInDeck(claim: string, deckLower: string): boolean {
  const claimLower = claim.toLowerCase().replace(/\s+/g, ' ').trim()
  if (deckLower.includes(claimLower)) return true
  const claimTokens = distinctiveTokens(claim)
  if (claimTokens.length < 2) return false
  const deckTokens = new Set(distinctiveTokens(deckLower))
  const hits = claimTokens.filter(
    (token) => deckTokens.has(token) || [...deckTokens].some((item) => tokensOverlap(token, item)),
  )
  if (hits.length < 2) return false
  if (significantFigures(claim).some((figure) => !figureInPage(figure, deckLower))) return false
  return hits.length / claimTokens.length >= 0.5
}

function tokensOverlap(a: string, b: string): boolean {
  if (a === b) return true
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  return short.length >= 5 && long.startsWith(short)
}

function cleanDegradedNotes(notes: readonly string[] | undefined): string[] {
  const clean: string[] = []
  const seen = new Set<string>()
  for (const note of notes ?? []) {
    const value = note.replace(/\s+/g, ' ').trim()
    if (value.length < 8 || value.length > 220) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    clean.push(value)
    if (clean.length >= 3) break
  }
  return clean
}

function clipQuote(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 280) return cleaned
  return `${cleaned.slice(0, 277)}...`
}

function isReferenceHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return (
    host === 'wikipedia.org' ||
    host.endsWith('.wikipedia.org') ||
    host === 'wikidata.org' ||
    host.endsWith('.wikidata.org') ||
    host === 'wikimedia.org' ||
    host.endsWith('.wikimedia.org')
  )
}

function sanitizeSearchTerm(value: string): string {
  return value
    .replace(/[^\w\s.&'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function legalNameAlias(value: string): string {
  return value
    .replace(/\b(incorporated|inc|l\.l\.c|llc|ltd|limited|plc|gmbh|corp|corporation)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function distinctiveTokens(value: string): string[] {
  const tokens = value.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []
  const unique: string[] = []
  const seen = new Set<string>()
  for (const token of tokens) {
    if (STOP.has(token) || seen.has(token)) continue
    seen.add(token)
    unique.push(token)
  }
  return unique
}

type Figure = { digits: string; scale: string | null }

function significantFigures(value: string): Figure[] {
  const figures: Figure[] = []
  const re = /(\d[\d,]*(?:\.\d+)?)(?:\s*(million|billion))?/gi
  for (const match of value.matchAll(re)) {
    const digits = (match[1] || '').replace(/,/g, '')
    const scale = match[2]?.toLowerCase() ?? null
    // A bare calendar year is not a checkable figure.
    if (!scale && /^19\d{2}$|^20\d{2}$/.test(digits)) continue
    if (digits.length >= 3 || scale) figures.push({ digits, scale })
  }
  return figures
}

function figureInPage(figure: Figure, page: string): boolean {
  const hay = page.toLowerCase().replace(/,/g, '')
  if (!hay.includes(figure.digits)) return false
  if (figure.scale && !hay.includes(figure.scale)) return false
  return true
}

function publicUrlWithoutQuery(raw: string): string {
  const parsed = parsePublicHttpsUrl(raw)
  if (!parsed.ok) return raw
  return `${parsed.url.origin}${parsed.url.pathname}`
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
  return host.includes(':')
}

function readPercent(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) return undefined
  return value
}

function readClaims(value: unknown): ReportClaim[] | null {
  if (!Array.isArray(value) || value.length > 12) return null
  const claims: ReportClaim[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    if (typeof row.text !== 'string' || row.text.length < 8 || row.text.length > 400) return null
    const verdict = normalizeVerdict(row.verdict)
    if (!isKind(row.kind) || !verdict || typeof row.note !== 'string') return null
    const sources = readSources(row.sources)
    if (!sources) return null
    claims.push({
      text: row.text,
      kind: row.kind,
      verdict,
      note: row.note,
      sources,
    })
  }
  return claims
}

function readSources(value: unknown): SourceLink[] | null {
  if (!Array.isArray(value) || value.length > 8) return null
  const sources: SourceLink[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    if (typeof row.title !== 'string' || typeof row.url !== 'string') return null
    if (!row.title.trim() || parsePublicHttpsUrl(row.url).ok === false) return null
    const source: SourceLink = { title: row.title, url: row.url }
    if (typeof row.quote === 'string') {
      const quote = row.quote.replace(/\s+/g, ' ').trim()
      if (quote.length >= 8 && quote.length <= 400) source.quote = quote
    }
    sources.push(source)
  }
  return sources
}

function readSteps(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null
  const steps: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length < 8 || item.length > 400) return null
    steps.push(item)
  }
  return steps
}

function isKind(value: unknown): value is ClaimKind {
  return value === 'team' || value === 'traction' || value === 'market' || value === 'ip' || value === 'other'
}

function normalizeVerdict(value: unknown): ClaimVerdict | null {
  if (value === 'publicly_consistent') return 'publicly_consistent'
  if (value === 'not_publicly_verifiable' || value === 'not_found') return 'not_publicly_verifiable'
  if (value === 'conflict_with_public_sources') return 'conflict_with_public_sources'
  if (value === 'insufficient_public_data' || value === 'needs_follow_up') return 'insufficient_public_data'
  return null
}

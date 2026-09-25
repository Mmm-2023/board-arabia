/**
 * Public-source pitch deck check. Pure helpers shared by Edge and the member page.
 * Citations are only pages actually retrieved. Unknown stays unknown.
 */

export const DECK_BUCKET = 'due-diligence-decks'
export const DECK_MAX_BYTES = 15 * 1024 * 1024
export const NOT_STATED = 'Not stated in the deck'

export const DUE_DILIGENCE_DISCLAIMER =
  'Public sources only. This is not legal advice and it is not formal due diligence. You decide what to do next.'

export const MEMBER_MESSAGES = {
  file: 'Use a PDF or PPTX under 15 MB.',
  notDeck: 'The uploaded file is not a PDF or PPTX.',
  unreadable: 'Could not read this deck. Upload a text-based PDF or PPTX.',
  rate: 'Too many checks today. Try again tomorrow.',
  inflight: 'A check is already running.',
  membersOnly: 'Only members can run a check.',
  start: 'Could not start the check.',
  finish: 'Could not finish the check. Try again later.',
  url: 'Company site must be a public https link.',
  upload: 'Could not upload the deck. Try again.',
  missing: 'That note is not in your history.',
  missingJob: 'That check is not in your history.',
  unauthorized: 'Unauthorized',
} as const

const SAFE_MESSAGES = new Set<string>(Object.values(MEMBER_MESSAGES))

export function memberFacingMessage(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback
  return SAFE_MESSAGES.has(raw) ? raw : fallback
}

export type ClaimKind = 'team' | 'traction' | 'market' | 'ip' | 'other'
export type ClaimVerdict = 'publicly_consistent' | 'not_found' | 'needs_follow_up'
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
}

export const VERDICT_LABEL: Record<ClaimVerdict, string> = {
  publicly_consistent: 'Publicly consistent',
  not_found: 'Not found in public sources',
  needs_follow_up: 'Needs follow-up',
}

const VERDICT_NOTE: Record<ClaimVerdict, string> = {
  publicly_consistent: 'This wording appears in a public page retrieved for this check.',
  not_found: 'Not found in the public pages retrieved for this check.',
  needs_follow_up: 'Public pages were thin, so this needs follow-up.',
}

const FOLLOW_UP: Record<ClaimKind, string> = {
  team: 'Ask for a public registry filing or a public profile for the named people.',
  traction: 'Ask which customers or figures already appear on a public page or filing.',
  market: 'Ask which public source states the market figure.',
  ip: 'Ask for the public patent or trademark number.',
  other: 'Ask which public page supports this point.',
}

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

export function stageLabel(status: string): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'reading':
      return 'Reading the deck'
    case 'checking':
      return 'Checking public sources'
    case 'writing':
      return 'Writing the note'
    case 'ready':
      return 'Ready'
    case 'failed':
      return 'The check stopped'
    default:
      return 'Working'
  }
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

export function extractDeckFacts(text: string): DeckFacts {
  const source = text.replace(/\u0000/g, ' ').slice(0, 80_000)
  const company = labelFrom(source, 'company') || firstTitle(source)
  const sector = titleCaseSector(labelFrom(source, 'sector') || sectorKeyword(source))
  const ask = askFrom(source)
  return {
    company: scrubLabel(company, 80),
    sector: scrubLabel(sector, 60),
    ask: scrubLabel(ask, 180),
    claims: pickClaims(source),
  }
}

export function publicSearchTerms(facts: DeckFacts): string[] {
  const terms: string[] = []
  if (facts.company !== NOT_STATED) terms.push(facts.company)
  const team = facts.claims.find((claim) => claim.kind === 'team')
  const name = team?.text.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/)?.[1]
  if (name && !containsVerdictLanguage(name)) {
    terms.push(facts.company !== NOT_STATED ? `${name} ${facts.company}` : name)
  }
  return terms.slice(0, 2)
}

export function buildReport(facts: DeckFacts, pages: RetrievedPage[]): BuiltReport {
  const usable = pages.filter((page) => parsePublicHttpsUrl(page.url).ok && page.text.trim().length >= 40)
  const claims = facts.claims.map((claim) => scoreClaim(claim, usable))
  const percents = diligencePercents(claims)
  return {
    company_label: facts.company,
    sector_label: facts.sector,
    ask_label: facts.ask,
    disclaimer: DUE_DILIGENCE_DISCLAIMER,
    publicly_consistent_pct: percents.consistent,
    not_publicly_verifiable_pct: percents.notVerifiable,
    claims,
    sources: usable.map((page) => ({
      title: page.title.replace(/\s+/g, ' ').trim().slice(0, 120) || page.url,
      url: publicUrlWithoutQuery(page.url),
    })),
    next_steps: nextStepsFor(claims),
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
  return {
    company_label: input.company_label,
    sector_label: input.sector_label,
    ask_label: input.ask_label,
    disclaimer: input.disclaimer,
    publicly_consistent_pct: consistent,
    not_publicly_verifiable_pct: notVerifiable,
    claims,
    sources,
    next_steps: nextSteps,
  }
}

function scoreClaim(claim: DeckClaim, pages: RetrievedPage[]): ReportClaim {
  if (pages.length === 0) {
    return {
      ...claim,
      verdict: 'needs_follow_up',
      note: VERDICT_NOTE.needs_follow_up,
      sources: [],
    }
  }
  const matched = pages.filter((page) => pageSupportsClaim(claim.text, page.text))
  if (matched.length === 0) {
    return {
      ...claim,
      verdict: 'not_found',
      note: VERDICT_NOTE.not_found,
      sources: [],
    }
  }
  return {
    ...claim,
    verdict: 'publicly_consistent',
    note: VERDICT_NOTE.publicly_consistent,
    sources: matched.slice(0, 3).map((page) => ({
      title: page.title.replace(/\s+/g, ' ').trim().slice(0, 120) || page.url,
      url: publicUrlWithoutQuery(page.url),
    })),
  }
}

function pageSupportsClaim(claim: string, page: string): boolean {
  const claimTokens = distinctiveTokens(claim)
  const pageTokens = new Set(distinctiveTokens(page))
  const hits = claimTokens.filter((token) => pageTokens.has(token))
  const figures = significantFigures(claim)
  if (figures.length > 0 && !figures.some((figure) => figureInPage(figure, page))) return false
  if (figures.length > 0) return hits.length >= 2
  return hits.length >= 3
}

function nextStepsFor(claims: ReportClaim[]): string[] {
  if (claims.length === 0) {
    return [
      'The deck did not state a checkable claim. Share the market, traction, team, or IP points you want compared with public sources.',
      'This note is a public-source assist. You decide the next conversation.',
    ]
  }
  const steps: string[] = []
  if (claims.every((claim) => claim.verdict === 'publicly_consistent')) {
    steps.push('Public pages can be incomplete. Ask management what is not on the public record.')
  }
  for (const kind of KIND_ORDER) {
    if (claims.some((claim) => claim.kind === kind && claim.verdict !== 'publicly_consistent')) {
      steps.push(FOLLOW_UP[kind])
    }
  }
  steps.push('This note is a public-source assist. You decide the next conversation.')
  return steps.slice(0, 6)
}

function pickClaims(text: string): DeckClaim[] {
  const seen = new Set<string>()
  const candidates: DeckClaim[] = []
  for (const sentence of sentences(text)) {
    if (containsVerdictLanguage(sentence)) continue
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
  return picked.slice(0, 8)
}

function isClaim(sentence: string, kind: ClaimKind): boolean {
  if (kind !== 'other') return true
  return significantFigures(sentence).length > 0 || /\b(raising|raise|seeking|partnership)\b/i.test(sentence)
}

function kindOf(sentence: string): ClaimKind {
  if (/\b(patent|trademark|intellectual property)\b/i.test(sentence)) return 'ip'
  if (/\b(founder|co-founder|ceo|director|cto)\b/i.test(sentence)) return 'team'
  if (/\b(revenue|customer|customers|users|arr|gmv|partnership|growth)\b/i.test(sentence)) return 'traction'
  if (/\b(market|tam|sector)\b/i.test(sentence) || /\b(billion|million)\b/i.test(sentence)) return 'market'
  return 'other'
}

function sentences(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 24 && part.length <= 320)
}

function labelFrom(text: string, label: string): string {
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*([^\\n]{2,80})`, 'i'))
  return match?.[1]?.trim() || ''
}

function firstTitle(text: string): string {
  const line = text
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.length >= 2 && part.length <= 60 && !/[.!?]/.test(part) && !/\d/.test(part))
  return line || ''
}

function titleCaseSector(value: string): string {
  const lower = value.trim().toLowerCase()
  const found = SECTORS.find((sector) => sector === lower)
  if (!found) return value.trim()
  return found.charAt(0).toUpperCase() + found.slice(1)
}

function sectorKeyword(text: string): string {
  const lower = text.toLowerCase()
  const found = SECTORS.find((sector) => lower.includes(sector))
  if (!found) return ''
  return found.charAt(0).toUpperCase() + found.slice(1)
}

function askFrom(text: string): string {
  const parts = text
    .replace(/\r/g, '\n')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
  const hit = parts.find(
    (part) =>
      part.length >= 12 &&
      part.length <= 180 &&
      /\b(raising|raise|seeking|seed round|series)\b/i.test(part),
  )
  return hit || ''
}

function scrubLabel(value: string, max: number): string {
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, max)
  if (!cleaned || containsVerdictLanguage(cleaned)) return NOT_STATED
  return cleaned
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
    if (!isKind(row.kind) || !isVerdict(row.verdict) || typeof row.note !== 'string') return null
    const sources = readSources(row.sources)
    if (!sources) return null
    claims.push({
      text: row.text,
      kind: row.kind,
      verdict: row.verdict,
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
    sources.push({ title: row.title, url: row.url })
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

function isVerdict(value: unknown): value is ClaimVerdict {
  return value === 'publicly_consistent' || value === 'not_found' || value === 'needs_follow_up'
}

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
  unreadable: 'Could not read this deck. Upload a PDF with selectable text, or a PPTX.',
  scanned:
    'This deck looks like scanned images. Board Arabia cannot read text inside images. Upload a PDF with selectable text, or a PPTX.',
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
  not_publicly_verifiable: 'Not publicly verifiable',
  conflict_with_public_sources: 'Conflict with public sources',
  insufficient_public_data: 'Insufficient public data',
}

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

export function extractDeckFacts(text: string): DeckFacts {
  const source = normalizeDeckText(text).slice(0, 80_000)
  const company = labelFrom(source, 'company') || firstTitle(source)
  const sector = titleCaseSector(
    labelFrom(source, 'sector') || labelFrom(source, 'industry') || sectorKeyword(source),
  )
  const ask = askFrom(source)
  return {
    company: scrubLabel(company, 80),
    sector: scrubLabel(sector, 60),
    ask: scrubLabel(ask, 180),
    claims: pickClaims(source),
  }
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
  for (const match of text.matchAll(/https:\/\/[^\s<>"')\]]+/gi)) {
    const cleaned = (match[0] || '').replace(/[),.;]+$/g, '')
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

export function factsFromModelJson(raw: unknown, deckText: string): DeckFacts | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const deck = comparableDeck(deckText)
  const companyRaw = modelField(row.company, deck, 80)
  const company = companyRaw && !GENERIC_DECK_TITLE.test(companyRaw) ? companyRaw : ''
  const sectorRaw = modelField(row.sector, deck, 60)
  const sector = sectorRaw && sectorSupported(sectorRaw, deckText) ? sectorRaw : ''
  const askRaw = modelField(row.ask, deck, 180)
  const ask = askRaw && isRaiseAsk(askRaw) ? askRaw : ''
  if (!Array.isArray(row.claims)) return null
  const claims: DeckClaim[] = []
  const seen = new Set<string>()
  for (const item of row.claims) {
    if (claims.length >= 8) break
    if (!item || typeof item !== 'object') continue
    const claim = item as Record<string, unknown>
    if (typeof claim.text !== 'string') continue
    const text = scrubMemberPunctuation(normalizeDeckText(claim.text)).slice(0, 320)
    if (text.length < 24 || text.length > 320) continue
    if (!deck.includes(text.toLowerCase())) continue
    if (containsVerdictLanguage(text)) continue
    const kind = kindOf(text)
    if (!isClaim(text, kind)) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    claims.push({ text, kind })
  }
  if (claims.length === 0) return null
  return {
    company: scrubLabel(company, 80),
    sector: scrubLabel(titleCaseSector(sector), 60),
    ask: scrubLabel(ask, 180),
    claims,
  }
}

export function mergeModelFacts(model: DeckFacts | null, heuristic: DeckFacts): DeckFacts {
  if (!model || model.claims.length === 0) return heuristic
  return {
    company: model.company !== NOT_STATED ? model.company : heuristic.company,
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

export function buildReport(
  facts: DeckFacts,
  pages: RetrievedPage[],
  options?: { companyUrl?: string | null },
): BuiltReport {
  const usable = pages.filter((page) => parsePublicHttpsUrl(page.url).ok && page.text.trim().length >= 40)
  const claims = facts.claims.map((claim) => scoreClaim(claim, usable))
  const companyUrl = options?.companyUrl?.trim() ? options.companyUrl.trim() : null
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
    next_steps: nextStepsFor(claims, { companyUrl, sourceCount: usable.length }),
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
      verdict: 'insufficient_public_data',
      note: VERDICT_NOTE.insufficient_public_data,
      sources: [],
    }
  }
  const matched = pages.filter((page) => pageSupportsClaim(claim.text, page.text))
  if (matched.length > 0) {
    return {
      ...claim,
      verdict: 'publicly_consistent',
      note: VERDICT_NOTE.publicly_consistent,
      sources: matched.slice(0, 3).map(sourceFromPage),
    }
  }
  const conflict = pages.find((page) => pageConflicts(claim.text, page.text))
  if (conflict) {
    return {
      ...claim,
      verdict: 'conflict_with_public_sources',
      note: VERDICT_NOTE.conflict_with_public_sources,
      sources: [sourceFromPage(conflict)],
    }
  }
  return {
    ...claim,
    verdict: 'not_publicly_verifiable',
    note: VERDICT_NOTE.not_publicly_verifiable,
    sources: [],
  }
}

function sourceFromPage(page: RetrievedPage): SourceLink {
  return {
    title: page.title.replace(/\s+/g, ' ').trim().slice(0, 120) || page.url,
    url: publicUrlWithoutQuery(page.url),
  }
}

function pageConflicts(claim: string, page: string): boolean {
  const figures = significantFigures(claim)
  if (figures.length === 0) return false
  const claimTokens = distinctiveTokens(claim)
  const sentences = page.split(/\n+|(?<=[.!?])\s+/)
  for (const sentence of sentences) {
    const sentenceTokens = new Set(distinctiveTokens(sentence))
    const hits = claimTokens.filter((token) => sentenceTokens.has(token))
    if (hits.length < 3) continue
    if (figures.some((figure) => figureInPage(figure, sentence))) continue
    const other = significantFigures(sentence)
    if (other.some((figure) => !figures.some((item) => item.digits === figure.digits && item.scale === figure.scale))) {
      return true
    }
  }
  return false
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
  const hit = report.sources.some((source) => source.title.toLowerCase().includes(needle))
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

function pageSupportsClaim(claim: string, page: string): boolean {
  const claimTokens = distinctiveTokens(claim)
  const pageTokens = new Set(distinctiveTokens(page))
  const hits = claimTokens.filter((token) => pageTokens.has(token))
  const figures = significantFigures(claim)
  if (figures.length > 0 && !figures.some((figure) => figureInPage(figure, page))) return false
  if (figures.length > 0) return hits.length >= 2
  return hits.length >= 3
}

const STEP_LEGAL =
  'Confirm the legal name. Which exact legal name and jurisdiction should we search on public registers, and which public page or filing already shows it?'
const STEP_HOME =
  "Point to a public homepage. Which https page is the company's public home (or LinkedIn Company page), and can you open it without a login?"
const STEP_PEOPLE =
  'Name who is public. Which founders or directors already appear on a public company page, registry extract, or news item we can cite?'
const STEP_MARKET =
  'Cite the market figure. Which public source states the market size or growth figure used in the deck (URL or named report)?'
const STEP_TRACTION =
  'Show a public traction proof. Which customer, partner, or pilot is already named on a public page, press note, or filing?'
const STEP_IP =
  'Cite the public filing. Which public filing or page describes the IP or product claim in the deck?'
const STEP_THIN =
  'The deck did not state a checkable claim. Share the market, traction, team, or IP points you want compared with public sources.'
const STEP_INCOMPLETE = 'Public pages can be incomplete. Ask management what is not on the public record.'
const STEP_CLOSE =
  'This note is a public-source assist. It is not formal due diligence and it is not legal advice. You decide the next conversation.'

function nextStepsFor(
  claims: ReportClaim[],
  ctx: { companyUrl: string | null; sourceCount: number },
): string[] {
  const steps: string[] = []
  const consistent = (kind: ClaimKind) =>
    claims.some((claim) => claim.kind === kind && claim.verdict === 'publicly_consistent')
  const weak = (kind: ClaimKind) =>
    claims.some((claim) => claim.kind === kind && claim.verdict !== 'publicly_consistent')
  const identityWeak = !ctx.companyUrl || ctx.sourceCount === 0
  if (claims.length === 0) steps.push(STEP_THIN)
  if (identityWeak) {
    steps.push(STEP_LEGAL)
    steps.push(STEP_HOME)
  }
  if (
    claims.length > 0 &&
    ctx.sourceCount > 0 &&
    !identityWeak &&
    claims.every((claim) => claim.verdict === 'publicly_consistent')
  ) {
    steps.push(STEP_INCOMPLETE)
  }
  if (weak('team') || (identityWeak && !consistent('team'))) steps.push(STEP_PEOPLE)
  if (weak('market') || (identityWeak && !consistent('market'))) steps.push(STEP_MARKET)
  if (weak('traction') || (identityWeak && !consistent('traction'))) steps.push(STEP_TRACTION)
  if (weak('ip')) steps.push(STEP_IP)
  return [...steps.slice(0, 5), STEP_CLOSE]
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

function firstTitle(text: string): string {
  const line = text
    .split('\n')
    .map((part) => part.trim())
    .find(
      (part) =>
        part.length >= 2 &&
        part.length <= 60 &&
        !/[.!?]/.test(part) &&
        !/\d/.test(part) &&
        !/^https?:\/\//i.test(part) &&
        !GENERIC_DECK_TITLE.test(part),
    )
  return line || ''
}

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

function modelField(value: unknown, deckLower: string, max: number): string {
  if (typeof value !== 'string') return ''
  const cleaned = scrubMemberPunctuation(normalizeDeckText(value)).slice(0, max)
  if (!cleaned || containsVerdictLanguage(cleaned)) return ''
  if (!deckLower.includes(cleaned.toLowerCase())) return ''
  return cleaned
}

function sectorSupported(sector: string, deckText: string): boolean {
  const lower = sector.trim().toLowerCase()
  if (!lower) return false
  if (labelFrom(deckText, 'sector').toLowerCase().includes(lower)) return true
  if (labelFrom(deckText, 'industry').toLowerCase().includes(lower)) return true
  return sectorKeyword(normalizeDeckText(deckText)).toLowerCase() === lower
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

function normalizeVerdict(value: unknown): ClaimVerdict | null {
  if (value === 'publicly_consistent') return 'publicly_consistent'
  if (value === 'not_publicly_verifiable' || value === 'not_found') return 'not_publicly_verifiable'
  if (value === 'conflict_with_public_sources') return 'conflict_with_public_sources'
  if (value === 'insufficient_public_data' || value === 'needs_follow_up') return 'insufficient_public_data'
  return null
}

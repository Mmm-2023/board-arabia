/**
 * Deck-only investment memo. Draft JSON, never a certified check.
 * Figures stay deck-stated, recomputed, or unknown. No sector-specific examples.
 */

export const ANALYSIS_DISCLAIMER =
  'Document review only. Illustrative. Not investment advice, not an audit, and not a substitute for legal, financial, or regulatory diligence.'

export const NOT_A_RECOMMENDATION = 'This is not a recommendation.'

export const ANALYSIS_MAX_JSON_CHARS = 60_000

export const POSTURES = ['pass', 'evidence_required', 'discuss_with_milestones'] as const
export const STAGES = ['pre_revenue', 'pilot', 'revenue'] as const
export const CLAIM_STATUSES = ['supported_in_deck', 'contradicted', 'unverified'] as const
export const MATH_RESULTS = ['ties', 'breaks', 'cannot_test'] as const
export const SEVERITIES = ['high', 'medium', 'low'] as const
export const YEAR1_VS = ['below', 'at', 'above', 'unknown'] as const

export const SCORE_KEYS = [
  'story_clarity',
  'unit_economics',
  'model_integrity',
  'traction_evidence',
  'team_and_governance',
  'regulatory_and_operations',
  'market_and_competition',
  'use_of_funds',
  'valuation_fit',
  'overall',
] as const

export type Posture = (typeof POSTURES)[number]
export type Stage = (typeof STAGES)[number]
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]
export type MathResult = (typeof MATH_RESULTS)[number]
export type Severity = (typeof SEVERITIES)[number]
export type Year1Vs = (typeof YEAR1_VS)[number]
export type ScoreKey = (typeof SCORE_KEYS)[number]

export type RoundFacts = {
  amount: number | null
  equity_pct: number | null
  pre_money: number | null
  post_money: number | null
  currency: string
}

export type AnalysisClaim = {
  claim: string
  page: string
  status: ClaimStatus
  note: string
}

export type MathCheck = {
  name: string
  formula: string
  deck_value: string
  recomputed: string
  result: MathResult
}

export type UnitEconomics = {
  unit: string
  price: string
  full_cost: string
  break_even_volume: string
  year1_volume_assumption: string
  year1_vs_breakeven: Year1Vs | ''
  comment: string
}

export type AnalysisRisk = {
  title: string
  severity: Severity
  why: string
  evidence_that_would_retire_it: string
}

export type Tranche = {
  name: string
  release_when: string
}

export type DeckHero = {
  company: string
  one_liner: string
  posture: Posture | ''
  overall: number | null
  pre_money: number | null
  post_money: number | null
  currency: string
}

export type DeckAnalysis = {
  hero: DeckHero
  meta: {
    company: string
    document: string
    as_of: string
    review_type: 'deck_only'
    disclaimer: string
  }
  snapshot: {
    one_liner: string
    round: RoundFacts
    stage: Stage | ''
    posture: Posture | ''
    posture_reason: string
  }
  scores: Record<ScoreKey, number | null>
  claims: AnalysisClaim[]
  math_checks: MathCheck[]
  unit_economics: UnitEconomics | null
  risks: AnalysisRisk[]
  missing: string[]
  questions_for_management: string[]
  suggested_structure: { comment: string; tranches: Tranche[] } | null
  memo_markdown: string
  sections_missing: string[]
}

export const SCORE_LABEL: Record<ScoreKey, string> = {
  story_clarity: 'Story',
  unit_economics: 'Unit economics',
  model_integrity: 'Model integrity',
  traction_evidence: 'Traction',
  team_and_governance: 'Team and governance',
  regulatory_and_operations: 'Regulatory and operations',
  market_and_competition: 'Market and competition',
  use_of_funds: 'Use of funds',
  valuation_fit: 'Valuation fit',
  overall: 'Overall',
}

export const POSTURE_LABEL: Record<Posture, string> = {
  pass: 'Pass',
  evidence_required: 'Evidence required',
  discuss_with_milestones: 'Discuss with milestones',
}

export const SECTION_LABEL: Record<string, string> = {
  meta: 'Company facts',
  snapshot: 'Snapshot',
  posture: 'Posture',
  scores: 'Scores',
  claims: 'Claims',
  math_checks: 'Math checks',
  unit_economics: 'Unit economics',
  risks: 'Risks',
  missing: 'Missing sections',
  questions_for_management: 'Questions',
  suggested_structure: 'Structure',
  memo_markdown: 'Memo',
  hero: 'Hero',
}

const SCORE_KEY_SET = new Set<string>(SCORE_KEYS)

/** Labels for the partial banner. Score names come from the same values the bars render. */
export function missingBannerLabels(analysis: DeckAnalysis): string[] {
  const labels: string[] = []
  for (const key of SCORE_KEYS) {
    if (key === 'overall') continue
    if (analysis.scores[key] == null) labels.push(SCORE_LABEL[key])
  }
  for (const key of analysis.sections_missing) {
    if (key === 'scores' || SCORE_KEY_SET.has(key)) continue
    const label = SECTION_LABEL[key] || key
    if (!labels.includes(label)) labels.push(label)
  }
  return labels
}

export function rawHasHero(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const hero = (raw as Record<string, unknown>).hero
  return Boolean(hero && typeof hero === 'object' && !Array.isArray(hero))
}

export type RangeVerdict = 'inside' | 'outside' | 'boundary' | 'unit_mismatch'

export type RangeBreach = {
  value: number
  low: number
  high: number
  unit: string
}

const RANGE_NUMBER = String.raw`\d+(?:\.\d+)?`
const RANGE_UNIT =
  'celsius|°c|degrees?\\s+c|fahrenheit|°f|degrees?\\s+f|percent|pct|%|hours|hour|hrs|hr|kilograms|kilogram|kgs|kg|grams|gram|(?<![a-z])c(?![a-z])|(?<![a-z])f(?![a-z])|(?<![a-z])h(?![a-z])|(?<![a-z])g(?![a-z])'

const BETWEEN_RANGE = new RegExp(
  String.raw`\bbetween\s+(${RANGE_NUMBER})(?:\s*(${RANGE_UNIT}))?\s+and\s+(${RANGE_NUMBER})\s*(${RANGE_UNIT})`,
  'gi',
)
const SPAN_RANGE = new RegExp(
  String.raw`(?<![.\d])(${RANGE_NUMBER})(?:\s*(${RANGE_UNIT}))?\s*(?:to|-)\s*(${RANGE_NUMBER})\s*(${RANGE_UNIT})`,
  'gi',
)
const READING = new RegExp(String.raw`(?<![.\d])(${RANGE_NUMBER})\s*(${RANGE_UNIT})`, 'gi')
const RANGE_CUE = /\b(band|range|threshold|operating|within|inside|outside|limits?|windows?|specs?)\b/i

export function compareRange(
  value: number,
  low: number,
  high: number,
  valueUnit: string,
  rangeUnit: string,
): RangeVerdict {
  const left = normalizeUnit(valueUnit)
  const right = normalizeUnit(rangeUnit)
  if (!left || !right || left !== right) return 'unit_mismatch'
  const min = Math.min(low, high)
  const max = Math.max(low, high)
  if (value === min || value === max) return 'boundary'
  if (value < min || value > max) return 'outside'
  return 'inside'
}

/** Operating ranges and readings in one text. Only a same-unit reading outside the band is returned. */
export function findRangeBreaches(text: string): RangeBreach[] {
  const ranges = collectRanges(text)
  if (!ranges.length) return []
  const breaches: RangeBreach[] = []
  const seen = new Set<string>()
  READING.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = READING.exec(text))) {
    const start = match.index
    const end = start + match[0].length
    if (ranges.some((range) => start >= range.start && start < range.end)) continue
    const value = Number(match[1])
    const unit = normalizeUnit(match[2] || '')
    if (!unit || !Number.isFinite(value)) continue
    for (const range of ranges) {
      if (range.unit !== unit) continue
      if (compareRange(value, range.low, range.high, unit, range.unit) !== 'outside') continue
      const key = `${value}|${range.low}|${range.high}|${unit}`
      if (seen.has(key)) continue
      seen.add(key)
      breaches.push({ value, low: range.low, high: range.high, unit })
    }
    if (READING.lastIndex === start) READING.lastIndex = end
  }
  return breaches
}

/** Narrative JSON cannot replace the overall score from the scores pass. */
export function mergeSectionDrafts(scoresRaw: unknown, narrativeRaw: unknown): Record<string, unknown> {
  const scores = record(scoresRaw) || {}
  const narrative = record(narrativeRaw) || {}
  const scoreRow = record(scores.scores) || {}
  const scoreSnap = record(scores.snapshot) || {}
  const narrativeSnap = record(narrative.snapshot) || {}
  const hero = record(scores.hero) || {}
  const overall = score(scoreRow.overall)
  return {
    hero: { ...hero, ...(overall == null ? {} : { overall }) },
    meta: scores.meta,
    snapshot: {
      ...scoreSnap,
      posture: narrativeSnap.posture || narrative.posture || scoreSnap.posture,
      posture_reason: narrativeSnap.posture_reason || narrative.posture_reason || scoreSnap.posture_reason,
    },
    scores: scoreRow,
    claims: scores.claims,
    math_checks: scores.math_checks,
    unit_economics: scores.unit_economics,
    risks: narrative.risks,
    missing: narrative.missing,
    questions_for_management: narrative.questions_for_management,
    suggested_structure: narrative.suggested_structure,
    memo_markdown: typeof narrative.memo_markdown === 'string' ? narrative.memo_markdown : scores.memo_markdown,
  }
}

/** High risk, a contradicted claim, or overall at or below 2 forces evidence_required. Pass is never the fallback. */
export function derivePosture(input: {
  posture: Posture | ''
  overall: number | null
  risks: readonly { severity: string }[]
  claims: readonly { status: string }[]
}): Posture {
  const high = input.risks.some((risk) => risk.severity === 'high')
  const contradicted = input.claims.some((claim) => claim.status === 'contradicted')
  if (high || contradicted || (input.overall != null && input.overall <= 2)) return 'evidence_required'
  if (input.posture === 'pass' || input.posture === 'discuss_with_milestones' || input.posture === 'evidence_required') {
    return input.posture
  }
  return 'evidence_required'
}

export function applyReviewRules(analysis: DeckAnalysis): DeckAnalysis {
  const checked = applyRangeChecks(analysis)
  const posture = derivePosture({
    posture: checked.snapshot.posture,
    overall: checked.scores.overall,
    risks: checked.risks,
    claims: checked.claims,
  })
  const hero: DeckHero = {
    company: checked.meta.company,
    one_liner: checked.snapshot.one_liner,
    posture,
    overall: checked.scores.overall,
    pre_money: checked.snapshot.round.pre_money,
    post_money: checked.snapshot.round.post_money,
    currency: checked.snapshot.round.currency || 'USD',
  }
  return {
    ...checked,
    scores: checked.scores,
    hero,
    snapshot: { ...checked.snapshot, posture },
    sections_missing: checked.sections_missing.filter((key) => key !== 'hero' && key !== 'posture'),
  }
}

type ParsedRange = { low: number; high: number; unit: string; start: number; end: number }

function applyRangeChecks(analysis: DeckAnalysis): DeckAnalysis {
  const blocks = [
    analysis.memo_markdown,
    analysis.snapshot.one_liner,
    analysis.snapshot.posture_reason,
    analysis.unit_economics?.comment || '',
    ...analysis.claims.flatMap((claim) => [claim.claim, claim.note]),
    ...analysis.risks.map((risk) => risk.why),
  ]
  const breaches = blocks.flatMap((block) => findRangeBreaches(block))
  const uniqueBreaches = dedupeBreaches(breaches)
  if (!uniqueBreaches.length) return analysis
  const claims = analysis.claims.map((claim) => {
    const nextClaim = rewriteOutside(claim.claim, uniqueBreaches)
    const nextNote = rewriteOutside(claim.note, uniqueBreaches)
    const mentions = uniqueBreaches.some((breach) => sentenceMentions(`${nextClaim} ${nextNote}`, breach))
    if (!mentions) return { ...claim, claim: nextClaim, note: nextNote }
    return { ...claim, claim: nextClaim, note: nextNote || 'The reading is outside the stated band.', status: 'contradicted' as const }
  })
  for (const breach of uniqueBreaches) {
    const covered = claims.some((claim) => sentenceMentions(`${claim.claim} ${claim.note}`, breach))
    if (covered || claims.length >= 24) continue
    claims.push({
      claim: `A reading of ${formatMeasure(breach.value)} ${breach.unit} sits outside the stated ${formatMeasure(breach.low)} to ${formatMeasure(breach.high)} ${breach.unit} band.`,
      page: '',
      status: 'contradicted',
      note: 'Checked against the stated band. The model text is not the source of this flag.',
    })
  }
  const risks = analysis.risks.slice()
  for (const breach of uniqueBreaches) {
    const why = rangeWhy(breach)
    if (risks.some((risk) => risk.why === why)) continue
    risks.unshift({
      title: 'Measured value outside the stated band',
      severity: 'high',
      why,
      evidence_that_would_retire_it: 'A corrected reading, or a deck page that states a band covering that reading.',
    })
  }
  return {
    ...analysis,
    scores: analysis.scores,
    memo_markdown: rewriteOutside(analysis.memo_markdown, uniqueBreaches),
    snapshot: {
      ...analysis.snapshot,
      one_liner: rewriteOutside(analysis.snapshot.one_liner, uniqueBreaches),
      posture_reason: rewriteOutside(analysis.snapshot.posture_reason, uniqueBreaches),
    },
    unit_economics: analysis.unit_economics
      ? { ...analysis.unit_economics, comment: rewriteOutside(analysis.unit_economics.comment, uniqueBreaches) }
      : null,
    claims,
    risks: risks.slice(0, 16),
  }
}

function dedupeBreaches(breaches: RangeBreach[]): RangeBreach[] {
  const out: RangeBreach[] = []
  const seen = new Set<string>()
  for (const breach of breaches) {
    const key = `${breach.value}|${breach.low}|${breach.high}|${breach.unit}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(breach)
  }
  return out
}

function rangeWhy(breach: RangeBreach): string {
  return `A stated reading of ${formatMeasure(breach.value)} ${breach.unit} sits outside the stated band of ${formatMeasure(breach.low)} to ${formatMeasure(breach.high)} ${breach.unit}.`
}

function rewriteOutside(text: string, breaches: RangeBreach[]): string {
  if (!text || !breaches.length) return text
  return text
    .split(/(\n+)/)
    .map((part) => {
      if (/^\n+$/.test(part)) return part
      return part
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => {
          if (!breaches.some((breach) => sentenceMentions(sentence, breach))) return sentence
          return sentence.replace(/\binside\b/gi, 'outside').replace(/\bwithin\b/gi, 'outside')
        })
        .join(' ')
    })
    .join('')
}

function sentenceMentions(text: string, breach: RangeBreach): boolean {
  return (
    hasNumber(text, breach.value) &&
    hasNumber(text, breach.low) &&
    hasNumber(text, breach.high) &&
    new RegExp(`\\b${breach.unit}\\b`, 'i').test(text)
  )
}

function hasNumber(text: string, value: number): boolean {
  const token = formatMeasure(value).replace('.', '\\.')
  return new RegExp(String.raw`(?<![\d.])${token}(?!\d)`).test(text)
}

function formatMeasure(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 1000) / 1000)
}

function collectRanges(text: string): ParsedRange[] {
  const found: ParsedRange[] = []
  const push = (
    lowRaw: string,
    highRaw: string,
    firstUnit: string,
    secondUnit: string,
    start: number,
    end: number,
    needsCue: boolean,
  ) => {
    const low = Number(lowRaw)
    const high = Number(highRaw)
    const left = firstUnit ? normalizeUnit(firstUnit) : ''
    const right = normalizeUnit(secondUnit)
    if (!right || (left && left !== right) || !Number.isFinite(low) || !Number.isFinite(high)) return
    if (needsCue && !RANGE_CUE.test(sentenceAround(text, start))) return
    found.push({ low: Math.min(low, high), high: Math.max(low, high), unit: right, start, end })
  }
  BETWEEN_RANGE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BETWEEN_RANGE.exec(text))) {
    push(match[1] || '', match[3] || '', match[2] || '', match[4] || '', match.index, match.index + match[0].length, false)
  }
  SPAN_RANGE.lastIndex = 0
  while ((match = SPAN_RANGE.exec(text))) {
    push(match[1] || '', match[3] || '', match[2] || '', match[4] || '', match.index, match.index + match[0].length, true)
  }
  return found
}

function sentenceAround(text: string, index: number): string {
  let start = index
  while (start > 0 && !/[\n.!?]/.test(text[start - 1] || '')) start -= 1
  let end = index
  while (end < text.length && !/[\n.!?]/.test(text[end] || '')) end += 1
  return text.slice(start, end)
}

function normalizeUnit(raw: string): string {
  const token = raw.trim().toLowerCase().replace(/°/g, '')
  if (token === 'c' || token === 'celsius' || /^degrees?\s*c$/.test(token)) return 'celsius'
  if (token === 'f' || token === 'fahrenheit' || /^degrees?\s*f$/.test(token)) return 'fahrenheit'
  if (token === '%' || token === 'pct' || token === 'percent') return 'percent'
  if (/^hours?$/.test(token) || /^hrs?$/.test(token) || token === 'h') return 'hours'
  if (/^kilograms?$/.test(token) || /^kgs?$/.test(token)) return 'kg'
  if (/^grams?$/.test(token) || token === 'g') return 'g'
  return ''
}

/** Keep the opening and the closing pages when the deck is longer than the prompt budget. */
export function fitNumberedDeck(text: string, max = 100_000): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  const marker = '\n\n[Earlier pages kept. Later pages follow.]\n\n'
  const head = Math.max(1_000, Math.floor(max * 0.62))
  const tail = Math.max(1_000, max - head - marker.length)
  return `${trimmed.slice(0, head)}${marker}${trimmed.slice(-tail)}`
}

const EMPTY_ROUND: RoundFacts = {
  amount: null,
  equity_pct: null,
  pre_money: null,
  post_money: null,
  currency: '',
}

export function emptyScores(): Record<ScoreKey, number | null> {
  return {
    story_clarity: null,
    unit_economics: null,
    model_integrity: null,
    traction_evidence: null,
    team_and_governance: null,
    regulatory_and_operations: null,
    market_and_competition: null,
    use_of_funds: null,
    valuation_fit: null,
    overall: null,
  }
}

export function numberDeckPages(pages: readonly string[]): string {
  const blocks: string[] = []
  pages.forEach((page, index) => {
    const body = page.replace(/\r/g, '\n').trim()
    if (!body) return
    blocks.push(`Page ${index + 1}\n${body}`)
  })
  return blocks.join('\n\n')
}

export function preferredCompany(raw: string): string {
  const cleaned = oneLine(raw, 80)
  if (!cleaned) return ''
  if (/^not in deck$/i.test(cleaned)) return ''
  if (/^(pass|evidence_required|discuss_with_milestones)$/i.test(cleaned)) return ''
  if (/\b(valid|invalid|investable|approved|rejected|fraud|invest)\b/i.test(cleaned)) return ''
  return cleaned
}

export function preferredAsk(round: RoundFacts | null | undefined): string {
  if (!round || round.amount == null) return ''
  const currency = /^[A-Z]{3}$/.test(round.currency) ? round.currency : 'USD'
  const equity =
    round.equity_pct == null ? '' : ` for ${trimNumber(round.equity_pct)}% equity`
  return `Raise of ${trimNumber(round.amount)} ${currency}${equity}`.slice(0, 180)
}

export function parseModelJson(content: string): unknown | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  const slice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed
  try {
    return JSON.parse(slice) as unknown
  } catch {
    return null
  }
}

export function parseDeckAnalysis(raw: unknown): DeckAnalysis | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const missing: string[] = []

  const metaRow = record(row.meta)
  if (!metaRow) missing.push('meta')
  const meta = {
    company: preferredCompany(metaRow ? stringOf(metaRow.company) : ''),
    document: oneLine(metaRow ? stringOf(metaRow.document) : '', 160),
    as_of: oneLine(metaRow ? stringOf(metaRow.as_of) : '', 40),
    review_type: 'deck_only' as const,
    disclaimer: ANALYSIS_DISCLAIMER,
  }

  const snapRow = record(row.snapshot)
  if (!snapRow) missing.push('snapshot')
  const roundRow = snapRow ? record(snapRow.round) : null
  const posture = oneOf(snapRow?.posture, POSTURES)
  if (snapRow && !posture) missing.push('posture')
  const snapshot = {
    one_liner: oneLine(snapRow ? stringOf(snapRow.one_liner) : '', 400),
    round: roundRow
      ? {
          amount: money(roundRow.amount),
          equity_pct: equity(roundRow.equity_pct),
          pre_money: money(roundRow.pre_money),
          post_money: money(roundRow.post_money),
          currency: currencyOf(roundRow.currency),
        }
      : { ...EMPTY_ROUND },
    stage: oneOf(snapRow?.stage, STAGES),
    posture,
    posture_reason: oneLine(snapRow ? stringOf(snapRow.posture_reason) : '', 600),
  }

  const scoreRow = record(row.scores)
  const scores = emptyScores()
  if (!scoreRow) missing.push('scores')
  else {
    for (const key of SCORE_KEYS) scores[key] = score(scoreRow[key])
    if (scores.overall == null) missing.push('scores')
  }

  const claims = readClaims(row.claims, missing)
  const mathChecks = readMath(row.math_checks, missing)
  const unit = readUnit(row.unit_economics, missing)
  const risks = readRisks(row.risks, missing)
  const gaps = readStrings(row.missing, 'missing', missing, 16, 240)
  const questions = readStrings(row.questions_for_management, 'questions_for_management', missing, 12, 400)
  const structure = readStructure(row.suggested_structure, missing)
  const memo = block(row.memo_markdown, 8000)
  if (typeof row.memo_markdown !== 'string' || !memo) missing.push('memo_markdown')
  if (!rawHasHero(row)) missing.push('hero')

  const analysis: DeckAnalysis = {
    hero: emptyHero(),
    meta,
    snapshot,
    scores,
    claims,
    math_checks: mathChecks,
    unit_economics: unit,
    risks,
    missing: gaps,
    questions_for_management: questions,
    suggested_structure: structure,
    memo_markdown: memo,
    sections_missing: unique(missing),
  }
  if (!isUsable(analysis)) return null
  if (JSON.stringify(analysis).length > ANALYSIS_MAX_JSON_CHARS) {
    analysis.memo_markdown = analysis.memo_markdown.slice(0, 4000)
    if (JSON.stringify(analysis).length > ANALYSIS_MAX_JSON_CHARS) return null
  }
  return applyReviewRules(analysis)
}

function emptyHero(): DeckHero {
  return {
    company: '',
    one_liner: '',
    posture: '',
    overall: null,
    pre_money: null,
    post_money: null,
    currency: '',
  }
}

export function readStoredAnalysis(raw: unknown): DeckAnalysis | null {
  return parseDeckAnalysis(raw)
}

function isUsable(analysis: DeckAnalysis): boolean {
  if (analysis.meta.company) return true
  if (analysis.snapshot.posture || analysis.snapshot.one_liner) return true
  if (analysis.snapshot.round.amount != null || analysis.snapshot.round.pre_money != null) return true
  if (SCORE_KEYS.some((key) => analysis.scores[key] != null)) return true
  if (analysis.claims.length || analysis.math_checks.length || analysis.risks.length) return true
  if (analysis.memo_markdown || analysis.questions_for_management.length) return true
  if (analysis.unit_economics || analysis.suggested_structure) return true
  return false
}

function readClaims(raw: unknown, missing: string[]): AnalysisClaim[] {
  if (!Array.isArray(raw)) {
    missing.push('claims')
    return []
  }
  const out: AnalysisClaim[] = []
  for (const item of raw) {
    if (out.length >= 24) break
    const row = record(item)
    if (!row) continue
    const claim = oneLine(stringOf(row.claim), 400)
    const status = oneOf(row.status, CLAIM_STATUSES)
    if (!claim || !status) continue
    out.push({
      claim,
      page: oneLine(stringOf(row.page), 40),
      status,
      note: oneLine(stringOf(row.note), 400),
    })
  }
  return out
}

function readMath(raw: unknown, missing: string[]): MathCheck[] {
  if (!Array.isArray(raw)) {
    missing.push('math_checks')
    return []
  }
  const out: MathCheck[] = []
  for (const item of raw) {
    if (out.length >= 20) break
    const row = record(item)
    if (!row) continue
    const name = oneLine(stringOf(row.name), 120)
    const result = oneOf(row.result, MATH_RESULTS)
    if (!name || !result) continue
    out.push({
      name,
      formula: oneLine(stringOf(row.formula), 300),
      deck_value: oneLine(stringOf(row.deck_value), 160),
      recomputed: oneLine(stringOf(row.recomputed), 160),
      result,
    })
  }
  return out
}

function readUnit(raw: unknown, missing: string[]): UnitEconomics | null {
  const row = record(raw)
  if (!row) {
    if (raw != null) missing.push('unit_economics')
    else missing.push('unit_economics')
    return null
  }
  const year = oneOf(row.year1_vs_breakeven, YEAR1_VS)
  return {
    unit: oneLine(stringOf(row.unit), 80),
    price: oneLine(stringOf(row.price), 80),
    full_cost: oneLine(stringOf(row.full_cost), 80),
    break_even_volume: oneLine(stringOf(row.break_even_volume), 80),
    year1_volume_assumption: oneLine(stringOf(row.year1_volume_assumption), 80),
    year1_vs_breakeven: year,
    comment: oneLine(stringOf(row.comment), 400),
  }
}

function readRisks(raw: unknown, missing: string[]): AnalysisRisk[] {
  if (!Array.isArray(raw)) {
    missing.push('risks')
    return []
  }
  const out: AnalysisRisk[] = []
  for (const item of raw) {
    if (out.length >= 16) break
    const row = record(item)
    if (!row) continue
    const title = oneLine(stringOf(row.title), 160)
    const severity = oneOf(row.severity, SEVERITIES)
    if (!title || !severity) continue
    out.push({
      title,
      severity,
      why: oneLine(stringOf(row.why), 500),
      evidence_that_would_retire_it: oneLine(stringOf(row.evidence_that_would_retire_it), 400),
    })
  }
  return out
}

function readStrings(raw: unknown, key: string, missing: string[], max: number, length: number): string[] {
  if (!Array.isArray(raw)) {
    missing.push(key)
    return []
  }
  const out: string[] = []
  for (const item of raw) {
    if (out.length >= max) break
    const line = oneLine(typeof item === 'string' ? item : '', length)
    if (line) out.push(line)
  }
  return out
}

function readStructure(raw: unknown, missing: string[]): DeckAnalysis['suggested_structure'] {
  const row = record(raw)
  if (!row) {
    missing.push('suggested_structure')
    return null
  }
  const tranches: Tranche[] = []
  if (Array.isArray(row.tranches)) {
    for (const item of row.tranches) {
      if (tranches.length >= 6) break
      const tranche = record(item)
      if (!tranche) continue
      const name = oneLine(stringOf(tranche.name), 80)
      const release = oneLine(stringOf(tranche.release_when), 300)
      if (!name && !release) continue
      tranches.push({ name, release_when: release })
    }
  }
  return { comment: oneLine(stringOf(row.comment), 500), tranches }
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | '' {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : ''
}

function score(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) return null
  return value
}

function money(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12) return null
  return value
}

function equity(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null
  return value
}

function currencyOf(value: unknown): string {
  const cleaned = oneLine(stringOf(value), 8).toUpperCase()
  return /^[A-Z]{3}$/.test(cleaned) ? cleaned : ''
}

function oneLine(value: string, max: number): string {
  return clean(value).replace(/\s+/g, ' ').trim().slice(0, max)
}

function block(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return clean(value).replace(/\r/g, '\n').trim().slice(0, max)
}

function clean(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code === 0x2014) {
      out += ', '
      continue
    }
    if (code === 0x2013) {
      out += '-'
      continue
    }
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      out += ' '
      continue
    }
    out += char
  }
  return out
}

function unique(values: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function trimNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 100) / 100)
}

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

export type DeckAnalysis = {
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

  const analysis: DeckAnalysis = {
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
  return analysis
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

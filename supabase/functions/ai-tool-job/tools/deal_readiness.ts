import type { DealChecklistItem, StubInput, StubOutput } from './types.ts'

/** Exact gap line. Do not paraphrase a silence into a fact. */
export const NOT_STATED = 'Not stated in the document'

const TITLE_LABEL = 'Title / escrow path'
const FOREIGN_LABEL = 'Foreign ownership notes'
const WHITE_LABEL = 'White Land flags'
const GAPS_LABEL = 'Known gaps'

const TITLE_PATTERNS = [/title deed/i, /freehold/i, /leasehold/i, /\bescrow\b/i, /off-plan/i, /off plan/i, /title transfer/i]
const FOREIGN_PATTERNS = [/foreign ownership/i, /non-saudi/i, /non saudi/i, /designated zone/i, /premium residency/i]
const WHITE_PATTERNS = [/white land/i, /white-land/i, /undeveloped land/i, /idle land/i]

const YIELD_OR_COMP = /\b(yields?|irr|cap rate|capitalisation|capitalization|comparables?|comps)\b/i
const PARTY =
  /\b(buyers?|sellers?|vendors?|developers?|sponsors?|counterpart(?:y|ies)|lenders?|brokers?|purchasers?|holdings|llc|ltd|company)\b/i
const PROPER = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g
const ALLOWED_NAMES = new Set(['White Land', 'Saudi Arabia', 'Off Plan', 'Title Deed'])

const LIMITS =
  'Indicative only. Where the document is silent, this note says Not stated in the document. It does not state a yield, a comparable, or a counterparty name.'

/**
 * First read of a teaser or information memorandum.
 * Quotes only sentences that are in the file. Skips yields, comparables, and party names.
 * Does not call a model.
 */
export function dealReadinessOutput(input: StubInput): StubOutput {
  const text = typeof input.sourceText === 'string' ? input.sourceText : ''
  const title = sectionDetail(text, TITLE_PATTERNS, 2)
  const foreign = sectionDetail(text, FOREIGN_PATTERNS, 2)
  const whiteHit = sectionDetail(text, WHITE_PATTERNS, 1)
  const white = whiteHit === NOT_STATED ? NOT_STATED : `The document mentions White Land. ${whiteHit}`
  const gaps = knownGaps(text, title, foreign, white)
  const checklist: DealChecklistItem[] = [
    { key: 'title_escrow', label: TITLE_LABEL, detail: title },
    { key: 'foreign_ownership', label: FOREIGN_LABEL, detail: foreign },
    { key: 'white_land', label: WHITE_LABEL, detail: white },
    { key: 'known_gaps', label: GAPS_LABEL, detail: gaps },
  ]
  const questions = ['What should a Saudi property lawyer confirm before you rely on this note?']
  if (title === NOT_STATED) questions.push('What does the document say about title and the escrow path?')
  if (foreign === NOT_STATED) questions.push('What does the document say about foreign ownership?')
  if (white === NOT_STATED) questions.push('What does the document say about White Land?')
  return {
    tool_key: 'deal_readiness',
    title: 'Deal readiness memo',
    summary:
      'Indicative first read of the uploaded teaser or information memorandum. This is not legal, financial or investment advice.',
    findings: checklist.map((item) => `${item.label}. ${item.detail}`),
    questions,
    sources: [],
    limits: LIMITS,
    generated_on: input.generatedOn,
    model_id: null,
    model_skip_reason: 'document_only',
    checklist,
    example: /example/i.test(input.fileName),
  }
}

function knownGaps(text: string, title: string, foreign: string, white: string): string {
  const lines: string[] = []
  if (!text.trim()) lines.push('The file had no readable text.')
  if (title === NOT_STATED) lines.push(`${TITLE_LABEL}: ${NOT_STATED}.`)
  if (foreign === NOT_STATED) lines.push(`${FOREIGN_LABEL}: ${NOT_STATED}.`)
  if (white === NOT_STATED) lines.push(`${WHITE_LABEL}: ${NOT_STATED}.`)
  lines.push('This memo does not state a yield, a comparable, or a counterparty name.')
  return lines.join(' ')
}

function sectionDetail(text: string, patterns: RegExp[], limit: number): string {
  const hits = matchingSentences(text, patterns, limit)
  return hits.length > 0 ? hits.join(' ') : NOT_STATED
}

function matchingSentences(text: string, patterns: RegExp[], limit: number): string[] {
  const hits: string[] = []
  for (const sentence of sentences(text)) {
    if (blocked(sentence)) continue
    if (!patterns.some((pattern) => pattern.test(sentence))) continue
    const line = quote(sentence)
    if (!line || hits.includes(line)) continue
    hits.push(line)
    if (hits.length >= limit) break
  }
  return hits
}

function sentences(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
}

function blocked(sentence: string): boolean {
  if (YIELD_OR_COMP.test(sentence) || PARTY.test(sentence)) return true
  const names = sentence.match(PROPER) ?? []
  return names.some((name) => !ALLOWED_NAMES.has(name))
}

function quote(sentence: string): string {
  const clean = sentence
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\u2013\u2014]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return ''
  if (clean.length <= 220) return clean
  return `${clean.slice(0, 217).trim()}...`
}

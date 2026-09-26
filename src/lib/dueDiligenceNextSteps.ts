/**
 * Reshape a flat next_steps list into a member checklist.
 * Display only. Does not change stored scores or Edge output.
 */
import { REPORT_COPY } from './dueDiligenceCopy.ts'

export type NextStepGroup = 'p1_public' | 'p2_evidence'

export type NextStepItem = {
  id: string
  group: NextStepGroup
  title: string
  ask: string
}

export type NextStepArea = {
  area: string
  label: string
}

export type PresentedNextSteps = {
  items: NextStepItem[]
  closingNote: string
}

export const NEXT_STEP_VISIBLE_MAX = 5

const IP_AREA = 'Offer and intellectual property'

const WEAK_LABELS = new Set([
  'not_publicly_verifiable',
  'insufficient_public_data',
  'not_found',
  'needs_follow_up',
])

const ITEM_ORDER = [
  'legal-name',
  'homepage',
  'who-public',
  'checkable',
  'off-record',
  'market',
  'traction',
  'ip',
]

export const LEGAL_NAME_STEP: NextStepItem = {
  id: 'legal-name',
  group: 'p1_public',
  title: 'Confirm the legal name',
  ask: 'Which exact legal name and jurisdiction should we search on public registers, and which public page or filing already shows it?',
}

export const HOMEPAGE_STEP: NextStepItem = {
  id: 'homepage',
  group: 'p1_public',
  title: 'Point to a public homepage',
  ask: 'Which https page is the company\u2019s public home (or LinkedIn Company page), and can you open it without a login?',
}

export const WHO_PUBLIC_STEP: NextStepItem = {
  id: 'who-public',
  group: 'p1_public',
  title: 'Name who is public',
  ask: 'Which founders or directors already appear on a public company page, registry extract, or news item we can cite?',
}

export const MARKET_STEP: NextStepItem = {
  id: 'market',
  group: 'p2_evidence',
  title: 'Cite the market figure',
  ask: 'Which public source states the market size or growth figure used in the deck (URL or named report)?',
}

export const TRACTION_STEP: NextStepItem = {
  id: 'traction',
  group: 'p2_evidence',
  title: 'Show a public traction proof',
  ask: 'Which customer, partner, or pilot is already named on a public page, press note, or filing?',
}

export const IP_STEP: NextStepItem = {
  id: 'ip',
  group: 'p2_evidence',
  title: 'Cite the public IP',
  ask: 'Which public filing or page describes the IP or product claim in the deck?',
}

const CHECKABLE_STEP: NextStepItem = {
  id: 'checkable',
  group: 'p1_public',
  title: 'Share a checkable point',
  ask: 'Share the market, traction, team, or IP points you want compared with public sources.',
}

const OFF_RECORD_STEP: NextStepItem = {
  id: 'off-record',
  group: 'p1_public',
  title: 'Ask what is not public',
  ask: 'Ask management what is not on the public record.',
}

const DEFAULT_STEPS: NextStepItem[] = [
  LEGAL_NAME_STEP,
  HOMEPAGE_STEP,
  WHO_PUBLIC_STEP,
  MARKET_STEP,
  TRACTION_STEP,
]

const KNOWN: { id: string; test: RegExp; item: NextStepItem }[] = [
  { id: CHECKABLE_STEP.id, test: /did not state a checkable claim|checkable claim/i, item: CHECKABLE_STEP },
  { id: OFF_RECORD_STEP.id, test: /not on the public record|public pages can be incomplete/i, item: OFF_RECORD_STEP },
  { id: WHO_PUBLIC_STEP.id, test: /registry filing|named people|founders or directors/i, item: WHO_PUBLIC_STEP },
  { id: LEGAL_NAME_STEP.id, test: /legal name/i, item: LEGAL_NAME_STEP },
  { id: HOMEPAGE_STEP.id, test: /public homepage|public home|linkedin company page/i, item: HOMEPAGE_STEP },
  { id: IP_STEP.id, test: /patent|trademark|intellectual property/i, item: IP_STEP },
  { id: MARKET_STEP.id, test: /market figure|market size|growth figure/i, item: MARKET_STEP },
  { id: TRACTION_STEP.id, test: /customers or figures|traction proof|customer, partner, or pilot/i, item: TRACTION_STEP },
]

const RANK = new Map(ITEM_ORDER.map((id, index) => [id, index]))

export function visibleNextSteps<T>(items: readonly T[], expanded: boolean): T[] {
  if (expanded) return [...items]
  return items.slice(0, NEXT_STEP_VISIBLE_MAX)
}

export function presentNextSteps(
  steps: readonly string[],
  areas: readonly NextStepArea[] = [],
): PresentedNextSteps {
  const actions = uniqueActions(steps)
  if (actions.length === 0) {
    return { items: sortItems(withWeakIp([], areas)), closingNote: REPORT_COPY.closingNote }
  }
  if (actions.every(isGenericAsk)) {
    return {
      items: sortItems(withWeakIp(DEFAULT_STEPS, areas)),
      closingNote: REPORT_COPY.closingNote,
    }
  }
  const items: NextStepItem[] = []
  const seen = new Set<string>()
  for (const step of actions) {
    const item = itemFromStep(step)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
  }
  return { items: sortItems(withWeakIp(items, areas)), closingNote: REPORT_COPY.closingNote }
}

function uniqueActions(steps: readonly string[]): string[] {
  const seen = new Set<string>()
  const actions: string[] = []
  for (const step of steps) {
    const cleaned = step.replace(/\s+/g, ' ').trim()
    if (!cleaned || isOrientationNote(cleaned)) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    actions.push(cleaned)
  }
  return actions
}

function isOrientationNote(step: string): boolean {
  return step.toLowerCase().startsWith('this note is a public-source assist')
}

function isGenericAsk(step: string): boolean {
  const value = step.toLowerCase()
  return (
    value.includes('ask which customers or figures') ||
    value.includes('ask which public source states the market') ||
    value.includes('ask which public page supports') ||
    /^ask which public page\b/.test(value)
  )
}

function isSupportsPoint(step: string): boolean {
  return step.toLowerCase().includes('ask which public page supports this point')
}

function itemFromStep(step: string): NextStepItem | null {
  if (isSupportsPoint(step)) return null
  const known = KNOWN.find((row) => row.test.test(step))
  if (known) return known.item
  if (isGenericAsk(step)) return null
  return freeformStep(step)
}

function freeformStep(step: string): NextStepItem {
  return {
    id: `custom-${hashAsk(step)}`,
    group: groupFor(step),
    title: titleFromAsk(step),
    ask: step,
  }
}

function groupFor(ask: string): NextStepGroup {
  if (/\b(market|tam|customer|customers|traction|partner|partnership|patent|trademark|revenue|pilot)\b/i.test(ask)) {
    return 'p2_evidence'
  }
  return 'p1_public'
}

function titleFromAsk(ask: string): string {
  const words = ask
    .replace(/[.?!].*$/s, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
  if (words.length === 0) return 'Ask a public question'
  const title = words.join(' ')
  return title.charAt(0).toUpperCase() + title.slice(1)
}

function withWeakIp(items: readonly NextStepItem[], areas: readonly NextStepArea[]): NextStepItem[] {
  if (!ipAreaWeak(areas) || items.some((item) => item.id === IP_STEP.id)) return [...items]
  return [...items, IP_STEP]
}

function ipAreaWeak(areas: readonly NextStepArea[]): boolean {
  const area = areas.find((item) => item.area === IP_AREA)
  return Boolean(area && WEAK_LABELS.has(area.label))
}

function sortItems(items: NextStepItem[]): NextStepItem[] {
  return [...items].sort((a, b) => {
    if (a.group !== b.group) return a.group === 'p1_public' ? -1 : 1
    return (RANK.get(a.id) ?? 100) - (RANK.get(b.id) ?? 100)
  })
}

function hashAsk(value: string): string {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash.toString(36)
}

import {
  RE_ASSET_CLASSES,
  RE_CAPITAL_ROLES,
  isReReadinessStatus,
  type ReOpportunityCard,
  type ReReadinessStatus,
} from './reRedaction.ts'
import { reAppetiteFits, type ReAppetite } from './reAppetite.ts'
import { reRegionFor, type ReRegion } from './reRegions.ts'

export type ReOpportunityFilters = {
  assetClass: (typeof RE_ASSET_CLASSES)[number] | null
  city: ReRegion | null
  capitalRole: (typeof RE_CAPITAL_ROLES)[number] | null
  /** When true, keep cards that overlap the member appetite on every dimension. */
  fitsAppetite?: boolean
}

export const EMPTY_RE_FILTERS: ReOpportunityFilters = {
  assetClass: null,
  city: null,
  capitalRole: null,
  fitsAppetite: false,
}

export function reFiltersActive(filters: ReOpportunityFilters) {
  return filters.assetClass != null || filters.city != null || filters.capitalRole != null || filters.fitsAppetite === true
}

export function filterReOpportunities(
  cards: readonly ReOpportunityCard[],
  filters: ReOpportunityFilters,
  appetite: ReAppetite | null = null,
) {
  return cards.filter((card) => {
    if (filters.assetClass && card.asset_class !== filters.assetClass) return false
    if (filters.city && reRegionFor(card.city, card.one_liner) !== filters.city) return false
    if (filters.capitalRole && card.capital_role !== filters.capitalRole) return false
    if (filters.fitsAppetite === true && (!appetite || !reAppetiteFits(card, appetite))) return false
    return true
  })
}

export function reFeedIsForming(cards: readonly { is_demo: boolean }[]) {
  return cards.some((card) => card.is_demo)
}

export const RE_READINESS_CHECKS = [
  { key: 'foreign_ownership_path', label: 'Foreign ownership path' },
  { key: 'escrow_off_plan', label: 'Escrow / off-plan registration' },
  { key: 'title_clarity', label: 'Title clarity' },
  { key: 'white_land_exposure', label: 'White Land exposure' },
] as const

export type ReReadinessKey = (typeof RE_READINESS_CHECKS)[number]['key']

export const RE_READINESS_STATUS_LABEL: Record<ReReadinessStatus, string> = {
  ready: 'Ready',
  in_progress: 'In progress',
  not_yet: 'Not yet',
  not_applicable: 'Not applicable',
}

export const RE_READINESS_NOTE = 'Readiness is an indicative checklist, not legal advice.'

export const RE_READINESS_STAFF = {
  title: 'Opportunity readiness',
  lead: 'Set the four checks on a live brief. Example briefs stay as seeded.',
  save: 'Save readiness',
  saving: 'Saving',
  saved: 'Readiness saved.',
  loadError: 'Could not load readiness. Retry.',
  error: 'Could not save readiness. Retry.',
  empty: 'No opportunities to review.',
  denied: 'Readiness edits are for staff.',
  unavailable: 'Readiness is not available yet.',
  demo: 'Example briefs keep the seeded checklist.',
  loading: 'Loading readiness',
  retry: 'Retry',
} as const

export type ReReadinessInput = {
  foreign_ownership_path: ReReadinessStatus | null
  escrow_off_plan: ReReadinessStatus | null
  title_clarity: ReReadinessStatus | null
  white_land_exposure: ReReadinessStatus | null
}

export type ReReadinessCheck = {
  key: ReReadinessKey
  label: string
  status: ReReadinessStatus
  statusLabel: string
}

export type ReReadinessDraft = Record<ReReadinessKey, ReReadinessStatus>

function statusOf(value: ReReadinessStatus | null): ReReadinessStatus {
  return value ?? 'not_yet'
}

export function readinessChecks(card: ReReadinessInput): ReReadinessCheck[] {
  return RE_READINESS_CHECKS.map((check) => {
    const status = statusOf(card[check.key])
    const statusLabel =
      check.key === 'white_land_exposure' && status === 'ready' ? 'None' : RE_READINESS_STATUS_LABEL[status]
    return { key: check.key, label: check.label, status, statusLabel }
  })
}

export function readinessLines(card: ReReadinessInput) {
  return readinessChecks(card).map((check) => `${check.label}: ${check.statusLabel}`)
}

export function readinessDraft(card: ReReadinessInput): ReReadinessDraft {
  return {
    foreign_ownership_path: statusOf(card.foreign_ownership_path),
    escrow_off_plan: statusOf(card.escrow_off_plan),
    title_clarity: statusOf(card.title_clarity),
    white_land_exposure: statusOf(card.white_land_exposure),
  }
}

export function readinessKey(card: ReReadinessInput & { id: string }) {
  const draft = readinessDraft(card)
  return [card.id, draft.foreign_ownership_path, draft.escrow_off_plan, draft.title_clarity, draft.white_land_exposure].join(':')
}

export function readinessSaveArgs(id: string, draft: ReReadinessDraft) {
  const values = [
    draft.foreign_ownership_path,
    draft.escrow_off_plan,
    draft.title_clarity,
    draft.white_land_exposure,
  ]
  if (values.some((value) => !isReReadinessStatus(value))) return null
  return {
    p_id: id,
    p_foreign_ownership_path: draft.foreign_ownership_path,
    p_escrow_off_plan: draft.escrow_off_plan,
    p_title_clarity: draft.title_clarity,
    p_white_land_exposure: draft.white_land_exposure,
  }
}

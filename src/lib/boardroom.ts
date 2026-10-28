/**
 * Boardroom lists and match helpers for profile cards.
 * Columns: public.profile_board_roles (organisation, role, org_type, position)
 * and public.profile_boardroom (open_to_seats, seat_types, seat_where, expertise).
 * private.board_seat_match_fields(user_id) returns board_seat_type and
 * board_seat_where as text. Both are empty when Open is not Yes or that
 * list is empty. FW8 can match on seat_types and seat_where later.
 * This file does not match seats.
 */

export const BOARD_ROLE_TITLES = [
  'Chair',
  'Vice chair',
  'Independent director',
  'Non-executive director',
  'Committee chair',
  'Adviser',
] as const

export const BOARD_ORG_TYPES = [
  'Listed',
  'Private',
  'Family business',
  'Government or semi-government',
  'Non-profit',
] as const

export const BOARD_SEAT_TYPES = [
  'Chair',
  'Independent director',
  'Non-executive director',
  'Committee: Audit',
  'Committee: Risk',
  'Committee: Nomination and remuneration',
  'Adviser',
] as const

export const BOARD_SEAT_WHERE = ['Saudi Arabia', 'GCC', 'International'] as const

export const BOARD_EXPERTISE = [
  'Governance',
  'Audit and risk',
  'M&A',
  'Capital markets and IPO',
  'Family business and succession',
  'Strategy',
  'Turnaround',
  'Digital and AI',
  'ESG',
  'Regulation and compliance',
  'Islamic finance',
  'Real estate development',
  'People and remuneration',
] as const

export const MAX_BOARD_ROLES = 5
export const MAX_BOARD_EXPERTISE = 5
export const MAX_BOARD_ORGANISATION = 120

export const BOARD_SEAT_MATCHES_LABEL = 'Board seat matches on'
export const ADMIN_SEAT_MATCHES_ON = 'Seat matches on'
export const ADMIN_SEAT_MATCHES_OFF = 'Seat matches off'

export type BoardRoleTitle = (typeof BOARD_ROLE_TITLES)[number]
export type BoardOrgType = (typeof BOARD_ORG_TYPES)[number]
export type BoardSeatType = (typeof BOARD_SEAT_TYPES)[number]
export type BoardSeatWhere = (typeof BOARD_SEAT_WHERE)[number]
export type BoardExpertise = (typeof BOARD_EXPERTISE)[number]
export type ApplicationRegion = 'ksa_gcc' | 'intl'

export type BoardRole = {
  organisation: string
  role: BoardRoleTitle
  orgType: BoardOrgType
}

export type BoardroomState = {
  roles: BoardRole[]
  openToSeats: boolean
  seatTypes: BoardSeatType[]
  seatWhere: BoardSeatWhere[]
  expertise: BoardExpertise[]
}

export type BoardroomRecord = BoardroomState & {
  applicationRegion: ApplicationRegion | null
  applicationBoardSeats: string | null
}

export type BoardroomCardFields = {
  board_roles: BoardRole[]
  open_to_board_seats: boolean
  seat_types: BoardSeatType[]
  seat_where: BoardSeatWhere[]
  expertise: BoardExpertise[]
}

const EMPTY_CARD: BoardroomCardFields = {
  board_roles: [],
  open_to_board_seats: false,
  seat_types: [],
  seat_where: [],
  expertise: [],
}

export function emptyBoardroom(): BoardroomRecord {
  return {
    roles: [],
    openToSeats: false,
    seatTypes: [],
    seatWhere: [],
    expertise: [],
    applicationRegion: null,
    applicationBoardSeats: null,
  }
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pickAllowed<T extends string>(value: unknown, allowed: readonly T[], max: number): T[] {
  const next: T[] = []
  for (const item of asList(value)) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!(allowed as readonly string[]).includes(trimmed) || next.includes(trimmed as T)) continue
    next.push(trimmed as T)
    if (next.length >= max) break
  }
  return next
}

/** Same rule as private.board_org_ok. Email, a plus before a digit, or 8 digits. */
export function organisationProblem(value: string): 'empty' | 'long' | 'contact' | '' {
  const trimmed = value.trim()
  if (!trimmed) return 'empty'
  if (trimmed.length > MAX_BOARD_ORGANISATION) return 'long'
  const digits = trimmed.match(/[0-9]/g)?.length ?? 0
  if (trimmed.includes('@') || /\+[0-9]/.test(trimmed) || digits >= 8) return 'contact'
  return ''
}

export function organisationError(value: string): string {
  const problem = organisationProblem(value)
  if (problem === 'empty') return 'Add the organisation.'
  if (problem === 'long') return 'Organisation can be 120 characters at most.'
  if (problem === 'contact') return 'Leave out email addresses and phone numbers.'
  return ''
}

export function cleanOrganisation(value: string): string | null {
  const trimmed = value.trim()
  if (organisationProblem(trimmed) !== '') return null
  return trimmed
}

export function applicationWhereOffer(region: ApplicationRegion): { where: BoardSeatWhere[]; line: string } {
  if (region === 'ksa_gcc') {
    return {
      where: ['Saudi Arabia', 'GCC'],
      line: 'You told us your region covers Saudi Arabia and the GCC. This sets Open to new seats to Yes and Where to Saudi Arabia and GCC.',
    }
  }
  return {
    where: ['International'],
    line: 'You told us your region is international. This sets Open to new seats to Yes and Where to International.',
  }
}

/**
 * Strings for the PF-4 completeness row. Empty unless Open is Yes and that
 * list has a value. Both filled means the row is done.
 */
export function boardSeatFieldsForCompleteness(state: Pick<BoardroomState, 'openToSeats' | 'seatTypes' | 'seatWhere'>) {
  if (!state.openToSeats) return { boardSeatType: '', boardSeatWhere: '' }
  return {
    boardSeatType: state.seatTypes[0] ?? '',
    boardSeatWhere: state.seatWhere[0] ?? '',
  }
}

export function boardSeatMatchesOn(state: Pick<BoardroomState, 'openToSeats' | 'seatTypes' | 'seatWhere'>): boolean {
  const fields = boardSeatFieldsForCompleteness(state)
  return fields.boardSeatType.trim().length > 0 && fields.boardSeatWhere.trim().length > 0
}

/**
 * PF-5 admin chip. Null while both values are null (fields not on the list
 * yet). Empty strings are known and off. Both non-empty strings are on.
 */
export function adminSeatMatchState(boardSeatType: string | null, boardSeatWhere: string | null): boolean | null {
  if (typeof boardSeatType !== 'string' && typeof boardSeatWhere !== 'string') return null
  return Boolean(boardSeatType?.trim()) && Boolean(boardSeatWhere?.trim())
}

export function adminSeatMatchLabel(on: boolean | null): string | null {
  if (on == null) return null
  return on ? ADMIN_SEAT_MATCHES_ON : ADMIN_SEAT_MATCHES_OFF
}

export function presentBoardroomCard(raw: unknown): BoardroomCardFields {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_CARD }
  const row = raw as Record<string, unknown>
  const open = row.open_to_board_seats === true
  const roles: BoardRole[] = []
  for (const item of asList(row.board_roles)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const roleRow = item as Record<string, unknown>
    const organisation = cleanOrganisation(typeof roleRow.organisation === 'string' ? roleRow.organisation : '')
    const role = typeof roleRow.role === 'string' ? roleRow.role.trim() : ''
    const orgType = typeof roleRow.org_type === 'string' ? roleRow.org_type.trim() : ''
    if (!organisation) continue
    if (!(BOARD_ROLE_TITLES as readonly string[]).includes(role)) continue
    if (!(BOARD_ORG_TYPES as readonly string[]).includes(orgType)) continue
    roles.push({ organisation, role: role as BoardRoleTitle, orgType: orgType as BoardOrgType })
    if (roles.length >= MAX_BOARD_ROLES) break
  }
  return {
    board_roles: roles,
    open_to_board_seats: open,
    seat_types: open ? pickAllowed(row.seat_types, BOARD_SEAT_TYPES, BOARD_SEAT_TYPES.length) : [],
    seat_where: open ? pickAllowed(row.seat_where, BOARD_SEAT_WHERE, BOARD_SEAT_WHERE.length) : [],
    expertise: pickAllowed(row.expertise, BOARD_EXPERTISE, MAX_BOARD_EXPERTISE),
  }
}

export function parseBoardroomRecord(raw: unknown): BoardroomRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const card = presentBoardroomCard({
    board_roles: asList(row.roles).map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      const role = item as Record<string, unknown>
      return { organisation: role.organisation, role: role.role, org_type: role.org_type }
    }),
    open_to_board_seats: row.open_to_seats === true,
    seat_types: row.seat_types,
    seat_where: row.seat_where,
    expertise: row.expertise,
  })
  const region = row.application_region === 'ksa_gcc' || row.application_region === 'intl' ? row.application_region : null
  const told = typeof row.application_board_seats === 'string' ? row.application_board_seats.trim() : ''
  return {
    roles: card.board_roles,
    openToSeats: card.open_to_board_seats,
    seatTypes: card.seat_types,
    seatWhere: card.seat_where,
    expertise: card.expertise,
    applicationRegion: region,
    applicationBoardSeats: told ? told.slice(0, 1000) : null,
  }
}

export function toggleAllowed<T extends string>(current: readonly T[], value: T, max: number): { next: T[]; limited: boolean } {
  if (current.includes(value)) return { next: current.filter((item) => item !== value), limited: false }
  if (current.length >= max) return { next: [...current], limited: true }
  return { next: [...current, value], limited: false }
}

import { formatUkDateTime } from './ukDate'

/** Shown when the profile has no name. Not treated as a filled name. */
export const NAME_NOT_SET = 'Name not set'

/**
 * Payload keys for staff_list_profiles. Later profile fields stay null
 * until those columns exist. Contact fields are not in this list.
 */
export const PROFILE_LIST_KEYS = [
  'member_id',
  'display_name',
  'seat_label',
  'status',
  'has_photo',
  'title',
  'organisation',
  'city_key',
  'sector_count',
  'availability_set',
  'theme_count',
  'profile_updated_at',
  'open_suggestion',
  'open_request',
  'help_with',
  'looking_for',
  'board_seat_type',
  'board_seat_where',
] as const

const FORBIDDEN_KEYS = [
  'email',
  'phone',
  'linkedin',
  'linkedin_url',
  'calendar',
  'calendar_url',
  'capacity',
  'turnover',
  'turnover_usd',
  'bio',
] as const

const STATUSES = ['active', 'invited', 'suspended'] as const

export type ProfileListStatus = (typeof STATUSES)[number]

export type ProfileListRow = {
  member_id: string
  display_name: string
  seat_label: string
  status: ProfileListStatus
  has_photo: boolean
  title: string | null
  organisation: string | null
  city_key: string | null
  sector_count: number
  availability_set: boolean
  theme_count: number
  profile_updated_at: string | null
  open_suggestion: null
  open_request: null
  help_with: string | null
  looking_for: string | null
  board_seat_type: string | null
  board_seat_where: string | null
}

export type ProfileChips = {
  cardComplete: boolean
  introsOn: boolean
  /** Null until board seat fields are present. Hidden in the list. */
  seatMatchesOn: boolean | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function filled(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string') return value
  return undefined
}

function wholeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return undefined
  return value
}

/**
 * Directory card and weekly intros follow the PF-4 completeness rows:
 * photo, name, title, organisation, and city; then sector count and availability.
 * Seat matches stays hidden while both board fields are null.
 */
export function adminProfileChips(
  row: Pick<
    ProfileListRow,
    | 'display_name'
    | 'has_photo'
    | 'title'
    | 'organisation'
    | 'city_key'
    | 'sector_count'
    | 'availability_set'
    | 'board_seat_type'
    | 'board_seat_where'
  >,
): ProfileChips {
  const name = row.display_name === NAME_NOT_SET ? '' : row.display_name
  const cardComplete =
    row.has_photo &&
    filled(name) &&
    filled(row.title) &&
    filled(row.organisation) &&
    filled(row.city_key)
  const introsOn = row.sector_count > 0 && row.availability_set
  const boardKnown = typeof row.board_seat_type === 'string' || typeof row.board_seat_where === 'string'
  const seatMatchesOn = boardKnown ? filled(row.board_seat_type) && filled(row.board_seat_where) : null
  return { cardComplete, introsOn, seatMatchesOn }
}

export function profileStatusLabel(status: ProfileListStatus) {
  if (status === 'active') return 'Active'
  if (status === 'invited') return 'Invited'
  return 'Suspended'
}

export function profileUpdatedLabel(iso: string | null) {
  if (!iso) return 'Not updated'
  const stamp = formatUkDateTime(iso)
  if (!stamp) return 'Not updated'
  return `${stamp} AST`
}

export function profileCountLine(rows: readonly Pick<ProfileChips, 'introsOn'>[]) {
  const members = rows.length
  const off = rows.filter((row) => !row.introsOn).length
  const memberText = members === 1 ? '1 member' : `${members} members`
  const offText = off === 1 ? '1 with intros off' : `${off} with intros off`
  return `${memberText}. ${offText}.`
}

function updatedTime(iso: string | null) {
  if (!iso) return null
  const time = Date.parse(iso)
  return Number.isNaN(time) ? null : time
}

export function sortProfiles(rows: readonly ProfileListRow[]) {
  return [...rows].sort((left, right) => {
    const leftTime = updatedTime(left.profile_updated_at)
    const rightTime = updatedTime(right.profile_updated_at)
    if (leftTime == null && rightTime == null) return left.display_name.localeCompare(right.display_name)
    if (leftTime == null) return 1
    if (rightTime == null) return -1
    if (rightTime !== leftTime) return rightTime - leftTime
    return left.display_name.localeCompare(right.display_name)
  })
}

export function filterProfiles(
  rows: readonly ProfileListRow[],
  filters: { introsOff: boolean; cardIncomplete: boolean },
) {
  return sortProfiles(rows).filter((row) => {
    const chips = adminProfileChips(row)
    if (filters.introsOff && chips.introsOn) return false
    if (filters.cardIncomplete && chips.cardComplete) return false
    return true
  })
}

/** Reject the payload if a row has a contact key, a missing key, or a bad value. */
export function parseProfileList(data: unknown): ProfileListRow[] | null {
  if (!Array.isArray(data)) return null
  const allowed = new Set<string>(PROFILE_LIST_KEYS)
  const rows: ProfileListRow[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const record = item as Record<string, unknown>
    const keys = Object.keys(record)
    if (keys.some((key) => (FORBIDDEN_KEYS as readonly string[]).includes(key))) return null
    if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) return null
    if (!PROFILE_LIST_KEYS.every((key) => Object.prototype.hasOwnProperty.call(record, key))) return null
    if (typeof record.member_id !== 'string' || !UUID_RE.test(record.member_id)) return null
    if (typeof record.display_name !== 'string' || record.display_name.trim().length === 0) return null
    if (typeof record.seat_label !== 'string' || record.seat_label.trim().length === 0) return null
    if (typeof record.status !== 'string' || !(STATUSES as readonly string[]).includes(record.status)) return null
    if (typeof record.has_photo !== 'boolean' || typeof record.availability_set !== 'boolean') return null
    const title = nullableText(record.title)
    const organisation = nullableText(record.organisation)
    const cityKey = nullableText(record.city_key)
    const sectorCount = wholeNumber(record.sector_count)
    const themeCount = wholeNumber(record.theme_count)
    const helpWith = nullableText(record.help_with)
    const lookingFor = nullableText(record.looking_for)
    const boardSeatType = nullableText(record.board_seat_type)
    const boardSeatWhere = nullableText(record.board_seat_where)
    if (
      title === undefined ||
      organisation === undefined ||
      cityKey === undefined ||
      sectorCount === undefined ||
      themeCount === undefined ||
      helpWith === undefined ||
      lookingFor === undefined ||
      boardSeatType === undefined ||
      boardSeatWhere === undefined
    ) {
      return null
    }
    if (record.open_suggestion !== null || record.open_request !== null) return null
    if (record.profile_updated_at !== null && typeof record.profile_updated_at !== 'string') return null
    rows.push({
      member_id: record.member_id,
      display_name: record.display_name,
      seat_label: record.seat_label,
      status: record.status as ProfileListStatus,
      has_photo: record.has_photo,
      title,
      organisation,
      city_key: cityKey,
      sector_count: sectorCount,
      availability_set: record.availability_set,
      theme_count: themeCount,
      profile_updated_at: record.profile_updated_at,
      open_suggestion: null,
      open_request: null,
      help_with: helpWith,
      looking_for: lookingFor,
      board_seat_type: boardSeatType,
      board_seat_where: boardSeatWhere,
    })
  }
  return rows
}

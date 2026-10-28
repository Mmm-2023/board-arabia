/** One definition of a complete member profile. Benefits, never a percentage. */

export const WEEKLY_INTROS_CARD_LINE = 'Two minutes to switch on weekly intros.'
export const WEEKLY_INTROS_CARD_CTA = 'Fill it in'
export const WEEKLY_INTROS_EMPTY = 'Add a sector and your availability to switch on weekly intros.'

export const DIRECTORY_CARD_LABEL = 'Directory card complete'
export const WEEKLY_INTROS_LABEL = 'Weekly intros on'
export const INTRO_REASONS_LABEL = 'Better intro reasons'
export const BOARD_SEAT_LABEL = 'Board seat matches on'

export const PROFILE_SECTION_HREF = {
  card: '/dashboard/profile#your-card',
  focus: '/dashboard/profile#focus',
  private: '/dashboard/profile#private',
  boardroom: '/dashboard/profile#boardroom',
} as const

/** Home still links here. The profile page sends this hash to the sign-in page. */
export const PROFILE_PASSWORD_ENTRY = '/dashboard/profile#password'
export const PASSWORD_PAGE = '/dashboard/two-step#password'

export function profilePasswordTarget(hash: string): string | null {
  return hash === '#password' ? PASSWORD_PAGE : null
}

export type CompletenessRowId = 'directory' | 'weekly' | 'reasons' | 'board'

export type CompletenessRow = {
  id: CompletenessRowId
  label: string
  href: string
  missing: number
  done: boolean
  /** "Add 1 thing" or "Add n things". Empty when the row is done. */
  addLabel: string
}

export type ProfileCompletenessInput = {
  photo: boolean
  name: string
  title: string
  organisation: string
  city: string
  sectorCount: number
  availabilitySet: boolean
  /** PF-7. Omit both until the fields exist. */
  helpWith?: string | null
  lookingFor?: string | null
  /** PF-6. Omit both until the fields exist. */
  boardSeatType?: string | null
  boardSeatWhere?: string | null
}

export function addThingsLabel(missing: number): string {
  if (missing === 1) return 'Add 1 thing'
  return `Add ${missing} things`
}

function filled(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function row(
  id: CompletenessRowId,
  label: string,
  href: string,
  doneFlags: boolean[],
): CompletenessRow {
  const missing = doneFlags.filter((done) => !done).length
  const done = missing === 0
  return {
    id,
    label,
    href,
    missing,
    done,
    addLabel: done ? '' : addThingsLabel(missing),
  }
}

function hasOwn(input: ProfileCompletenessInput, key: 'helpWith' | 'lookingFor' | 'boardSeatType' | 'boardSeatWhere') {
  return Object.prototype.hasOwnProperty.call(input, key)
}

/** Visible rows only. Future rows stay hidden until their fields are passed in. */
export function profileCompleteness(input: ProfileCompletenessInput): CompletenessRow[] {
  const rows: CompletenessRow[] = [
    row('directory', DIRECTORY_CARD_LABEL, PROFILE_SECTION_HREF.card, [
      input.photo,
      filled(input.name),
      filled(input.title),
      filled(input.organisation),
      filled(input.city),
    ]),
    row('weekly', WEEKLY_INTROS_LABEL, PROFILE_SECTION_HREF.focus, [
      input.sectorCount > 0,
      input.availabilitySet,
    ]),
  ]
  if (hasOwn(input, 'helpWith') || hasOwn(input, 'lookingFor')) {
    rows.push(
      row('reasons', INTRO_REASONS_LABEL, PROFILE_SECTION_HREF.focus, [
        filled(input.helpWith),
        filled(input.lookingFor),
      ]),
    )
  }
  if (hasOwn(input, 'boardSeatType') || hasOwn(input, 'boardSeatWhere')) {
    rows.splice(
      1,
      0,
      row('board', BOARD_SEAT_LABEL, PROFILE_SECTION_HREF.boardroom, [
        filled(input.boardSeatType),
        filled(input.boardSeatWhere),
      ]),
    )
  }
  return rows
}

export function weeklyIntrosOn(input: Pick<ProfileCompletenessInput, 'sectorCount' | 'availabilitySet'>) {
  const weekly = profileCompleteness({
    photo: false,
    name: '',
    title: '',
    organisation: '',
    city: '',
    sectorCount: input.sectorCount,
    availabilitySet: input.availabilitySet,
  }).find((item) => item.id === 'weekly')
  return weekly?.done === true
}

export function firstMissingHref(rows: readonly CompletenessRow[]): string | null {
  return rows.find((item) => !item.done)?.href ?? null
}

export function profileCardVisible(input: {
  staff: boolean
  dismissed: boolean
  status: 'loading' | 'ready' | 'error'
  rows: readonly CompletenessRow[]
}) {
  if (input.staff || input.dismissed || input.status !== 'ready') return false
  return input.rows.some((item) => !item.done)
}

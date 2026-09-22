export const CALENDAR_BOOKING_URL =
  'https://calendar.app.google/a7RVc2v3mZ226Sd89'

const SLOT_KEY = 'boardarabia_calendar_slot'
const BOOKED_KEY = 'boardarabia_booked'

export function getHeldSlot(): string {
  try {
    return sessionStorage.getItem(SLOT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setHeldSlot(slot: string) {
  try {
    sessionStorage.setItem(SLOT_KEY, slot.trim())
  } catch {
    /* private mode */
  }
}

export function clearHeldSlot() {
  try {
    sessionStorage.removeItem(SLOT_KEY)
    sessionStorage.removeItem(BOOKED_KEY)
  } catch {
    /* private mode */
  }
}

export function markBooked() {
  try {
    sessionStorage.setItem(BOOKED_KEY, '1')
  } catch {
    /* private mode */
  }
}

export function hasBooked(): boolean {
  try {
    return sessionStorage.getItem(BOOKED_KEY) === '1'
  } catch {
    return false
  }
}

/** Pull calendar_slot from query string if Google/redirect passes it back. */
export function slotFromSearchParams(params: URLSearchParams): string | null {
  const keys = ['calendar_slot', 'slot', 'start', 'date', 'time', 'event']
  for (const key of keys) {
    const value = params.get(key)
    if (value?.trim()) return value.trim()
  }
  return null
}

import type { DeskTopic } from '../../supabase/functions/_shared/desk_note.ts'

/** Confirm screen for an admitted member. Not a nav tab. */
export const LEAVE_BOARD_PATH = '/dashboard/profile/leave'

/**
 * Reuses the existing desk note. Topic stays on the current allowlist
 * so this does not need a new Edge function or table.
 */
export const LEAVE_DESK_REQUEST: { topic: DeskTopic; message: string } = {
  topic: 'Something else',
  message:
    'I ask to leave Board Arabia. Please close this membership and confirm when the seat is closed.',
}

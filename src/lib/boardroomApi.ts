import {
  parseBoardroomRecord,
  type BoardRole,
  type BoardroomRecord,
  type BoardroomState,
} from './boardroom'

type RpcError = { message: string } | null

async function rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: RpcError }> {
  const { supabase } = await import('./supabase')
  const client = supabase as unknown as {
    rpc: (fn: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError }>
  }
  return client.rpc(name, args)
}

export function boardroomErrorMessage(message: string): string {
  if (/not_allowed/i.test(message)) return 'You cannot change this boardroom record.'
  if (/boardroom_contact/i.test(message)) return 'Leave out email addresses and phone numbers.'
  if (/boardroom_limit/i.test(message)) return 'Five is the limit.'
  if (/boardroom_invalid/i.test(message)) return 'Choose a value from the list.'
  if (/boardroom_place/i.test(message)) return 'Pick at least one seat type and one place.'
  return 'Could not save the boardroom. Try again.'
}

export async function fetchBoardroom(): Promise<
  { ok: true; record: BoardroomRecord } | { ok: false; missing: boolean; message: string }
> {
  const { data, error } = await rpc('get_my_boardroom')
  if (error) {
    const missing = /not_allowed/i.test(error.message)
    return {
      ok: false,
      missing,
      message: missing ? boardroomErrorMessage(error.message) : 'Could not load the boardroom. Try again.',
    }
  }
  const record = parseBoardroomRecord(data)
  if (!record) return { ok: false, missing: false, message: 'Could not load the boardroom. Try again.' }
  return { ok: true, record }
}

export async function saveBoardRoles(roles: readonly BoardRole[]) {
  const payload = roles.map((role) => ({
    organisation: role.organisation,
    role: role.role,
    org_type: role.orgType,
  }))
  const { error } = await rpc('save_my_board_roles', { p_roles: payload })
  if (error) return { ok: false as const, message: boardroomErrorMessage(error.message) }
  return { ok: true as const }
}

export async function saveBoardFocus(
  state: Pick<BoardroomState, 'openToSeats' | 'seatTypes' | 'seatWhere' | 'expertise'>,
) {
  const { error } = await rpc('save_my_board_focus', {
    p_open: state.openToSeats,
    p_seat_types: state.seatTypes,
    p_seat_where: state.seatWhere,
    p_expertise: state.expertise,
  })
  if (error) return { ok: false as const, message: boardroomErrorMessage(error.message) }
  return { ok: true as const }
}

export async function dismissApplicationField(field: 'region' | 'board_seats') {
  const { error } = await rpc('dismiss_my_application_answer', { p_field: field })
  if (error) return { ok: false as const, message: 'Could not dismiss that note. Try again.' }
  return { ok: true as const }
}

import {
  presentBoardSeatApplicants,
  presentBoardSeatList,
  type BoardSeatApplicant,
  type BoardSeatDraft,
  type BoardSeatRow,
} from './boardSeats'
import { supabase } from './supabase'

function args(draft: BoardSeatDraft) {
  return {
    p_seat_kind: draft.seatKind,
    p_title: draft.title.trim(),
    p_sector: draft.sector.trim(),
    p_capacity: draft.capacity.trim(),
    p_sector_tags: draft.sectorTags,
    p_regions: draft.regions,
    p_organisation_name: draft.organisationName.trim(),
    p_terms: draft.terms.trim(),
    p_contact_name: draft.contactName.trim(),
    p_contact_email: draft.contactEmail.trim(),
    p_contact_phone: draft.contactPhone.trim(),
    p_narrative: draft.narrative.trim(),
  }
}

export function boardSeatError(message: string) {
  if (message.includes('not_allowed')) return 'Two-step sign-in is required.'
  if (message.includes('not_found')) return 'That seat is not here.'
  if (message.includes('invalid_contact')) return 'Check the company contact and retry.'
  if (message.includes('invalid_tags')) return 'Choose a sector or region from the lists.'
  return 'Could not save that seat. Check the fields and retry.'
}

export async function loadBoardSeats(): Promise<{ ok: true; rows: BoardSeatRow[] } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('staff_list_board_seats')
  if (error) return { ok: false, message: boardSeatError(error.message) }
  return { ok: true, rows: presentBoardSeatList(data) }
}

export async function createBoardSeat(draft: BoardSeatDraft) {
  const { error } = await supabase.rpc('staff_create_board_seat', args(draft))
  if (error) return boardSeatError(error.message)
  return ''
}

export async function editBoardSeat(id: string, draft: BoardSeatDraft) {
  const { error } = await supabase.rpc('staff_edit_board_seat', { p_id: id, ...args(draft) })
  if (error) return boardSeatError(error.message)
  return ''
}

export async function publishBoardSeat(id: string) {
  const { error } = await supabase.rpc('staff_publish_board_seat', { p_id: id })
  if (error) return boardSeatError(error.message)
  return ''
}

export async function closeBoardSeat(id: string) {
  const { error } = await supabase.rpc('staff_close_board_seat', { p_id: id })
  if (error) return boardSeatError(error.message)
  return ''
}

export async function loadBoardSeatApplicants(
  roleId: string,
): Promise<{ ok: true; rows: BoardSeatApplicant[] } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('staff_list_board_seat_applicants', { p_role_id: roleId })
  if (error) return { ok: false, message: boardSeatError(error.message) }
  return { ok: true, rows: presentBoardSeatApplicants(data) }
}

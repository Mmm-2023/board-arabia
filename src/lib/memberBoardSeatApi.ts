import {
  memberSeatProblem,
  presentBoardSeatApplications,
  presentBoardSeatDetail,
  presentPostedBoardSeats,
  presentPublishedBoardSeats,
  presentShortlist,
  type BoardSeatApplication,
  type BoardSeatDetail,
  type MemberSeatDraft,
  type PostedBoardSeat,
  type PublishedBoardSeat,
  type ShortlistPerson,
} from './memberBoardSeats'
import { supabase } from './supabase'

function args(draft: MemberSeatDraft) {
  return {
    p_seat_kind: draft.seatKind,
    p_title: draft.title.trim(),
    p_sector: draft.sector.trim(),
    p_capacity: draft.capacity.trim(),
    p_sector_tags: draft.sectorTags,
    p_regions: draft.regions,
    p_organisation_name: draft.organisationName.trim(),
    p_terms: draft.terms.trim(),
    p_narrative: draft.narrative.trim(),
  }
}

export function memberBoardSeatError(message: string) {
  if (message.includes('not_allowed')) return 'You cannot do that from this account.'
  if (message.includes('not_found')) return 'That seat is not here.'
  if (message.includes('invalid_note')) return 'Keep email addresses and phone numbers out of the note.'
  if (message.includes('invalid_tags')) return 'Choose a sector or region from the lists.'
  if (message.includes('sample_blocked')) return 'That example stays on the page.'
  return 'Could not save that. Check the fields and retry.'
}

export async function loadPublishedBoardSeats(): Promise<
  { ok: true; rows: PublishedBoardSeat[] } | { ok: false; denied: boolean; message: string }
> {
  const { data, error } = await supabase.rpc('list_published_board_seats')
  if (error) {
    const message = memberBoardSeatError(error.message)
    return { ok: false, denied: error.message.includes('not_allowed'), message }
  }
  return { ok: true, rows: presentPublishedBoardSeats(data) }
}

export async function loadBoardSeatApplications(): Promise<
  { ok: true; rows: BoardSeatApplication[] } | { ok: false; message: string }
> {
  const { data, error } = await supabase.rpc('my_board_seat_applications')
  if (error) return { ok: false, message: memberBoardSeatError(error.message) }
  return { ok: true, rows: presentBoardSeatApplications(data) }
}

export async function loadPostedBoardSeats(): Promise<
  { ok: true; rows: PostedBoardSeat[] } | { ok: false; message: string }
> {
  const { data, error } = await supabase.rpc('my_posted_board_seats')
  if (error) return { ok: false, message: memberBoardSeatError(error.message) }
  return { ok: true, rows: presentPostedBoardSeats(data) }
}

export async function loadBoardSeatDetail(
  id: string,
): Promise<{ ok: true; seat: BoardSeatDetail } | { ok: false; denied: boolean; message: string }> {
  const { data, error } = await supabase.rpc('get_board_seat', { p_id: id })
  if (error) {
    return { ok: false, denied: error.message.includes('not_allowed'), message: memberBoardSeatError(error.message) }
  }
  const seat = presentBoardSeatDetail(data)
  if (!seat) return { ok: false, denied: false, message: 'That seat is not here.' }
  return { ok: true, seat }
}

export async function loadBoardSeatShortlist(
  roleId: string,
): Promise<{ ok: true; rows: ShortlistPerson[] } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('list_my_board_seat_shortlist', { p_role_id: roleId })
  if (error) return { ok: false, message: memberBoardSeatError(error.message) }
  return { ok: true, rows: presentShortlist(data) }
}

export async function submitMemberBoardSeat(
  draft: MemberSeatDraft,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const problem = memberSeatProblem(draft)
  if (problem) return { ok: false, message: problem }
  const { data, error } = await supabase.rpc('submit_member_board_seat', args(draft))
  if (error) return { ok: false, message: memberBoardSeatError(error.message) }
  const id = data && typeof data === 'object' && !Array.isArray(data) ? (data as { id?: unknown }).id : null
  if (typeof id !== 'string' || !id) return { ok: false, message: 'Could not save that. Check the fields and retry.' }
  return { ok: true, id }
}

export async function applyToBoardSeat(
  roleId: string,
  note: string,
): Promise<{ ok: true; status: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('apply_to_board_seat', { p_role_id: roleId, p_note: note.trim() })
  if (error) return { ok: false, message: memberBoardSeatError(error.message) }
  const status = data && typeof data === 'object' && !Array.isArray(data) ? (data as { status?: unknown }).status : null
  if (typeof status !== 'string' || !status) return { ok: false, message: 'Could not save that. Check the fields and retry.' }
  return { ok: true, status }
}

export async function openBoardSeatIntroduction(
  introId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('open_board_seat_introduction', { p_intro_id: introId })
  if (error) return { ok: false, message: memberBoardSeatError(error.message) }
  return { ok: true }
}

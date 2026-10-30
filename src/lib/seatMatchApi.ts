import {
  parseSeatReasons,
  presentSuggestedPeople,
  presentSuggestedSeats,
  suggestionsEnabled,
  suggestionState,
  type SuggestedPerson,
  type SuggestedSeat,
} from './seatMatch.ts'
import { supabase } from './supabase'

function failed(message: string): { ok: false; message: string } {
  return { ok: false, message: message || 'Could not load suggestions.' }
}

export async function loadMySeatSuggestions(): Promise<
  { ok: true; enabled: boolean; state: string; seats: SuggestedSeat[] } | { ok: false; message: string }
> {
  const { data, error } = await supabase.rpc('list_my_seat_suggestions')
  if (error) return failed(error.message)
  return {
    ok: true,
    enabled: suggestionsEnabled(data),
    state: suggestionState(data),
    seats: presentSuggestedSeats(data),
  }
}

export async function loadSeatMatch(roleId: string): Promise<
  { ok: true; enabled: boolean; state: string; reasons: SuggestedSeat['reasons'] } | { ok: false; message: string }
> {
  const { data, error } = await supabase.rpc('my_seat_match', { p_role_id: roleId })
  if (error) return failed(error.message)
  return {
    ok: true,
    enabled: suggestionsEnabled(data),
    state: suggestionState(data),
    reasons: parseSeatReasons(data && typeof data === 'object' ? (data as { reasons?: unknown }).reasons : null),
  }
}

export async function loadPeopleForSeat(roleId: string): Promise<
  { ok: true; enabled: boolean; state: string; people: SuggestedPerson[] } | { ok: false; message: string }
> {
  const { data, error } = await supabase.rpc('list_people_for_my_seat', { p_role_id: roleId })
  if (error) return failed(error.message)
  return {
    ok: true,
    enabled: suggestionsEnabled(data),
    state: suggestionState(data),
    people: presentSuggestedPeople(data),
  }
}

export async function dismissSeatMatch(roleId: string, personId?: string) {
  const { error } = await supabase.rpc('dismiss_seat_match', {
    p_role_id: roleId,
    p_person_id: personId ?? null,
  })
  if (error) return error.message
  return ''
}

export async function restoreSeatMatch(roleId: string, personId?: string) {
  const { error } = await supabase.rpc('restore_seat_match', {
    p_role_id: roleId,
    p_person_id: personId ?? null,
  })
  if (error) return error.message
  return ''
}

export async function loadSeatSuggestionSwitch(): Promise<{ ok: true; enabled: boolean } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('staff_get_seat_suggestions')
  if (error) return failed(error.message)
  return { ok: true, enabled: suggestionsEnabled(data) }
}

export async function setSeatSuggestionSwitch(enabled: boolean) {
  const { data, error } = await supabase.rpc('staff_set_seat_suggestions', { p_enabled: enabled })
  if (error) return { ok: false as const, message: error.message }
  return { ok: true as const, enabled: suggestionsEnabled(data) }
}

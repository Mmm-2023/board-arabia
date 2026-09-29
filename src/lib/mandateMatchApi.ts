import { schemaMissing } from './demoRows.ts'
import {
  presentStaffMandateList,
  presentStaffMandateMatch,
  type StaffMandateBrief,
  type StaffMandateMatch,
} from './mandateMatch.ts'
import { supabase } from './supabase.ts'

export type MandateDeskLoad<T> =
  | { status: 'ready'; row: T }
  | { status: 'missing' }
  | { status: 'denied' }
  | { status: 'absent' }
  | { status: 'error' }

function failed(error: { message: string; code?: string }): MandateDeskLoad<never> {
  if (schemaMissing(error.message)) return { status: 'missing' }
  const code = error.code ?? ''
  if (code === '42501' || /not_allowed/i.test(error.message)) return { status: 'denied' }
  if (code === 'P0002' || /not_found/i.test(error.message)) return { status: 'absent' }
  return { status: 'error' }
}

export async function fetchStaffMandates(): Promise<MandateDeskLoad<StaffMandateBrief[]>> {
  const { data, error } = await supabase.rpc('staff_list_mandates')
  if (error) return failed(error)
  return { status: 'ready', row: presentStaffMandateList(data) }
}

export async function fetchStaffMandateMatches(mandateId: string): Promise<MandateDeskLoad<StaffMandateMatch>> {
  const { data, error } = await supabase.rpc('staff_list_mandate_matches', { p_mandate_id: mandateId })
  if (error) return failed(error)
  const row = presentStaffMandateMatch(data)
  if (!row) return { status: 'absent' }
  return { status: 'ready', row }
}

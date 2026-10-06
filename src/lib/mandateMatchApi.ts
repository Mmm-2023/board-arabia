import { schemaMissing } from './demoRows.ts'
import {
  presentStaffMandateList,
  presentStaffMandateMatch,
  type StaffMandateBrief,
  type StaffMandateMatch,
} from './mandateMatch.ts'
import { newMandateRpcArgs, validateNewMandate, type NewMandateDraft, type NewMandateField } from './newMandate.ts'
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

export type CreateMandateResult =
  | { status: 'ready'; id: string }
  | { status: 'invalid'; field: NewMandateField; message: string }
  | { status: 'missing' }
  | { status: 'denied' }
  | { status: 'error' }

export async function createStaffMandate(draft: NewMandateDraft): Promise<CreateMandateResult> {
  const problem = validateNewMandate(draft)
  if (problem) return { status: 'invalid', field: problem.field, message: problem.message }
  const { data, error } = await supabase.rpc('staff_create_mandate', newMandateRpcArgs(draft))
  if (error) {
    if (schemaMissing(error.message)) return { status: 'missing' }
    const code = error.code ?? ''
    if (code === '42501' || /not_allowed/i.test(error.message)) return { status: 'denied' }
    if (code === '22023' || /invalid_mandate/i.test(error.message)) {
      return { status: 'invalid', field: 'sector', message: 'Check the fields and try again.' }
    }
    return { status: 'error' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { status: 'error' }
  const row = data as { id?: unknown; is_demo?: unknown }
  if (row.is_demo === true) return { status: 'error' }
  const id = typeof row.id === 'string' ? row.id : ''
  if (!id) return { status: 'error' }
  return { status: 'ready', id }
}

export async function fetchStaffMandateMatches(mandateId: string): Promise<MandateDeskLoad<StaffMandateMatch>> {
  const { data, error } = await supabase.rpc('staff_list_mandate_matches', { p_mandate_id: mandateId })
  if (error) return failed(error)
  const row = presentStaffMandateMatch(data)
  if (!row) return { status: 'absent' }
  return { status: 'ready', row }
}

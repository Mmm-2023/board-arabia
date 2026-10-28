import { schemaMissing } from './demoRows'

type RpcError = { message: string } | null

async function rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: RpcError }> {
  const { supabase } = await import('./supabase')
  const client = supabase as unknown as {
    rpc: (fn: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError }>
  }
  return client.rpc(name, args)
}

export function focusErrorMessage(message: string): string {
  if (/not_allowed/i.test(message)) return 'You cannot change this focus record.'
  if (/focus_contact/i.test(message)) return 'Do not add an email or a phone number on that line.'
  if (/focus_limit/i.test(message)) return 'Three is the limit.'
  if (/focus_invalid/i.test(message)) return 'Choose a value from the list.'
  return 'Could not save focus. Try again.'
}

export async function saveMyFocus(input: {
  canHelp: readonly string[]
  canHelpLine: string
  lookingFor: readonly string[]
  lookingForLine: string
  languages: readonly string[]
}): Promise<{ ok: true } | { ok: false; missing: boolean; message: string }> {
  const { error } = await rpc('save_my_focus', {
    p_can_help: [...input.canHelp],
    p_can_help_line: input.canHelpLine.trim() || null,
    p_looking_for: [...input.lookingFor],
    p_looking_for_line: input.lookingForLine.trim() || null,
    p_languages: [...input.languages],
  })
  if (!error) return { ok: true }
  if (schemaMissing(error.message)) return { ok: false, missing: true, message: '' }
  return { ok: false, missing: false, message: focusErrorMessage(error.message) }
}

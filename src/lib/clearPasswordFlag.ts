import { supabase } from './supabase'

/** Members may set this column only to false. Failure leaves the session AMR as the source of truth. */
export async function clearPasswordFlag(userId: string): Promise<boolean> {
  const { error } = await supabase.from('members').update({ must_set_password: false }).eq('user_id', userId)
  return !error
}

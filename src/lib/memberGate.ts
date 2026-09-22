import { supabase } from './supabase'

/** Staff with no explicit member destination still land on /admin. */
export async function resolveAfterLogin(userId: string, requested: string) {
  const { data: staff } = await supabase
    .from('staff_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (staff) {
    if (requested.startsWith('/dashboard')) {
      const { data: member } = await supabase
        .from('members')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle()
      if (member && member.status !== 'suspended') return requested
      return '/admin'
    }
    return requested
  }

  const { data: member } = await supabase
    .from('members')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()

  if (member) {
    if (requested.startsWith('/dashboard')) return requested
    return '/dashboard'
  }

  return requested
}

import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { staffApiDecision, type StaffRole } from './staff_auth.ts'

export type StaffSession = {
  user: User
  role: StaffRole
  admin: SupabaseClient
}

/** Verifies the caller JWT with Auth, then reads staff_users by that user id.
 * Role claims on the token, in user_metadata, and in the request body are ignored.
 */
export async function requireStaff(
  req: Request,
  respond: (body: { error: string }, status: number) => Response,
): Promise<StaffSession | Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const header = req.headers.get('Authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!supabaseUrl || !serviceKey || !anonKey || !token) {
    return respond({ error: 'Unauthorized' }, 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token)
  if (userError || !user) return respond({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: staff, error: staffError } = await admin
    .from('staff_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const decision = staffApiDecision({
    userId: user.id,
    role: staffError ? null : staff?.role,
  })
  if (!decision.allow) return respond({ error: decision.error }, decision.status)

  return { user, role: decision.role, admin }
}

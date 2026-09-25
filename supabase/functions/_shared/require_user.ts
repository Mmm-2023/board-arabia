import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export type UserSession = {
  user: User
  admin: SupabaseClient
}

export async function requireUser(req: Request): Promise<UserSession | { error: string; status: number }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const header = req.headers.get('Authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!supabaseUrl || !serviceKey || !anonKey || !token) {
    return { error: 'Unauthorized', status: 401 }
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token)
  if (userError || !user) return { error: 'Unauthorized', status: 401 }

  return { user, admin: createClient(supabaseUrl, serviceKey) }
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { handleMandateIntro, type MandateContext } from './handle.ts'

Deno.serve((req) => handleMandateIntro(req, { open: openSession }))

async function openSession(req: Request) {
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

  const admin = createClient(supabaseUrl, serviceKey)
  return {
    userId: user.id,
    rpc: (mandateId: string) => userClient.rpc('request_mandate_intro', { p_mandate_id: mandateId }),
    context: (mandateId: string) => loadContext(admin, user.id, mandateId),
  }
}

async function loadContext(
  admin: ReturnType<typeof createClient>,
  userId: string,
  mandateId: string,
): Promise<MandateContext> {
  const [prior, profile, member, mandate] = await Promise.all([
    admin.from('mandate_intros').select('id').eq('mandate_id', mandateId).eq('member_id', userId).maybeSingle(),
    admin.from('profiles').select('full_name').eq('user_id', userId).maybeSingle(),
    admin.from('members').select('seat').eq('user_id', userId).maybeSingle(),
    admin.from('mandates').select('sector, deal_type, company_name').eq('id', mandateId).maybeSingle(),
  ])
  const seat = member.data?.seat === 'sponsor' ? 'sponsor' : 'member'
  const found = typeof profile.data?.full_name === 'string' ? profile.data.full_name.trim() : ''
  const row = mandate.data
  const item = [row?.sector, row?.deal_type, row?.company_name]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join(', ')
  return {
    alreadyQueued: Boolean(prior.data?.id),
    requesterName: found || (seat === 'sponsor' ? 'Partner' : 'Member'),
    requesterKind: seat,
    item: item || 'Mandate',
  }
}

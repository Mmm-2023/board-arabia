import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { handleReIntro, type ReIntroContext } from './handle.ts'

Deno.serve((req) => handleReIntro(req, { open: openSession }))

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
    rpc: (opportunityId: string) =>
      userClient.rpc('request_re_opportunity_intro', { p_opportunity_id: opportunityId }),
    context: (opportunityId: string) => loadContext(admin, user.id, opportunityId),
    partnerRpc: (partnerId: string) =>
      userClient.rpc('request_re_partner_intro', { p_partner_id: partnerId }),
    partnerContext: (partnerId: string) => loadPartner(admin, user.id, partnerId),
  }
}

const KIND_LABEL: Record<string, string> = {
  law: 'Law',
  valuation: 'Valuation',
  'project finance': 'Project finance',
  developer: 'Developers',
  broker: 'FO-grade brokers',
}

async function loadPartner(
  admin: ReturnType<typeof createClient>,
  userId: string,
  partnerId: string,
): Promise<ReIntroContext> {
  const [prior, profile, member, partner] = await Promise.all([
    admin.from('re_partner_intros').select('id').eq('partner_id', partnerId).eq('member_id', userId).maybeSingle(),
    admin.from('profiles').select('full_name').eq('user_id', userId).maybeSingle(),
    admin.from('members').select('seat').eq('user_id', userId).maybeSingle(),
    admin.from('re_partners').select('name, kind, city').eq('id', partnerId).maybeSingle(),
  ])
  const seat = member.data?.seat === 'sponsor' ? 'sponsor' : 'member'
  const found = typeof profile.data?.full_name === 'string' ? profile.data.full_name.trim() : ''
  const row = partner.data
  const kind = typeof row?.kind === 'string' ? KIND_LABEL[row.kind] || row.kind.trim() : ''
  const item = [row?.name, kind, row?.city]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join(', ')
  return {
    alreadyQueued: Boolean(prior.data?.id),
    requesterName: found || (seat === 'sponsor' ? 'Sponsor' : 'Member'),
    requesterKind: seat,
    item: item || 'Real estate partner',
  }
}

async function loadContext(
  admin: ReturnType<typeof createClient>,
  userId: string,
  opportunityId: string,
): Promise<ReIntroContext> {
  const [prior, profile, member, opportunity] = await Promise.all([
    admin.from('re_opportunity_intros').select('id').eq('opportunity_id', opportunityId).eq('member_id', userId).maybeSingle(),
    admin.from('profiles').select('full_name').eq('user_id', userId).maybeSingle(),
    admin.from('members').select('seat').eq('user_id', userId).maybeSingle(),
    admin.from('re_opportunities').select('sector, city, asset_class, counterparty_name').eq('id', opportunityId).maybeSingle(),
  ])
  const seat = member.data?.seat === 'sponsor' ? 'sponsor' : 'member'
  const found = typeof profile.data?.full_name === 'string' ? profile.data.full_name.trim() : ''
  const row = opportunity.data
  const item = [row?.sector, row?.city, row?.asset_class, row?.counterparty_name]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join(', ')
  return {
    alreadyQueued: Boolean(prior.data?.id),
    requesterName: found || (seat === 'sponsor' ? 'Sponsor' : 'Member'),
    requesterKind: seat,
    item: item || 'Real estate opportunity',
  }
}

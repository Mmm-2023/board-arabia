import { requireUser } from '../_shared/require_user.ts'
import {
  admitLiShareHomeCardEnabled,
  admitShareClickUrl,
  linkedInPostText,
  newAdmitShareToken,
} from '../_shared/admit_li_share.ts'
import { jsonResponse } from '../_shared/mail.ts'

/** Member Home card. The flag is read here. The client never sees the flag. */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireUser(req)
  if (!('user' in gate)) return jsonResponse(req, { error: gate.error }, gate.status)
  const { user, admin } = gate

  let action = 'status'
  try {
    const body = (await req.json()) as { action?: unknown }
    if (body.action === 'dismiss') action = 'dismiss'
    else if (body.action === undefined || body.action === 'status') action = 'status'
    else return jsonResponse(req, { error: 'Unknown action' }, 400)
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  if (!admitLiShareHomeCardEnabled()) return jsonResponse(req, { show: false })

  const { data: member } = await admin
    .from('members')
    .select('user_id, seat, status')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member || member.status === 'suspended' || (member.seat !== 'ksa' && member.seat !== 'intl')) {
    return jsonResponse(req, { show: false })
  }

  if (action === 'dismiss') {
    const { error } = await admin.rpc('dismiss_admit_li_share', { p_user_id: user.id })
    if (error) return jsonResponse(req, { error: 'Could not dismiss this card.' }, 500)
    return jsonResponse(req, { show: false })
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('headline, company')
    .eq('user_id', user.id)
    .maybeSingle()
  const postText = linkedInPostText({
    founding: true,
    seatLabel: 'Founding Member',
    headline: profile?.headline,
    company: profile?.company,
  })
  const { data: token, error } = await admin.rpc('ensure_admit_li_share_token', {
    p_user_id: user.id,
    p_token: newAdmitShareToken(),
    p_seat_label: 'Founding Member',
    p_post_text: postText,
  })
  if (error || typeof token !== 'string' || !token) return jsonResponse(req, { show: false })

  const base = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1`
  const href = admitShareClickUrl(base, token)
  if (!href) return jsonResponse(req, { show: false })
  return jsonResponse(req, { show: true, href })
})

function cors(req: Request): HeadersInit {
  return {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

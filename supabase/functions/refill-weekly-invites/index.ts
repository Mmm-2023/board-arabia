import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  INVITE_WEEKLY_REFILL_HEADER,
  INVITE_WEEKLY_REFILL_SECRET,
  refillAuthorized,
} from '../_shared/invite_refill.ts'
import { jsonResponse } from '../_shared/mail.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': `authorization, content-type, ${INVITE_WEEKLY_REFILL_HEADER}`,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const secret = Deno.env.get(INVITE_WEEKLY_REFILL_SECRET) ?? ''
  const header = req.headers.get(INVITE_WEEKLY_REFILL_HEADER) ?? ''
  if (!refillAuthorized(secret, header)) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { error: 'Not configured' }, 503)

  const admin = createClient(supabaseUrl, serviceKey)
  const dry = new URL(req.url).searchParams.get('dry_run') === '1'
  const { data, error } = await admin.rpc('refill_weekly_peer_invites', { p_apply: !dry })
  if (error || !data || typeof data !== 'object') {
    return jsonResponse(req, { error: 'Invite refill failed.' }, 500)
  }
  return jsonResponse(req, { ok: true, ...(data as Record<string, unknown>), dry_run: dry })
})

import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { enqueueMemberNotice } from '../_shared/member_notice.ts'
import { requireUser } from '../_shared/require_user.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireUser(req)
  if ('error' in gate) return jsonResponse(req, { error: gate.error }, gate.status)

  const minted = await gate.admin.rpc('service_two_step_notice_ref', { p_user: gate.user.id })
  const ref = typeof minted.data === 'string' ? minted.data : ''
  if (minted.error || !UUID.test(ref)) {
    return jsonResponse(req, { error: 'Too many changes. Try again later.' }, 429)
  }

  await enqueueMemberNotice({
    typeKey: 'security_two_step',
    userId: gate.user.id,
    refId: ref,
    payload: { user_id: gate.user.id },
  })
  return jsonResponse(req, { ok: true })
})

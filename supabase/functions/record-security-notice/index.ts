import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { enqueueMemberNotice } from '../_shared/member_notice.ts'
import { requireUser } from '../_shared/require_user.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireUser(req)
  if ('error' in gate) return jsonResponse(req, { error: gate.error }, gate.status)

  let ref = ''
  try {
    const body = await req.json()
    ref = typeof body?.ref_id === 'string' ? body.ref_id.trim() : ''
  } catch {
    ref = ''
  }
  if (!UUID.test(ref)) return jsonResponse(req, { error: 'Could not record the notice.' }, 400)

  await enqueueMemberNotice({
    typeKey: 'security_two_step',
    userId: gate.user.id,
    refId: ref,
    payload: { user_id: gate.user.id },
  })
  return jsonResponse(req, { ok: true })
})

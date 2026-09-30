import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { requireUser } from '../_shared/require_user.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireUser(req)
  if ('error' in gate) return jsonResponse(req, { error: gate.error }, gate.status)
  const { user, admin } = gate

  const { data, error } = await admin.rpc('prepare_candidate_delete', { p_user_id: user.id })
  if (error || !data || typeof data !== 'object') {
    return jsonResponse(req, { error: 'Could not delete the account.' }, 500)
  }
  const status = String((data as { status?: string }).status || '')
  if (status === 'member') {
    return jsonResponse(req, { error: 'A full member account is not removed from here.' }, 409)
  }
  if (status === 'staff') {
    return jsonResponse(req, { error: 'This sign-in is a staff account and is not removed from here.' }, 409)
  }
  if (status === 'missing') {
    return jsonResponse(req, { error: 'No account was found to delete.' }, 404)
  }
  if (status !== 'ok') return jsonResponse(req, { error: 'Could not delete the account.' }, 500)

  const analyticsId = (data as { analytics_id?: string | null }).analytics_id
  if (typeof analyticsId === 'string' && analyticsId && !analyticsId.includes('@')) {
    const removed = await deletePosthogPerson(analyticsId)
    if (removed) await admin.from('retention_posthog_queue').delete().eq('analytics_id', analyticsId)
  }
  return jsonResponse(req, { ok: true })
})

async function deletePosthogPerson(analyticsId: string) {
  const key = Deno.env.get('POSTHOG_PROJECT_API_KEY')?.trim() || ''
  if (!key) return false
  const host = (Deno.env.get('POSTHOG_HOST')?.trim() || 'https://eu.posthog.com').replace(/\/$/, '')
  try {
    const res = await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: '$delete_person',
        distinct_id: analyticsId,
        properties: { distinct_id: analyticsId },
      }),
      signal: AbortSignal.timeout(10000),
    })
    return res.ok
  } catch {
    return false
  }
}

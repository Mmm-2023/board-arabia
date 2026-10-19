import { syncStoredMajlis, type MajlisSyncOp } from '../_shared/majlis_calendar.ts'
import { jsonResponse } from '../_shared/mail.ts'
import { requireStaff } from '../_shared/require_staff.ts'

const UUID = /^[0-9a-f-]{36}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': req.headers.get('Origin') || '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireStaff(req, (body, status) => jsonResponse(req, body, status))
  if (gate instanceof Response) return gate

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  const eventId = String(body.event_id || '')
  if (!UUID.test(eventId)) return jsonResponse(req, { error: 'event_id required' }, 400)
  const op: MajlisSyncOp = body.op === 'cancel' ? 'cancel' : 'upsert'
  const result = await syncStoredMajlis(gate.admin, eventId, op)
  return jsonResponse(req, {
    ok: result.status !== 'failed',
    google: result.status,
    detail: result.detail,
  })
})

import { deskIntroAlert } from '../_shared/desk_intro_alert.ts'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { notifyAdmin } from '../_shared/notify_admin.ts'
import { requireUser } from '../_shared/require_user.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const session = await requireUser(req)
  if ('error' in session) return jsonResponse(req, { error: 'Sign in again.' }, session.status)

  let introId = ''
  try {
    const body = await req.json()
    introId = String(body?.intro_id || '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  if (!UUID.test(introId)) return jsonResponse(req, { error: 'intro_id required' }, 400)

  const { data: intro, error } = await session.admin
    .from('member_intros')
    .select('id, requester_id, target_id, status, ask_desk, desk_notified_at')
    .eq('id', introId)
    .maybeSingle()
  if (error || !intro) return jsonResponse(req, { error: 'Not found' }, 404)
  const row = intro as {
    requester_id: string
    target_id: string
    status: string
    ask_desk: boolean
    desk_notified_at: string | null
  }
  if (row.target_id !== session.user.id || row.status !== 'accepted' || row.ask_desk !== true) {
    return jsonResponse(req, { error: 'Not allowed' }, 403)
  }
  if (row.desk_notified_at) return jsonResponse(req, { ok: true, skipped: true })

  const { data: profiles } = await session.admin
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', [row.requester_id, row.target_id])
  const names = (profiles ?? []) as { user_id: string; full_name: string | null }[]
  const nameFor = (id: string) => names.find((item) => item.user_id === id)?.full_name || 'Member'
  const outcome = await notifyAdmin(
    deskIntroAlert({ requesterName: nameFor(row.requester_id), targetName: nameFor(row.target_id) }),
  )

  await session.admin.from('member_intros').update({ desk_notified_at: new Date().toISOString() }).eq('id', introId)
  return jsonResponse(req, { ok: true, status: outcome.status === 'sent' ? 'sent' : 'dry_run' })
})

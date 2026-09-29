import { cleanDeskNote, DESK_NOTE_HOURLY_CAP, deskNoteLetter } from '../_shared/desk_note.ts'
import {
  adminNotifyEmail,
  boardMail,
  corsHeaders,
  jsonResponse,
  redactDetail,
  redactPayload,
  sendEmail,
} from '../_shared/mail.ts'
import { requireUser } from '../_shared/require_user.ts'
import { isLiveMember } from '../_shared/staff_auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405)
  }

  const session = await requireUser(req)
  if ('error' in session) {
    return jsonResponse(req, { error: 'Sign in again, then send the note.' }, session.status)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  const record = body && typeof body === 'object' ? (body as { topic?: unknown; message?: unknown }) : {}
  const cleaned = cleanDeskNote({ topic: record.topic, message: record.message })
  if (!cleaned.ok) return jsonResponse(req, { error: cleaned.error }, 400)

  const { data: member } = await session.admin
    .from('members')
    .select('status')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (!member || !isLiveMember(member.status)) {
    return jsonResponse(req, { error: 'This note is for members.' }, 403)
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await session.admin
    .from('email_events')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'desk_note')
    .gte('created_at', since)
    .contains('payload', { user_id: session.user.id })
  if (!countError && (count ?? 0) >= DESK_NOTE_HOURLY_CAP) {
    return jsonResponse(
      req,
      { error: 'The desk already has several notes from you this hour. Try again later.' },
      429,
    )
  }

  const { data: profile } = await session.admin
    .from('profiles')
    .select('full_name')
    .eq('user_id', session.user.id)
    .maybeSingle()
  const name = oneLine(profile?.full_name || '') || 'A member'
  const letter = deskNoteLetter({ name, topic: cleaned.topic, message: cleaned.message })
  const mailed = boardMail(letter.text, letter.html)

  let status = 'skipped'
  const to = adminNotifyEmail()
  if (to) {
    const sent = await sendEmail({
      to,
      subject: letter.subject,
      text: mailed.text,
      html: mailed.html,
    })
    status = sent.status === 'sent' ? 'sent' : sent.status === 'dry_run' ? 'dry_run' : 'error'
  }

  const { error: logError } = await session.admin.from('email_events').insert({
    application_id: null,
    kind: 'desk_note',
    recipient: 'desk',
    subject: letter.subject,
    status,
    provider: 'gmail',
    provider_id: null,
    detail: redactDetail(cleaned.message),
    payload: redactPayload({ user_id: session.user.id, topic: cleaned.topic }),
  })
  if (logError && status !== 'sent') {
    return jsonResponse(req, { error: 'Could not reach the desk. Try again.' }, 502)
  }

  return jsonResponse(req, { ok: true })
})

function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 80)
}

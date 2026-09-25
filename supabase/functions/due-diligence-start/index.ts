import { isLiveMember } from '../_shared/staff_auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { requireUser } from '../_shared/require_user.ts'
import {
  DECK_BUCKET,
  DECK_MAX_BYTES,
  deckExtension,
  deckStoragePath,
  MEMBER_MESSAGES,
  parsePublicHttpsUrl,
  safeFileName,
  sniffDeck,
} from '../_shared/due_diligence.ts'
import { assertPptxSlides } from './extract.ts'
import { advanceDueDiligenceJob, deferJob } from './run.ts'

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const session = await requireUser(req)
  if ('error' in session) return jsonResponse(req, { error: MEMBER_MESSAGES.unauthorized }, session.status)

  const member = await session.admin
    .from('members')
    .select('user_id, status')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (member.error || !member.data || !isLiveMember(member.data.status)) {
    return jsonResponse(req, { error: MEMBER_MESSAGES.membersOnly }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: MEMBER_MESSAGES.start }, 400)
  }

  const deckId = String(body.deck_id ?? '')
  const storagePath = String(body.storage_path ?? '')
  const ext = deckExtension(storagePath)
  const expected = ext ? deckStoragePath(session.user.id, deckId, ext) : null
  if (!ext || !expected || storagePath !== expected) {
    return jsonResponse(req, { error: MEMBER_MESSAGES.notDeck }, 400)
  }

  const companyRaw = body.company_url == null ? '' : String(body.company_url).trim()
  let companyUrl: string | null = null
  if (companyRaw) {
    const parsed = parsePublicHttpsUrl(companyRaw)
    if (!parsed.ok) {
      await session.admin.storage.from(DECK_BUCKET).remove([storagePath])
      return jsonResponse(req, { error: MEMBER_MESSAGES.url }, 400)
    }
    companyUrl = `${parsed.url.origin}${parsed.url.pathname}`
  }

  const downloaded = await session.admin.storage.from(DECK_BUCKET).download(storagePath)
  if (downloaded.error || !downloaded.data) {
    return jsonResponse(req, { error: MEMBER_MESSAGES.upload }, 400)
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer())
  if (bytes.byteLength <= 0 || bytes.byteLength > DECK_MAX_BYTES || sniffDeck(bytes) !== ext) {
    await session.admin.storage.from(DECK_BUCKET).remove([storagePath])
    return jsonResponse(req, { error: bytes.byteLength > DECK_MAX_BYTES ? MEMBER_MESSAGES.file : MEMBER_MESSAGES.notDeck }, 400)
  }
  if (ext === 'pptx') {
    try {
      assertPptxSlides(bytes)
    } catch {
      await session.admin.storage.from(DECK_BUCKET).remove([storagePath])
      return jsonResponse(req, { error: MEMBER_MESSAGES.notDeck }, 400)
    }
  }

  const limited = await session.admin.rpc('due_diligence_consume_run', { p_member: session.user.id })
  if (limited.error) {
    await session.admin.storage.from(DECK_BUCKET).remove([storagePath])
    const detail = limited.error.message || ''
    if (detail.includes('rate_limited')) return jsonResponse(req, { error: MEMBER_MESSAGES.rate }, 429)
    if (detail.includes('in_flight')) return jsonResponse(req, { error: MEMBER_MESSAGES.inflight }, 429)
    return jsonResponse(req, { error: MEMBER_MESSAGES.start }, 500)
  }

  const fileName = safeFileName(String(body.file_name ?? ''), ext)
  const mime = ext === 'pdf' ? 'application/pdf' : PPTX_MIME
  const deck = await session.admin
    .from('due_diligence_decks')
    .insert({
      id: deckId.toLowerCase(),
      member_id: session.user.id,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mime,
      byte_size: bytes.byteLength,
      company_url: companyUrl,
    })
    .select('id')
    .maybeSingle()
  if (deck.error || !deck.data) {
    await session.admin.storage.from(DECK_BUCKET).remove([storagePath])
    return jsonResponse(req, { error: MEMBER_MESSAGES.start }, 500)
  }

  const job = await session.admin
    .from('due_diligence_jobs')
    .insert({
      deck_id: deck.data.id,
      member_id: session.user.id,
      status: 'queued',
      progress: 5,
    })
    .select('id')
    .maybeSingle()
  if (job.error || !job.data) {
    await session.admin.from('due_diligence_decks').delete().eq('id', deck.data.id)
    await session.admin.storage.from(DECK_BUCKET).remove([storagePath])
    const detail = job.error?.message || ''
    if (detail.includes('due_diligence_one_active_job')) {
      return jsonResponse(req, { error: MEMBER_MESSAGES.inflight }, 429)
    }
    return jsonResponse(req, { error: MEMBER_MESSAGES.start }, 500)
  }

  deferJob(advanceDueDiligenceJob(session.admin, job.data.id))
  return jsonResponse(req, { ok: true, job_id: job.data.id, deck_id: deck.data.id })
})

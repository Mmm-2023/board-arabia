/**
 * Start a public-information check. Any failure after the deck path is accepted
 * deletes that object. Auth is injected so require_user.ts stays unchanged.
 */
import { isLiveMember } from '../_shared/staff_auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { deliverAdminAlert } from '../_shared/notify_admin.ts'
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

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

type QueryError = { message: string } | null
type Row = { id?: string; user_id?: string; status?: string } | null

type SelectChain = {
  eq: (column: string, value: string) => {
    maybeSingle: () => Promise<{ data: Row; error: QueryError }>
  }
}

type InsertChain = {
  select: (columns: string) => {
    maybeSingle: () => Promise<{ data: Row; error: QueryError }>
  }
}

export type DueDiligenceAdmin = {
  from: (table: string) => {
    select: (columns: string) => SelectChain
    insert: (row: Record<string, unknown>) => InsertChain
    delete: () => { eq: (column: string, value: string) => Promise<unknown> }
  }
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: QueryError }>
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{
        data: { arrayBuffer: () => Promise<ArrayBuffer> } | null
        error: QueryError
      }>
      remove: (paths: string[]) => Promise<unknown>
    }
  }
}

export type StartAuth =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string; code: string; userId: string | null }

export type StartDeps = {
  resolveUser: () => Promise<StartAuth>
  createAdmin: () => DueDiligenceAdmin | null
  assertSlides: (bytes: Uint8Array) => void
  scheduleJob: (admin: DueDiligenceAdmin, jobId: string) => void
}

export function ownedDeckPath(body: unknown, userId: string): string | null {
  if (!isRecord(body)) return null
  const deckId = String(body.deck_id ?? '')
  const storagePath = String(body.storage_path ?? '')
  const ext = deckExtension(storagePath)
  const expected = ext ? deckStoragePath(userId, deckId, ext) : null
  if (!ext || !expected || storagePath !== expected) return null
  return storagePath
}

export async function handleDueDiligenceStart(req: Request, deps: StartDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed', code: 'method_not_allowed' }, 405)
  }

  const auth = await deps.resolveUser()
  if (!auth.ok) {
    await discardOwnedDeck(req, auth.userId, deps.createAdmin())
    return jsonResponse(req, { error: auth.error, code: auth.code }, auth.status)
  }

  const admin = deps.createAdmin()
  if (!admin) return jsonResponse(req, { error: MEMBER_MESSAGES.start, code: 'start_failed' }, 500)

  const body = await readBody(req)
  if (!body) return jsonResponse(req, { error: MEMBER_MESSAGES.start, code: 'bad_request' }, 400)
  const storagePath = ownedDeckPath(body, auth.userId)
  if (!storagePath) return jsonResponse(req, { error: MEMBER_MESSAGES.notDeck, code: 'bad_request' }, 400)

  try {
    return await runStart(req, admin, auth.userId, body, storagePath, deps)
  } catch {
    await removeDeck(admin, storagePath)
    return jsonResponse(req, { error: MEMBER_MESSAGES.start, code: 'start_failed' }, 500)
  }
}

async function runStart(
  req: Request,
  admin: DueDiligenceAdmin,
  userId: string,
  body: Record<string, unknown>,
  storagePath: string,
  deps: StartDeps,
): Promise<Response> {
  const member = await admin.from('members').select('user_id, status').eq('user_id', userId).maybeSingle()
  if (member.error || !member.data || !isLiveMember(member.data.status)) {
    await removeDeck(admin, storagePath)
    return jsonResponse(req, { error: MEMBER_MESSAGES.membersOnly, code: 'members_only' }, 403)
  }

  const companyRaw = body.company_url == null ? '' : String(body.company_url).trim()
  let companyUrl: string | null = null
  if (companyRaw) {
    const parsed = parsePublicHttpsUrl(companyRaw)
    if (!parsed.ok) {
      await removeDeck(admin, storagePath)
      return jsonResponse(req, { error: MEMBER_MESSAGES.url, code: 'bad_request' }, 400)
    }
    companyUrl = `${parsed.url.origin}${parsed.url.pathname}`
  }

  const downloaded = await admin.storage.from(DECK_BUCKET).download(storagePath)
  if (downloaded.error || !downloaded.data) {
    await removeDeck(admin, storagePath)
    return jsonResponse(req, { error: MEMBER_MESSAGES.upload, code: 'bad_request' }, 400)
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer())
  const ext = deckExtension(storagePath)
  if (!ext || bytes.byteLength <= 0 || bytes.byteLength > DECK_MAX_BYTES || sniffDeck(bytes) !== ext) {
    await removeDeck(admin, storagePath)
    return jsonResponse(
      req,
      { error: bytes.byteLength > DECK_MAX_BYTES ? MEMBER_MESSAGES.file : MEMBER_MESSAGES.notDeck, code: 'bad_request' },
      400,
    )
  }
  if (ext === 'pptx') {
    try {
      deps.assertSlides(bytes)
    } catch {
      await removeDeck(admin, storagePath)
      return jsonResponse(req, { error: MEMBER_MESSAGES.notDeck, code: 'bad_request' }, 400)
    }
  }

  const limited = await admin.rpc('due_diligence_consume_run', { p_member: userId })
  if (limited.error) {
    await removeDeck(admin, storagePath)
    const detail = limited.error.message || ''
    if (detail.includes('rate_limited')) {
      return jsonResponse(req, { error: MEMBER_MESSAGES.rate, code: 'rate_limited' }, 429)
    }
    if (detail.includes('in_flight')) {
      return jsonResponse(req, { error: MEMBER_MESSAGES.inflight, code: 'in_flight' }, 429)
    }
    return jsonResponse(req, { error: MEMBER_MESSAGES.start, code: 'start_failed' }, 500)
  }

  const deckId = String(body.deck_id ?? '')
  const fileName = safeFileName(String(body.file_name ?? ''), ext)
  const mime = ext === 'pdf' ? 'application/pdf' : PPTX_MIME
  const deck = await admin
    .from('due_diligence_decks')
    .insert({
      id: deckId.toLowerCase(),
      member_id: userId,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mime,
      byte_size: bytes.byteLength,
      company_url: companyUrl,
    })
    .select('id')
    .maybeSingle()
  if (deck.error || !deck.data?.id) {
    await removeDeck(admin, storagePath)
    return jsonResponse(req, { error: MEMBER_MESSAGES.start, code: 'start_failed' }, 500)
  }

  const job = await admin
    .from('due_diligence_jobs')
    .insert({
      deck_id: deck.data.id,
      member_id: userId,
      status: 'queued',
      progress: 5,
      pipeline_step: 'extract',
      step_claim: null,
      pipeline: {},
    })
    .select('id')
    .maybeSingle()
  if (job.error || !job.data?.id) {
    await removeDeck(admin, storagePath, deck.data.id)
    const detail = job.error?.message || ''
    if (detail.includes('due_diligence_one_active_job')) {
      return jsonResponse(req, { error: MEMBER_MESSAGES.inflight, code: 'in_flight' }, 429)
    }
    return jsonResponse(req, { error: MEMBER_MESSAGES.start, code: 'start_failed' }, 500)
  }

  queueDueDiligenceAlert(admin, userId, fileName)
  try {
    deps.scheduleJob(admin, job.data.id)
  } catch {
    // The job row keeps the deck. Status polling picks the job up again.
  }
  return jsonResponse(req, { ok: true, job_id: job.data.id, deck_id: deck.data.id })
}

function queueDueDiligenceAlert(admin: DueDiligenceAdmin, userId: string, fileName: string) {
  deliverAdminAlert(undefined, async () => {
    let name = 'Member'
    let kind: 'member' | 'sponsor' = 'member'
    try {
      const profile = await admin.from('profiles').select('full_name').eq('user_id', userId).maybeSingle()
      const seat = await admin.from('members').select('seat').eq('user_id', userId).maybeSingle()
      const profileRow = profile.data as { full_name?: unknown } | null
      const seatRow = seat.data as { seat?: unknown } | null
      if (typeof profileRow?.full_name === 'string' && profileRow.full_name.trim()) {
        name = profileRow.full_name.trim()
      }
      if (seatRow?.seat === 'sponsor') kind = 'sponsor'
    } catch {
      // The run is already saved.
    }
    return {
      requesterName: name,
      requesterKind: kind,
      requested: 'an AI Due Diligence run',
      item: fileName,
      approvePath: '/admin',
    }
  })
}

async function discardOwnedDeck(req: Request, userId: string | null, admin: DueDiligenceAdmin | null) {
  if (!userId || !admin) return
  const body = await readBody(req)
  const storagePath = body ? ownedDeckPath(body, userId) : null
  if (!storagePath) return
  await removeDeck(admin, storagePath)
}

async function removeDeck(admin: DueDiligenceAdmin, storagePath: string, deckId?: string) {
  if (deckId) {
    try {
      await admin.from('due_diligence_decks').delete().eq('id', deckId)
    } catch {
      // Still remove the storage object. The member has no delete policy.
    }
  }
  try {
    await admin.storage.from(DECK_BUCKET).remove([storagePath])
  } catch {
    // The HTTP error is the one the member should see.
  }
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return isRecord(body) ? body : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

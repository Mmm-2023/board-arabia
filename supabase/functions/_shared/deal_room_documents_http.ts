/**
 * Deal room documents HTTP. openDealGate checks the caller.
 * The watermark is built from room_document_viewer_identity for that caller only.
 */

import { corsHeaders, jsonResponse } from './mail.ts'
import type { DealGate, DealOpenFailure } from './deal_room_http.ts'
import {
  DEAL_ROOM_SIGNED_URL_SECONDS,
  sanitiseFileName,
  sniffDocument,
  uploadDeclaredTooLarge,
  watermarkLine,
  type DocumentMime,
} from './deal_room_documents.ts'

export type DocumentStorage = {
  upload: (path: string, bytes: Uint8Array, mime: string) => Promise<{ error: string | null }>
  download: (path: string) => Promise<{ bytes: Uint8Array | null; error: string | null }>
  remove: (path: string) => Promise<{ error: string | null }>
  sign: (path: string, expiresIn: number) => Promise<{ url: string | null; error: string | null }>
}

export type DocumentDeps = {
  open: (req: Request) => Promise<DealGate | DealOpenFailure>
  now: () => Date
  countPages: (
    bytes: Uint8Array,
    mime: DocumentMime,
  ) => Promise<{ ok: true; pages: number } | { ok: false; error: string }>
  stamp: (
    bytes: Uint8Array,
    mime: DocumentMime,
    line: string,
  ) => Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }>
  storage: DocumentStorage
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DOC_KEYS = [
  'id',
  'file_name',
  'mime',
  'size_bytes',
  'page_count',
  'download_allowed',
  'access_expires_at',
  'shared_with_admin',
  'uploaded_by_me',
  'expired',
  'created_at',
] as const

const EVENT_KEYS = ['id', 'document_id', 'file_name', 'member_name', 'action', 'at'] as const

export async function handleDealRoomDocuments(req: Request, deps: DocumentDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)
  if (uploadDeclaredTooLarge(req.headers.get('content-length'))) {
    return jsonResponse(req, { error: 'This file is too large.' }, 400)
  }

  const opened = await deps.open(req)
  if ('error' in opened) {
    const code = 'code' in opened ? opened.code : undefined
    return jsonResponse(req, code ? { error: opened.error, code } : { error: opened.error }, opened.status)
  }
  if (!opened.caller.userId) return jsonResponse(req, { error: 'Unauthorized' }, 401)
  if (opened.caller.memberStatus !== 'active') {
    return jsonResponse(req, { error: 'Only an active member can do this.' }, 403)
  }

  const type = req.headers.get('content-type') || ''
  if (type.includes('multipart/form-data')) return upload(req, opened, deps)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  const row = record(body)
  if (!row) return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  const action = row.action
  if (action === 'list') return list(req, opened, row)
  if (action === 'view') return view(req, opened, row, deps)
  if (action === 'download') return download(req, opened, row, deps)
  if (action === 'set_expiry') return setExpiry(req, opened, row)
  if (action === 'set_download') return setDownload(req, opened, row)
  if (action === 'revoke') return revoke(req, opened, row)
  if (action === 'delete') return remove(req, opened, row, deps)
  if (action === 'share_with_admin') return share(req, opened, row)
  return jsonResponse(req, { error: 'That action is not available.' }, 400)
}

async function upload(req: Request, gate: DealGate, deps: DocumentDeps): Promise<Response> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonResponse(req, { error: 'Invalid upload' }, 400)
  }
  const roomId = requiredUuid(form.get('room_id'))
  const file = form.get('file')
  if (!roomId || !isBlob(file)) return jsonResponse(req, { error: 'Choose a file.' }, 400)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sniffed = sniffDocument(bytes)
  if (!sniffed.ok) return jsonResponse(req, { error: uploadError(sniffed.error) }, 400)
  const counted = await deps.countPages(bytes, sniffed.mime)
  if (!counted.ok) return jsonResponse(req, { error: uploadError(counted.error) }, 400)
  const fileName = sanitiseFileName(fileNameOf(file))
  const inserted = await rpc(gate, 'insert_room_document', {
    p_actor: gate.caller.userId,
    p_room_id: roomId,
    p_file_name: fileName,
    p_mime: sniffed.mime,
    p_size_bytes: bytes.byteLength,
    p_page_count: counted.pages,
  })
  if (!inserted.ok) return fail(req, inserted.message)
  const data = record(inserted.data)
  const id = data ? requiredUuid(data.id) : null
  const path = data && typeof data.storage_path === 'string' ? data.storage_path : ''
  if (!id || !path) return jsonResponse(req, { error: "Couldn't save. Retry." }, 500)
  const stored = await deps.storage.upload(path, bytes, sniffed.mime)
  if (stored.error) {
    await rpc(gate, 'delete_room_document', { p_actor: gate.caller.userId, p_document_id: id, p_queue: false })
    return jsonResponse(req, { error: "Couldn't save. Retry." }, 500)
  }
  const logged = await rpc(gate, 'record_room_document_event', {
    p_actor: gate.caller.userId,
    p_document_id: id,
    p_action: 'upload',
  })
  if (!logged.ok) return fail(req, logged.message)
  return jsonResponse(req, { ok: true, id, file_name: fileName })
}

async function list(req: Request, gate: DealGate, row: Record<string, unknown>): Promise<Response> {
  const roomId = requiredUuid(row.room_id)
  if (!roomId) return jsonResponse(req, { error: 'room_id is required.' }, 400)
  const listed = await rpc(gate, 'list_room_documents', { p_actor: gate.caller.userId, p_room_id: roomId })
  if (!listed.ok) return fail(req, listed.message)
  const data = record(listed.data)
  return jsonResponse(req, {
    ok: true,
    documents: allowList(data?.documents, DOC_KEYS),
    events: allowList(data?.events, EVENT_KEYS),
  })
}

async function view(req: Request, gate: DealGate, row: Record<string, unknown>, deps: DocumentDeps): Promise<Response> {
  const opened = await openFor(gate, row)
  if (!opened.ok) return fail(req, opened.message)
  if (opened.hold === 'hidden') return jsonResponse(req, { error: 'Not found' }, 404)
  if (opened.hold === 'expired') return jsonResponse(req, { error: 'Access expired' }, 403)
  const identity = await viewerIdentity(gate)
  if (!identity.ok) return fail(req, identity.message)
  const line = watermarkLine({
    name: identity.name,
    email: identity.email,
    at: deps.now(),
    roomId: opened.roomId,
  })
  const file = await deps.storage.download(opened.path)
  if (!file.bytes) return jsonResponse(req, { error: "Couldn't open this file. Retry." }, 500)
  const stamped = await deps.stamp(file.bytes, opened.mime, line)
  if (!stamped.ok) return jsonResponse(req, { error: "Couldn't open this file. Retry." }, 500)
  const logged = await rpc(gate, 'record_room_document_event', {
    p_actor: gate.caller.userId,
    p_document_id: opened.id,
    p_action: 'view',
  })
  if (!logged.ok) return fail(req, logged.message)
  return jsonResponse(req, {
    ok: true,
    mime: 'application/pdf',
    file_name: opened.fileName,
    stamp: line,
    download_allowed: opened.downloadAllowed,
    file_base64: bytesToBase64(stamped.bytes),
  })
}

async function download(
  req: Request,
  gate: DealGate,
  row: Record<string, unknown>,
  deps: DocumentDeps,
): Promise<Response> {
  const opened = await openFor(gate, row)
  if (!opened.ok) return fail(req, opened.message)
  if (opened.hold === 'hidden') return jsonResponse(req, { error: 'Not found' }, 404)
  if (opened.hold === 'expired') return jsonResponse(req, { error: 'Access expired' }, 403)
  if (!opened.downloadAllowed) {
    return jsonResponse(req, { error: 'Downloads are turned off for this file.' }, 403)
  }
  const signed = await deps.storage.sign(opened.path, DEAL_ROOM_SIGNED_URL_SECONDS)
  if (!signed.url) return jsonResponse(req, { error: "Couldn't open this file. Retry." }, 500)
  const logged = await rpc(gate, 'record_room_document_event', {
    p_actor: gate.caller.userId,
    p_document_id: opened.id,
    p_action: 'download',
  })
  if (!logged.ok) return jsonResponse(req, { error: "Couldn't open this file. Retry." }, 500)
  return jsonResponse(req, { ok: true, url: signed.url, expires_in: DEAL_ROOM_SIGNED_URL_SECONDS })
}

async function setExpiry(req: Request, gate: DealGate, row: Record<string, unknown>): Promise<Response> {
  const roomId = requiredUuid(row.room_id)
  const documentId = row.document_id == null || row.document_id === '' ? null : requiredUuid(row.document_id)
  const memberId = row.member_id == null || row.member_id === '' ? null : requiredUuid(row.member_id)
  if (!roomId) return jsonResponse(req, { error: 'room_id is required.' }, 400)
  if (row.document_id != null && row.document_id !== '' && !documentId) {
    return jsonResponse(req, { error: 'Not found' }, 404)
  }
  if (row.member_id != null && row.member_id !== '' && !memberId) return jsonResponse(req, { error: 'Not found' }, 404)
  const expiresAt = row.expires_at == null || row.expires_at === '' ? null : timeOf(row.expires_at)
  if (row.expires_at != null && row.expires_at !== '' && !expiresAt) {
    return jsonResponse(req, { error: 'Enter a valid time.' }, 400)
  }
  const saved = await rpc(gate, 'set_room_document_expiry', {
    p_actor: gate.caller.userId,
    p_room_id: roomId,
    p_document_id: documentId,
    p_member_id: memberId,
    p_expires_at: expiresAt,
  })
  if (!saved.ok) return fail(req, saved.message)
  return jsonResponse(req, { ok: true })
}

async function setDownload(req: Request, gate: DealGate, row: Record<string, unknown>): Promise<Response> {
  const documentId = requiredUuid(row.document_id)
  if (!documentId) return jsonResponse(req, { error: 'document_id is required.' }, 400)
  if (typeof row.download_allowed !== 'boolean') return jsonResponse(req, { error: 'That action is not available.' }, 400)
  const saved = await rpc(gate, 'set_room_document_download', {
    p_actor: gate.caller.userId,
    p_document_id: documentId,
    p_allowed: row.download_allowed,
  })
  if (!saved.ok) return fail(req, saved.message)
  return jsonResponse(req, { ok: true, download_allowed: row.download_allowed })
}

async function revoke(req: Request, gate: DealGate, row: Record<string, unknown>): Promise<Response> {
  const roomId = requiredUuid(row.room_id)
  const memberId = requiredUuid(row.member_id)
  const documentId = row.document_id == null || row.document_id === '' ? null : requiredUuid(row.document_id)
  if (!roomId || !memberId) return jsonResponse(req, { error: 'room_id and member_id are required.' }, 400)
  if (row.document_id != null && row.document_id !== '' && !documentId) {
    return jsonResponse(req, { error: 'Not found' }, 404)
  }
  const saved = await rpc(gate, 'revoke_room_document_member', {
    p_actor: gate.caller.userId,
    p_room_id: roomId,
    p_member_id: memberId,
    p_document_id: documentId,
  })
  if (!saved.ok) return fail(req, saved.message)
  return jsonResponse(req, { ok: true })
}

async function remove(req: Request, gate: DealGate, row: Record<string, unknown>, deps: DocumentDeps): Promise<Response> {
  const documentId = requiredUuid(row.document_id)
  if (!documentId) return jsonResponse(req, { error: 'document_id is required.' }, 400)
  const deleted = await rpc(gate, 'delete_room_document', {
    p_actor: gate.caller.userId,
    p_document_id: documentId,
    p_queue: true,
  })
  if (!deleted.ok) return fail(req, deleted.message)
  const path = record(deleted.data)?.storage_path
  if (typeof path === 'string' && path) {
    const removed = await deps.storage.remove(path)
    if (!removed.error) await rpc(gate, 'ack_room_document_purge', { p_path: path })
  }
  return jsonResponse(req, { ok: true })
}

async function share(req: Request, gate: DealGate, row: Record<string, unknown>): Promise<Response> {
  const documentId = requiredUuid(row.document_id)
  if (!documentId) return jsonResponse(req, { error: 'document_id is required.' }, 400)
  const saved = await rpc(gate, 'share_room_document_with_admin', {
    p_actor: gate.caller.userId,
    p_document_id: documentId,
  })
  if (!saved.ok) return fail(req, saved.message)
  return jsonResponse(req, { ok: true })
}

async function openFor(gate: DealGate, row: Record<string, unknown>) {
  const documentId = requiredUuid(row.document_id)
  if (!documentId) return { ok: false as const, message: 'not_found' }
  const opened = await rpc(gate, 'room_document_open_for', {
    p_actor: gate.caller.userId,
    p_document_id: documentId,
  })
  if (!opened.ok) return opened
  const data = record(opened.data)
  const hold = data?.hold === 'open' || data?.hold === 'expired' || data?.hold === 'hidden' ? data.hold : 'hidden'
  const mime = data?.mime === 'application/pdf' || data?.mime === 'image/png' || data?.mime === 'image/jpeg' ? data.mime : null
  const path = typeof data?.storage_path === 'string' ? data.storage_path : ''
  const roomId = requiredUuid(data?.room_id) || ''
  const fileName = typeof data?.file_name === 'string' ? data.file_name : 'document'
  if (hold === 'open' && (!mime || !path || !roomId)) return { ok: false as const, message: 'not_found' }
  return {
    ok: true as const,
    id: documentId,
    hold,
    mime: mime || 'application/pdf',
    path,
    roomId,
    fileName,
    downloadAllowed: data?.download_allowed === true,
  }
}

async function viewerIdentity(gate: DealGate) {
  const loaded = await rpc(gate, 'room_document_viewer_identity', { p_actor: gate.caller.userId })
  if (!loaded.ok) return loaded
  const data = record(loaded.data)
  const email = typeof data?.email === 'string' ? data.email.trim() : ''
  const name = typeof data?.full_name === 'string' ? data.full_name.trim() : ''
  if (!email) return { ok: false as const, message: 'not_found' }
  return { ok: true as const, email, name: name || 'Member' }
}

async function rpc(gate: DealGate, name: string, args: Record<string, unknown>) {
  const result = await gate.call(name, args)
  if (result.error) return { ok: false as const, message: result.error.message }
  return { ok: true as const, data: result.data }
}

function fail(req: Request, message: string): Response {
  const mapped = mapError(message)
  return jsonResponse(req, { error: mapped.error }, mapped.status)
}

function mapError(message: string): { status: number; error: string } {
  if (message.includes('not_authenticated')) return { status: 401, error: 'Unauthorized' }
  if (message.includes('mfa_required')) return { status: 403, error: 'mfa_required' }
  if (message.includes('not_owner')) return { status: 403, error: 'Only the room owner can do this.' }
  if (message.includes('not_uploader')) return { status: 403, error: 'Only the member who uploaded this file can do this.' }
  if (message.includes('download_off')) return { status: 403, error: 'Downloads are turned off for this file.' }
  if (message.includes('expired')) return { status: 403, error: 'Access expired' }
  if (message.includes('not_participant') || message.includes('not_allowed')) return { status: 403, error: 'Not allowed' }
  if (message.includes('room_closed') || message.includes('not_open')) return { status: 409, error: 'This room is closed.' }
  if (message.includes('too_large')) return { status: 400, error: 'This file is too large.' }
  if (message.includes('too_many_pages')) return { status: 400, error: 'This file has too many pages.' }
  if (message.includes('invalid_file') || message.includes('empty')) {
    return { status: 400, error: 'Only PDF, PNG, and JPEG files can be uploaded.' }
  }
  if (message.includes('not_found')) return { status: 404, error: 'Not found' }
  return { status: 403, error: 'Not allowed' }
}

function uploadError(error: string): string {
  return mapError(error).error
}

function allowList(value: unknown, keys: readonly string[]): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const row = record(item)
    const out: Record<string, unknown> = {}
    if (!row) return out
    for (const key of keys) {
      if (key in row) out[key] = row[key]
    }
    return out
  })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const size = 0x8000
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size))
  }
  return btoa(binary)
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function requiredUuid(value: unknown): string | null {
  if (typeof value !== 'string' || !UUID.test(value)) return null
  return value
}

function timeOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString()
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob
}

function fileNameOf(file: Blob): string {
  return 'name' in file && typeof file.name === 'string' ? file.name : 'document'
}

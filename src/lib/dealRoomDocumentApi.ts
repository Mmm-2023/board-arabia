/**
 * Deal room files go through deal-room-documents.
 * The client never selects the storage bucket or the document tables.
 */
import { supabase } from './supabase'

export type RoomDocumentRow = {
  id: string
  fileName: string
  downloadAllowed: boolean
  expiresAt: string | null
  sharedWithAdmin: boolean
  uploadedByMe: boolean
  expired: boolean
}

export type RoomDocumentEvent = {
  id: string
  fileName: string
  memberName: string
  action: string
  at: string
}

export type RoomDocumentList = {
  documents: RoomDocumentRow[]
  events: RoomDocumentEvent[]
}

export type DocumentCall<T> =
  | { status: 'ok'; data: T }
  | { status: 'denied'; message: string }
  | { status: 'error'; message: string }

const SAVE_ERROR = "Couldn't save. Retry."
const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const functionsBase = `${url.replace(/\/$/, '')}/functions/v1`

export function listRoomDocuments(roomId: string): Promise<DocumentCall<RoomDocumentList>> {
  return postJson({ action: 'list', room_id: roomId }, (payload) => ({
    documents: presentDocuments(payload.documents),
    events: presentEvents(payload.events),
  }))
}

export function uploadRoomDocument(roomId: string, file: File): Promise<DocumentCall<{ id: string }>> {
  return postForm(roomId, file)
}

export function viewRoomDocument(documentId: string): Promise<
  DocumentCall<{ fileName: string; stamp: string; fileBase64: string; downloadAllowed: boolean }>
> {
  return postJson({ action: 'view', document_id: documentId }, (payload) => {
    const fileName = text(payload.file_name, 180) || 'document'
    const stamp = text(payload.stamp, 400)
    const fileBase64 = typeof payload.file_base64 === 'string' ? payload.file_base64 : ''
    return {
      fileName,
      stamp,
      fileBase64,
      downloadAllowed: payload.download_allowed === true,
    }
  })
}

export function downloadRoomDocument(
  documentId: string,
): Promise<DocumentCall<{ fileName: string; fileBase64: string }>> {
  return postJson({ action: 'download', document_id: documentId }, (payload) => ({
    fileName: text(payload.file_name, 180) || 'document.pdf',
    fileBase64: typeof payload.file_base64 === 'string' ? payload.file_base64 : '',
  }))
}

export function setRoomDocumentDownload(documentId: string, allowed: boolean): Promise<DocumentCall<{ ok: true }>> {
  return postJson({ action: 'set_download', document_id: documentId, download_allowed: allowed }, () => ({ ok: true as const }))
}

export function setRoomDocumentExpiry(input: {
  roomId: string
  documentId?: string | null
  memberId?: string | null
  expiresAt: string | null
}): Promise<DocumentCall<{ ok: true }>> {
  return postJson(
    {
      action: 'set_expiry',
      room_id: input.roomId,
      document_id: input.documentId ?? null,
      member_id: input.memberId ?? null,
      expires_at: input.expiresAt,
    },
    () => ({ ok: true as const }),
  )
}

export function revokeRoomDocumentMember(roomId: string, memberId: string): Promise<DocumentCall<{ ok: true }>> {
  return postJson({ action: 'revoke', room_id: roomId, member_id: memberId, document_id: null }, () => ({ ok: true as const }))
}

export function deleteRoomDocument(documentId: string): Promise<DocumentCall<{ ok: true }>> {
  return postJson({ action: 'delete', document_id: documentId }, () => ({ ok: true as const }))
}

export function shareRoomDocument(documentId: string): Promise<DocumentCall<{ ok: true }>> {
  return postJson({ action: 'share_with_admin', document_id: documentId }, () => ({ ok: true as const }))
}

async function postJson<T>(body: unknown, present: (payload: Record<string, unknown>) => T): Promise<DocumentCall<T>> {
  try {
    const headers = await memberHeaders(true)
    if (!headers) return { status: 'denied', message: 'Sign in to continue.' }
    const res = await fetch(`${functionsBase}/deal-room-documents`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    return readCall(res, present)
  } catch {
    return { status: 'error', message: SAVE_ERROR }
  }
}

async function postForm(roomId: string, file: File): Promise<DocumentCall<{ id: string }>> {
  try {
    const headers = await memberHeaders(false)
    if (!headers) return { status: 'denied', message: 'Sign in to continue.' }
    const form = new FormData()
    form.set('room_id', roomId)
    form.set('file', file)
    const res = await fetch(`${functionsBase}/deal-room-documents`, { method: 'POST', headers, body: form })
    return readCall(res, (payload) => ({ id: text(payload.id, 80) }))
  } catch {
    return { status: 'error', message: SAVE_ERROR }
  }
}

async function readCall<T>(res: Response, present: (payload: Record<string, unknown>) => T): Promise<DocumentCall<T>> {
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.status === 401 || res.status === 403) {
    return { status: 'denied', message: messageOf(payload) }
  }
  if (!res.ok) return { status: 'error', message: messageOf(payload) }
  return { status: 'ok', data: present(payload) }
}

async function memberHeaders(json: boolean): Promise<HeadersInit | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
  }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

function presentDocuments(value: unknown): RoomDocumentRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = record(item)
    if (!row) return []
    const id = text(row.id, 80)
    const fileName = text(row.file_name, 180)
    if (!id || !fileName) return []
    return [
      {
        id,
        fileName,
        downloadAllowed: row.download_allowed === true,
        expiresAt: typeof row.access_expires_at === 'string' ? row.access_expires_at : null,
        sharedWithAdmin: row.shared_with_admin === true,
        uploadedByMe: row.uploaded_by_me === true,
        expired: row.expired === true,
      },
    ]
  })
}

function presentEvents(value: unknown): RoomDocumentEvent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = record(item)
    if (!row) return []
    const id = text(row.id, 80)
    const fileName = text(row.file_name, 180)
    const memberName = text(row.member_name, 200)
    const action = text(row.action, 40)
    const at = text(row.at, 40)
    if (!id || !fileName || !memberName || !action || !at) return []
    if (/@/.test(memberName)) return []
    return [{ id, fileName, memberName, action, at }]
  })
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, max)
}

function messageOf(payload: Record<string, unknown>): string {
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim().slice(0, 240)
  return SAVE_ERROR
}

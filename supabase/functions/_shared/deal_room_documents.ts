/** Deal room document rules. No network. The Edge handler and the tests share this file. */

export const DEAL_ROOM_BUCKET = 'deal-room-documents'
export const DEAL_ROOM_PAGE_CAP = 40
export const DEAL_ROOM_MAX_BYTES = 20 * 1024 * 1024
/** Multipart boundaries and part headers above the file itself. */
export const DEAL_ROOM_UPLOAD_OVERHEAD = 64 * 1024
export const DEAL_ROOM_SIGNED_URL_SECONDS = 60
export const DEAL_ROOM_CLOSED_RETENTION_DAYS = 30

const DAY_MS = 86_400_000
const STORAGE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/source$/i

export type DocumentMime = 'application/pdf' | 'image/png' | 'image/jpeg'

/** True when the declared request size is past the file cap plus multipart overhead. */
export function uploadDeclaredTooLarge(contentLength: string | null): boolean {
  if (contentLength == null || contentLength.trim() === '') return false
  const declared = Number(contentLength)
  if (!Number.isFinite(declared)) return false
  return declared > DEAL_ROOM_MAX_BYTES + DEAL_ROOM_UPLOAD_OVERHEAD
}

export function dealRoomStoragePathOk(path: string): boolean {
  return STORAGE_PATH.test(path) && !path.includes('..')
}

/**
 * Due only after the room has been closed or archived for 30 days.
 * Nothing in the running app calls this. Wire it when retention is switched back on.
 */
export function dealRoomDocumentDue(
  input: { status: string; closedAt: string | null },
  now: Date,
): boolean {
  if (input.status !== 'closed' && input.status !== 'archived') return false
  if (!input.closedAt) return false
  const closed = Date.parse(input.closedAt)
  if (!Number.isFinite(closed)) return false
  return closed < now.getTime() - DEAL_ROOM_CLOSED_RETENTION_DAYS * DAY_MS
}

export function sanitiseFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? ''
  const clean = base.replace(/[^A-Za-z0-9._ ()-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180)
  return clean || 'document'
}

/** Downloads are the stamped PDF a view already builds, including for PNG and JPEG. */
export function stampedDownloadName(fileName: string): string {
  const stem = sanitiseFileName(fileName).replace(/\.[A-Za-z0-9]{1,8}$/, '')
  return sanitiseFileName(`${stem}.pdf`)
}

export function sniffDocument(
  bytes: Uint8Array,
  byteLength = bytes.byteLength,
): { ok: true; mime: DocumentMime } | { ok: false; error: 'empty' | 'too_large' | 'invalid_file' } {
  if (byteLength < 1) return { ok: false, error: 'empty' }
  if (byteLength > DEAL_ROOM_MAX_BYTES) return { ok: false, error: 'too_large' }
  if (isPdf(bytes)) return { ok: true, mime: 'application/pdf' }
  if (isPng(bytes)) return { ok: true, mime: 'image/png' }
  if (isJpeg(bytes)) return { ok: true, mime: 'image/jpeg' }
  return { ok: false, error: 'invalid_file' }
}

export function formatRiyadh(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')} Asia/Riyadh`
}

/** Stamp uses only the caller's own name and email. */
export function watermarkLine(input: { name: string; email: string; at: Date; roomId: string }): string {
  const name = input.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Member'
  const email = input.email.replace(/[\r\n]+/g, '').trim()
  const ref = input.roomId.slice(0, 8)
  return `${name}, ${email}, ${formatRiyadh(input.at)}, room ${ref}`
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

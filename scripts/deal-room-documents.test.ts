import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { contentSecurityPolicy } from './csp-policy.mjs'
import { presentStaffDealRooms } from '../src/lib/dealRoomView.ts'
import {
  DEAL_ROOM_CLOSED_RETENTION_DAYS,
  DEAL_ROOM_MAX_BYTES,
  DEAL_ROOM_SIGNED_URL_SECONDS,
  DEAL_ROOM_UPLOAD_OVERHEAD,
  dealRoomDocumentDue,
  dealRoomStoragePathOk,
  sanitiseFileName,
  sniffDocument,
  stampedDownloadName,
  uploadDeclaredTooLarge,
  watermarkLine,
} from '../supabase/functions/_shared/deal_room_documents.ts'
import { handleDealRoomDocuments, type DocumentDeps } from '../supabase/functions/_shared/deal_room_documents_http.ts'
import { documentStampSupported, stampDocument } from '../supabase/functions/_shared/deal_room_pdf_stamp.ts'
import type { DealCaller, DealGate } from '../supabase/functions/_shared/deal_room_http.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ROOM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const PATH = `${ROOM}/${DOC}/source`
const WHEN = new Date('2026-01-01T00:00:00.000Z')
const VIEWER_EMAIL = 'viewer@example.com'
const OTHER_EMAIL = 'other.member@example.com'
const UPLOADER_EMAIL = 'uploader@example.com'

const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
)

test('watermark uses only the viewer, in Asia/Riyadh', () => {
  const line = watermarkLine({
    name: 'Example Viewer',
    email: VIEWER_EMAIL,
    at: WHEN,
    roomId: ROOM,
  })
  assert.equal(line, 'Example Viewer, viewer@example.com, 2026-01-01 03:00 Asia/Riyadh, room cccccccc')
  assert.equal(line.includes(VIEWER_EMAIL), true)
  assert.equal(line.includes(OTHER_EMAIL), false)
  assert.equal(line.includes(UPLOADER_EMAIL), false)
  assert.equal(DEAL_ROOM_SIGNED_URL_SECONDS, 60)
  assert.equal(DEAL_ROOM_CLOSED_RETENTION_DAYS, 30)
  assert.equal(line.includes('\u2014'), false)
})

test('retention is 30 days after close, not after upload', () => {
  const now = new Date('2026-10-13T00:00:00.000Z')
  assert.equal(dealRoomDocumentDue({ status: 'open', closedAt: null }, now), false)
  assert.equal(dealRoomDocumentDue({ status: 'closed', closedAt: null }, now), false)
  assert.equal(dealRoomDocumentDue({ status: 'closed', closedAt: '2026-09-13T00:00:00.000Z' }, now), false)
  assert.equal(dealRoomDocumentDue({ status: 'closed', closedAt: '2026-09-12T23:59:59.000Z' }, now), true)
  assert.equal(dealRoomDocumentDue({ status: 'archived', closedAt: '2026-08-01T00:00:00.000Z' }, now), true)
  assert.equal(dealRoomStoragePathOk(PATH), true)
  assert.equal(dealRoomStoragePathOk(`${ROOM}/${DOC}/source.pdf`), false)
  assert.equal(dealRoomStoragePathOk('../secret'), false)
})

test('upload sniff rejects the wrong bytes, svg, html, and oversize files', () => {
  assert.equal(sniffDocument(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])).ok, true)
  assert.equal(sniffDocument(PNG).mime, 'image/png')
  assert.equal(sniffDocument(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])).mime, 'image/jpeg')
  assert.equal(sniffDocument(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).ok, false)
  assert.equal(sniffDocument(new TextEncoder().encode('<!DOCTYPE html><html></html>')).ok, false)
  assert.equal(sniffDocument(Uint8Array.from([0x00, 0x01, 0x02, 0x03])).ok, false)
  assert.equal(sniffDocument(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]), DEAL_ROOM_MAX_BYTES + 1).error, 'too_large')
  assert.equal(sanitiseFileName('../../Board pack!.pdf'), 'Board pack.pdf')
  assert.equal(sanitiseFileName('   '), 'document')
  assert.equal(stampedDownloadName('Site plan.png'), 'Site plan.pdf')
  assert.equal(stampedDownloadName('Board pack.pdf'), 'Board pack.pdf')
  assert.equal(documentStampSupported('application/pdf'), true)
  assert.equal(documentStampSupported('image/png'), true)
  assert.equal(documentStampSupported('image/jpeg'), true)
  assert.equal(documentStampSupported('image/gif'), false)
})

test('stamped pdf bytes contain the viewer email and not another member', async () => {
  const plain = await PDFDocument.create()
  plain.addPage([400, 400])
  const source = await plain.save()
  const line = watermarkLine({ name: 'Example Viewer', email: VIEWER_EMAIL, at: WHEN, roomId: ROOM })
  const stamped = await stampDocument({ PDFDocument, StandardFonts, rgb }, source, 'application/pdf', line)
  assert.equal(stamped.ok, true)
  if (!stamped.ok) return
  const text = pdfText(stamped.bytes)
  assert.equal(text.includes(VIEWER_EMAIL), true)
  assert.equal(text.includes(OTHER_EMAIL), false)
  assert.equal(text.includes(UPLOADER_EMAIL), false)
  const image = await stampDocument({ PDFDocument, StandardFonts, rgb }, PNG, 'image/png', line)
  assert.equal(image.ok, true)
  if (!image.ok) return
  const imageText = pdfText(image.bytes)
  assert.equal(imageText.includes(VIEWER_EMAIL), true)
  assert.equal(imageText.includes(OTHER_EMAIL), false)
})

test('view stamps the caller only, and download stays off the wire', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  let signed = 0
  const deps = fakeDeps(calls, {
    onSign: () => {
      signed += 1
    },
  })
  const denied = await handleDealRoomDocuments(
    post({ action: 'download', document_id: DOC, viewer_email: OTHER_EMAIL }),
    deps,
  )
  assert.equal(denied.status, 403)
  assert.equal(signed, 0)
  const body = (await denied.json()) as { error?: string }
  assert.equal(body.error, 'Downloads are turned off for this file.')
  assert.equal(calls.some((call) => call.name === 'room_document_viewer_identity'), false)

  calls.length = 0
  const viewed = await handleDealRoomDocuments(
    post({ action: 'view', document_id: DOC, viewer_email: OTHER_EMAIL, email: UPLOADER_EMAIL }),
    deps,
  )
  assert.equal(viewed.status, 200)
  const viewBody = (await viewed.json()) as { stamp?: string; file_base64?: string }
  assert.equal(viewBody.stamp?.includes(VIEWER_EMAIL), true)
  assert.equal(viewBody.stamp?.includes(OTHER_EMAIL), false)
  assert.equal(viewBody.stamp?.includes(UPLOADER_EMAIL), false)
  const identity = calls.find((call) => call.name === 'room_document_viewer_identity')
  assert.equal(identity?.args.p_actor, VIEWER)
  assert.equal(signed, 0)
  assert.equal(typeof viewBody.file_base64, 'string')

  const expired = await handleDealRoomDocuments(post({ action: 'view', document_id: DOC }), fakeDeps(calls, { hold: 'expired' }))
  assert.equal(expired.status, 403)
  assert.equal(((await expired.json()) as { error?: string }).error, 'Access expired')

  const hidden = await handleDealRoomDocuments(post({ action: 'download', document_id: DOC }), fakeDeps(calls, { hold: 'hidden' }))
  assert.equal(hidden.status, 404)
  assert.equal(signed, 0)
})

test('download returns stamped bytes and never signs the stored original', async () => {
  const plain = await PDFDocument.create()
  plain.addPage([400, 400])
  const source = await plain.save()
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const signed: string[] = []
  const deps = fakeDeps(calls, {
    downloadAllowed: true,
    mime: 'application/pdf',
    fileName: 'Board pack.pdf',
    fileBytes: source,
    stamp: (bytes, mime, line) => stampDocument({ PDFDocument, StandardFonts, rgb }, bytes, mime, line),
    onSign: (path) => signed.push(path),
  })
  const response = await handleDealRoomDocuments(
    post({ action: 'download', document_id: DOC, email: OTHER_EMAIL, room_id: OTHER, viewer_email: UPLOADER_EMAIL }),
    deps,
  )
  assert.equal(response.status, 200)
  const body = (await response.json()) as { file_base64?: string; stamp?: string; url?: string; file_name?: string }
  assert.equal(body.url, undefined)
  assert.equal(body.file_name, 'Board pack.pdf')
  assert.equal(body.stamp?.includes(VIEWER_EMAIL), true)
  assert.equal(body.stamp?.includes(OTHER_EMAIL), false)
  assert.equal(body.stamp?.includes(UPLOADER_EMAIL), false)
  assert.equal(typeof body.file_base64, 'string')
  const text = pdfText(Buffer.from(body.file_base64 || '', 'base64'))
  assert.equal(text.includes(VIEWER_EMAIL), true)
  assert.equal(text.includes(OTHER_EMAIL), false)
  assert.equal(text.includes(UPLOADER_EMAIL), false)
  assert.equal(signed.length, 0)
  assert.equal(JSON.stringify(body).includes(PATH), false)
  assert.equal(JSON.stringify(body).includes('/source'), false)
  const identity = calls.find((call) => call.name === 'room_document_viewer_identity')
  assert.equal(identity?.args.p_actor, VIEWER)
  assert.equal(calls.some((call) => call.name === 'record_room_document_event' && call.args.p_action === 'download'), true)

  calls.length = 0
  const imageCalls: { name: string; args: Record<string, unknown> }[] = []
  const imageSigned: string[] = []
  const image = await handleDealRoomDocuments(
    post({ action: 'download', document_id: DOC }),
    fakeDeps(imageCalls, {
      downloadAllowed: true,
      mime: 'image/png',
      fileName: 'Site plan.png',
      fileBytes: PNG,
      stamp: (bytes, mime, line) => stampDocument({ PDFDocument, StandardFonts, rgb }, bytes, mime, line),
      onSign: (path) => imageSigned.push(path),
    }),
  )
  assert.equal(image.status, 200)
  const imageBody = (await image.json()) as { file_base64?: string; file_name?: string; url?: string }
  assert.equal(imageBody.url, undefined)
  assert.equal(imageBody.file_name, 'Site plan.pdf')
  assert.equal(pdfText(Buffer.from(imageBody.file_base64 || '', 'base64')).includes(VIEWER_EMAIL), true)
  assert.equal(imageSigned.length, 0)
  assert.equal(imageSigned.includes(PATH), false)
})

test('download refuses a type that cannot be stamped', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const signed: string[] = []
  const response = await handleDealRoomDocuments(
    post({ action: 'download', document_id: DOC }),
    fakeDeps(calls, {
      downloadAllowed: true,
      mime: 'image/gif',
      onSign: (path) => signed.push(path),
    }),
  )
  assert.equal(response.status, 403)
  assert.equal(((await response.json()) as { error?: string }).error, 'This file can be viewed but not downloaded.')
  assert.equal(signed.length, 0)
  assert.equal(calls.some((call) => call.name === 'record_room_document_event'), false)
  assert.equal(calls.some((call) => call.name === 'room_document_viewer_identity'), false)
  const refused = await stampDocument({ PDFDocument, StandardFonts, rgb }, PNG, 'image/gif', 'Example Viewer')
  assert.equal(refused.ok, false)
  if (!refused.ok) assert.equal(refused.error, 'unstampable')
})

test('cross-room and non-participant downloads are refused without signing the original', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const signed: string[] = []
  const hidden = await handleDealRoomDocuments(
    post({ action: 'download', document_id: DOC, room_id: OTHER }),
    fakeDeps(calls, { hold: 'hidden', downloadAllowed: true, onSign: (path) => signed.push(path) }),
  )
  assert.equal(hidden.status, 404)
  assert.equal(((await hidden.json()) as { error?: string }).error, 'Not found')

  const outsider = await handleDealRoomDocuments(
    post({ action: 'download', document_id: DOC }),
    fakeDeps(calls, { openError: 'not_participant', downloadAllowed: true, onSign: (path) => signed.push(path) }),
  )
  assert.equal(outsider.status, 403)
  assert.equal(((await outsider.json()) as { error?: string }).error, 'Not allowed')
  assert.equal(signed.length, 0)
  assert.equal(signed.includes(PATH), false)
})

test('upload rejects a declared body over 20 MB before reading it', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const tooBig = String(DEAL_ROOM_MAX_BYTES + DEAL_ROOM_UPLOAD_OVERHEAD + 1)
  assert.equal(uploadDeclaredTooLarge(tooBig), true)
  assert.equal(uploadDeclaredTooLarge(String(DEAL_ROOM_MAX_BYTES + DEAL_ROOM_UPLOAD_OVERHEAD)), false)
  assert.equal(uploadDeclaredTooLarge(null), false)
  const response = await handleDealRoomDocuments(
    new Request('https://example.com/functions/v1/deal-room-documents', {
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=bound',
        'content-length': tooBig,
      },
      body: '--bound--',
    }),
    fakeDeps(calls),
  )
  assert.equal(response.status, 400)
  assert.equal(((await response.json()) as { error?: string }).error, 'This file is too large.')
  assert.equal(calls.length, 0)
})

test('upload rejects svg and oversize before insert, and hides the storage path', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const svg = await handleDealRoomDocuments(form(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'note.svg'), fakeDeps(calls))
  assert.equal(svg.status, 400)
  assert.equal(calls.some((call) => call.name === 'insert_room_document'), false)

  calls.length = 0
  const saved = await handleDealRoomDocuments(form(PNG, 'pack.png'), fakeDeps(calls))
  assert.equal(saved.status, 200)
  const savedBody = (await saved.json()) as Record<string, unknown>
  assert.equal(savedBody.storage_path, undefined)
  assert.equal(JSON.stringify(savedBody).includes('/source'), false)
  assert.equal(calls.some((call) => call.name === 'insert_room_document' && call.args.p_actor === VIEWER), true)
})

test('list drops storage paths and mailboxes, and staff counts stay numeric', () => {
  const presented = presentStaffDealRooms({
    rooms: [
      {
        id: ROOM,
        name: 'Example room',
        purpose: 'A room',
        status: 'open',
        opened_by: 'member',
        document_count: 2,
        file_name: 'Board pack.pdf',
        storage_path: PATH,
        email: UPLOADER_EMAIL,
        documents: [{ file_name: 'Board pack.pdf', email: OTHER_EMAIL }],
        participants: [],
      },
    ],
  })
  assert.equal(presented.length, 1)
  assert.equal(presented[0]?.documentCount, 2)
  const encoded = JSON.stringify(presented)
  assert.equal(encoded.includes('Board pack.pdf'), false)
  assert.equal(encoded.includes(UPLOADER_EMAIL), false)
  assert.equal(encoded.includes(OTHER_EMAIL), false)
  assert.equal(encoded.includes(PATH), false)
})

test('list response drops mailbox and storage path', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const response = await handleDealRoomDocuments(post({ action: 'list', room_id: ROOM }), fakeDeps(calls))
  assert.equal(response.status, 200)
  const encoded = JSON.stringify(await response.json())
  assert.equal(encoded.includes('Board pack.pdf'), true)
  assert.equal(encoded.includes(UPLOADER_EMAIL), false)
  assert.equal(encoded.includes(OTHER_EMAIL), false)
  assert.equal(encoded.includes(PATH), false)
})

test('migration slot, close stamp, and retention interval are locked', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  const migrationName = '20261209140000_deal_room_documents.sql'
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261209120000_application_answers_at_admission.sql'))
  const sql = readFileSync(path.join(root, 'supabase/migrations', migrationName), 'utf8')
  assert.equal(/search_path\s*=\s*public/i.test(sql), false)
  assert.equal(sql.includes('\u2014') || sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/nammco/i.test(sql), false)
  assert.equal(sql.toLowerCase().includes('the desk'), false)
  assert.match(sql, /interval '30 days'/)
  assert.match(sql, /closed_at = coalesce\(closed_at, pg_catalog\.now\(\)\)/)
  assert.match(sql, /deal-room-documents/)
  assert.match(sql, /note_staff_shared_read/)
  assert.match(sql, /download_allowed boolean not null default false/)
  assert.equal(/for\s+insert\b/i.test(sql), false)
  assert.equal(/to anon/.test(sql), false)
  const client = readFileSync(path.join(root, 'src/lib/dealRoomDocumentApi.ts'), 'utf8')
  assert.equal(/\.from\(/.test(client), false)
  assert.equal(client.includes('\u2014'), false)
  assert.equal(client.includes('payload.url'), false)
  const edge = readFileSync(path.join(root, 'supabase/functions/deal-room-documents/index.ts'), 'utf8')
  assert.equal(edge.includes('createSignedUrl'), false)
  assert.equal(edge.includes('getPublicUrl'), false)
  const page = readFileSync(path.join(root, 'src/pages/dashboard/DealRoomPage.tsx'), 'utf8')
  assert.equal(page.includes('window.open'), false)
  const panel = readFileSync(path.join(root, 'src/pages/dashboard/DealRoomDocuments.tsx'), 'utf8')
  assert.match(panel, /Views and downloads are watermarked and logged\./)
  assert.match(panel, /The saved copy carries the same watermark\./)
  assert.equal(panel.includes('viewed pages'), false)
  assert.equal(panel.toLowerCase().includes('original'), false)
  const policy = contentSecurityPolicy({
    supabaseUrl: 'https://example.supabase.co',
    analyticsFlag: 'false',
    posthogHost: '',
    scriptHashes: [],
  })
  assert.match(policy, /frame-src https:\/\/challenges\.cloudflare\.com blob:/)
  assert.match(policy, /worker-src 'self' blob:/)
  assert.equal(policy.includes('frame-src https://challenges.cloudflare.com blob: data:'), false)
})

function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1')
  const parts = [raw]
  const streams = raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)
  for (const match of streams) {
    const body = match[1] ?? ''
    try {
      parts.push(inflateSync(Buffer.from(body, 'latin1')).toString('latin1'))
    } catch {
      parts.push(body)
    }
  }
  return parts.join('\n').replace(/<([0-9A-Fa-f]+)>/g, (_full, hex: string) => {
    let text = ''
    for (let index = 0; index < hex.length; index += 2) {
      text += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16))
    }
    return text
  })
}

function post(body: unknown): Request {
  return new Request('https://example.com/functions/v1/deal-room-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function form(bytes: Uint8Array, name: string): Request {
  const data = new FormData()
  data.set('room_id', ROOM)
  data.set('file', new File([bytes], name, { type: 'application/octet-stream' }))
  return new Request('https://example.com/functions/v1/deal-room-documents', { method: 'POST', body: data })
}

function fakeDeps(
  calls: { name: string; args: Record<string, unknown> }[],
  options: {
    hold?: 'open' | 'expired' | 'hidden'
    downloadAllowed?: boolean
    mime?: string
    fileName?: string
    fileBytes?: Uint8Array
    openError?: string
    stamp?: DocumentDeps['stamp']
    onSign?: (path: string, expiresIn: number) => void
  } = {},
): DocumentDeps {
  const hold = options.hold ?? 'open'
  const downloadAllowed = options.downloadAllowed ?? false
  return {
    open: async () => gate(calls, hold, downloadAllowed, options),
    now: () => WHEN,
    countPages: async () => ({ ok: true, pages: 1 }),
    stamp:
      options.stamp ??
      (async (bytes, _mime, line) => ({
        ok: true as const,
        bytes: new TextEncoder().encode(line + Buffer.from(bytes).toString('base64url').slice(0, 8)),
      })),
    storage: {
      upload: async () => ({ error: null }),
      download: async () => ({ bytes: options.fileBytes ?? PNG, error: null }),
      remove: async () => ({ error: null }),
      sign: async (path, expiresIn) => {
        options.onSign?.(path, expiresIn)
        return { url: 'https://example.com/signed', error: null }
      },
    },
  }
}

function gate(
  calls: { name: string; args: Record<string, unknown> }[],
  hold: 'open' | 'expired' | 'hidden',
  downloadAllowed: boolean,
  options: { mime?: string; fileName?: string; openError?: string } = {},
): DealGate {
  const caller: DealCaller = {
    userId: VIEWER,
    memberStatus: 'active',
    seat: 'ksa',
    staff: false,
    aal: 'aal2',
  }
  return {
    caller,
    loadRoom: async () => ({ status: 'open', openedBy: 'member' }),
    loadParticipant: async () => 'accepted',
    loadTarget: async () => null,
    call: async (name, args) => {
      calls.push({ name, args })
      if (name === 'room_document_open_for') {
        if (options.openError) return { data: null, error: { message: options.openError } }
        if (hold === 'hidden') return { data: { ok: true, hold: 'hidden' }, error: null }
        return {
          data: {
            ok: true,
            hold,
            room_id: ROOM,
            storage_path: PATH,
            file_name: options.fileName ?? 'Board pack.pdf',
            mime: options.mime ?? 'image/png',
            download_allowed: downloadAllowed,
            uploaded_by: OTHER,
          },
          error: null,
        }
      }
      if (name === 'room_document_viewer_identity') {
        return { data: { full_name: 'Example Viewer', email: VIEWER_EMAIL }, error: null }
      }
      if (name === 'insert_room_document') {
        return { data: { ok: true, id: DOC, storage_path: PATH, file_name: 'pack.png' }, error: null }
      }
      if (name === 'list_room_documents') {
        return {
          data: {
            documents: [{ id: DOC, file_name: 'Board pack.pdf', email: UPLOADER_EMAIL, storage_path: PATH, expired: false }],
            events: [{ id: DOC, file_name: 'Board pack.pdf', member_name: 'Example Viewer', action: 'view', at: WHEN.toISOString(), email: OTHER_EMAIL }],
          },
          error: null,
        }
      }
      return { data: { ok: true }, error: null }
    },
  }
}

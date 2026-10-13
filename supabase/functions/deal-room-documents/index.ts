import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { DEAL_ROOM_BUCKET } from '../_shared/deal_room_documents.ts'
import { handleDealRoomDocuments } from '../_shared/deal_room_documents_http.ts'
import { countDocumentPages, stampDocument } from '../_shared/deal_room_pdf_stamp.ts'
import { openDealGate } from '../_shared/deal_room_session.ts'

const lib = { PDFDocument, StandardFonts, rgb }

Deno.serve((req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const admin = createClient(supabaseUrl, serviceKey)
  const bucket = admin.storage.from(DEAL_ROOM_BUCKET)
  return handleDealRoomDocuments(req, {
    open: openDealGate,
    now: () => new Date(),
    countPages: (bytes, mime) => countDocumentPages(lib, bytes, mime),
    stamp: (bytes, mime, line) => stampDocument(lib, bytes, mime, line),
    storage: {
      upload: async (path, bytes, mime) => {
        const { error } = await bucket.upload(path, bytes, { contentType: mime, upsert: false })
        return { error: error?.message ?? null }
      },
      download: async (path) => {
        const { data, error } = await bucket.download(path)
        if (error || !data) return { bytes: null, error: error?.message ?? 'missing' }
        return { bytes: new Uint8Array(await data.arrayBuffer()), error: null }
      },
      remove: async (path) => {
        const { error } = await bucket.remove([path])
        return { error: error?.message ?? null }
      },
      sign: async (path, expiresIn) => {
        const { data, error } = await bucket.createSignedUrl(path, expiresIn)
        return { url: data?.signedUrl ?? null, error: error?.message ?? null }
      },
    },
  })
})

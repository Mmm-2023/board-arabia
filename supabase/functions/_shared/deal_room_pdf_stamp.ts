import { DEAL_ROOM_PAGE_CAP, type DocumentMime } from './deal_room_documents.ts'

type Rgb = { red: number; green: number; blue: number }

export type StampPage = {
  getWidth: () => number
  getHeight: () => number
  drawText: (text: string, opts: { x: number; y: number; size: number; font: unknown; color: Rgb }) => void
  drawImage: (image: StampImage, opts: { x: number; y: number; width: number; height: number }) => void
}

export type StampImage = { width: number; height: number }

export type StampDoc = {
  getPageCount: () => number
  getPages: () => StampPage[]
  embedFont: (name: string) => Promise<unknown>
  embedPng: (bytes: Uint8Array) => Promise<StampImage>
  embedJpg: (bytes: Uint8Array) => Promise<StampImage>
  addPage: (size: [number, number]) => StampPage
  save: () => Promise<Uint8Array>
}

export type StampLib = {
  PDFDocument: {
    load: (bytes: Uint8Array) => Promise<StampDoc>
    create: () => Promise<StampDoc>
  }
  StandardFonts: { Helvetica: string }
  rgb: (red: number, green: number, blue: number) => Rgb
}

export async function countDocumentPages(
  lib: StampLib,
  bytes: Uint8Array,
  mime: DocumentMime,
): Promise<{ ok: true; pages: number } | { ok: false; error: 'too_many_pages' | 'invalid_file' }> {
  if (mime !== 'application/pdf') return { ok: true, pages: 1 }
  try {
    const pdf = await lib.PDFDocument.load(bytes)
    const pages = pdf.getPageCount()
    if (pages < 1 || pages > DEAL_ROOM_PAGE_CAP) return { ok: false, error: 'too_many_pages' }
    return { ok: true, pages }
  } catch {
    return { ok: false, error: 'invalid_file' }
  }
}

export async function stampDocument(
  lib: StampLib,
  bytes: Uint8Array,
  mime: DocumentMime,
  line: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: 'too_many_pages' | 'invalid_file' }> {
  try {
    const pdf = mime === 'application/pdf' ? await lib.PDFDocument.load(bytes) : await wrapImage(lib, bytes, mime)
    const pages = pdf.getPageCount()
    if (pages < 1 || pages > DEAL_ROOM_PAGE_CAP) return { ok: false, error: 'too_many_pages' }
    const font = await pdf.embedFont(lib.StandardFonts.Helvetica)
    const color = lib.rgb(0.45, 0.12, 0.12)
    for (const page of pdf.getPages()) drawStamp(page, line, font, color)
    const stamped = await pdf.save()
    return { ok: true, bytes: stamped }
  } catch {
    return { ok: false, error: 'invalid_file' }
  }
}

async function wrapImage(lib: StampLib, bytes: Uint8Array, mime: DocumentMime): Promise<StampDoc> {
  const pdf = await lib.PDFDocument.create()
  const image = mime === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  const page = pdf.addPage([image.width, image.height])
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  return pdf
}

function drawStamp(page: StampPage, line: string, font: unknown, color: Rgb) {
  const width = page.getWidth()
  const size = width < 280 ? 7 : 9
  page.drawText(line, { x: 24, y: 22, size, font, color })
  if (page.getHeight() > 160) {
    page.drawText(line, { x: 24, y: page.getHeight() - 36, size, font, color })
  }
}

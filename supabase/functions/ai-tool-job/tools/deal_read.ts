/**
 * Text from a teaser or information memorandum.
 * PDF uses the shared reader. A document file is the Word XML inside the zip.
 */

import { literalPdfText, readPdfText } from '../../_shared/pdf_text.ts'
import { strFromU8, unzipSync } from '../../_shared/fflate-browser.js'

export async function readDealUpload(mime: string, bytes: Uint8Array): Promise<string> {
  try {
    if (isDocx(mime, bytes)) return docxToText(bytes)
    if (isPdf(mime, bytes)) return await pdfText(bytes)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

export function docxToText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes) as Record<string, Uint8Array>
  } catch {
    return ''
  }
  const name = Object.keys(files).find((key) => /word\/document\.xml$/i.test(key))
  if (!name) return ''
  const xml = strFromU8(files[name])
  return xml
    .replace(/<w:p\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .trim()
}

function isPdf(mime: string, bytes: Uint8Array): boolean {
  if (mime === 'application/pdf') return true
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

function isDocx(mime: string, bytes: Uint8Array): boolean {
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true
  return bytes.length > 2 && bytes[0] === 0x50 && bytes[1] === 0x4b && mime.includes('wordprocessingml')
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const read = await readPdfText(bytes)
  const literal = literalPdfText(bytes)
  return read.text || literal
}

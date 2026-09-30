/**
 * Turn a CFO upload into text. PDF uses the shared reader. XLSX uses the
 * small vendored reader. CSV is decoded as text.
 */

import { literalPdfText, readPdfText } from '../../_shared/pdf_text.ts'
import { xlsxToText } from './xlsx_read.ts'

export async function readCfoUpload(mime: string, bytes: Uint8Array): Promise<string> {
  try {
    if (isXlsx(mime, bytes)) return xlsxToText(bytes)
    if (isPdf(mime, bytes)) return await pdfText(bytes)
    return decodeText(bytes)
  } catch {
    return ''
  }
}

function isPdf(mime: string, bytes: Uint8Array): boolean {
  if (mime === 'application/pdf') return true
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

function isXlsx(mime: string, bytes: Uint8Array): boolean {
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true
  return bytes.length > 2 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const read = await readPdfText(bytes)
  const literal = literalPdfText(bytes)
  if (read.text && /\d/.test(read.text)) return read.text
  return literal || read.text
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

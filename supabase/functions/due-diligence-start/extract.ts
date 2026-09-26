import { unzipSync, strFromU8 } from 'https://esm.sh/fflate@0.8.2'
import { MEMBER_MESSAGES, textFromOfficeXml, type DeckExt } from '../_shared/due_diligence.ts'
import { decidePdfText, readPdfText } from '../_shared/pdf_text.ts'

export function assertPptxSlides(bytes: Uint8Array) {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error(MEMBER_MESSAGES.notDeck)
  }
  const hasSlide = Object.keys(files).some((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  if (!hasSlide) throw new Error(MEMBER_MESSAGES.notDeck)
}

export async function textFromDeck(bytes: Uint8Array, ext: DeckExt): Promise<string> {
  const text = ext === 'pdf' ? await textFromPdf(bytes) : textFromPptx(bytes)
  const cleaned = text.replace(/\r/g, '\n').trim()
  if (cleaned.replace(/\s+/g, ' ').trim().length < 40) throw new Error(MEMBER_MESSAGES.unreadable)
  return cleaned.slice(0, 80_000)
}

async function textFromPdf(bytes: Uint8Array): Promise<string> {
  const decision = decidePdfText(await readPdfText(bytes))
  if (!decision.ok) {
    throw new Error(decision.reason === 'scanned' ? MEMBER_MESSAGES.scanned : MEMBER_MESSAGES.unreadable)
  }
  return decision.text
}

function textFromPptx(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error(MEMBER_MESSAGES.notDeck)
  }
  const slides = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b))
    .slice(0, 40)
  if (slides.length === 0) throw new Error(MEMBER_MESSAGES.notDeck)
  return slides
    .map((name) => textFromOfficeXml(strFromU8(files[name] || new Uint8Array())))
    .filter(Boolean)
    .join('\n')
}

function slideNumber(name: string): number {
  const match = name.match(/slide(\d+)\.xml$/)
  return match ? Number(match[1]) : 0
}

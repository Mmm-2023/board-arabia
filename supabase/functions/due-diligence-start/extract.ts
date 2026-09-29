import { unzipSync, strFromU8 } from '../_shared/fflate-browser.js'
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
  return (await readDeckSource(bytes, ext)).text
}

export async function readDeckSource(bytes: Uint8Array, ext: DeckExt): Promise<{ text: string; pages: string[] }> {
  const pages = ext === 'pdf' ? await pagesFromPdf(bytes) : pagesFromPptx(bytes)
  const cleaned = pages
    .map((page) => page.replace(/\r/g, '\n').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
  if (cleaned.replace(/\s+/g, ' ').trim().length < 40) throw new Error(MEMBER_MESSAGES.unreadable)
  return { text: cleaned.slice(0, 80_000), pages: pages.map((page) => page.replace(/\r/g, '\n').trim()) }
}

async function pagesFromPdf(bytes: Uint8Array): Promise<string[]> {
  const read = await readPdfText(bytes)
  const decision = decidePdfText(read)
  if (!decision.ok) {
    throw new Error(decision.reason === 'scanned' ? MEMBER_MESSAGES.scanned : MEMBER_MESSAGES.unreadable)
  }
  const pages = (read.pages ?? []).map((page) => page.replace(/\r/g, '\n').trim())
  if (pages.some((page) => page.length > 0)) return pages
  return [decision.text]
}

function pagesFromPptx(bytes: Uint8Array): string[] {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error(MEMBER_MESSAGES.notDeck)
  }
  const slides = Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  if (slides.length === 0) throw new Error(MEMBER_MESSAGES.notDeck)
  const byNumber = new Map<number, string>()
  for (const name of slides) {
    const number = slideNumber(name)
    if (number < 1 || number > 40) continue
    byNumber.set(number, textFromOfficeXml(strFromU8(files[name] || new Uint8Array())))
  }
  if (byNumber.size === 0) throw new Error(MEMBER_MESSAGES.notDeck)
  const max = Math.min(40, Math.max(...byNumber.keys()))
  const pages: string[] = []
  for (let index = 1; index <= max; index += 1) pages.push(byNumber.get(index) ?? '')
  return pages
}

function slideNumber(name: string): number {
  const match = name.match(/slide(\d+)\.xml$/)
  return match ? Number(match[1]) : 0
}

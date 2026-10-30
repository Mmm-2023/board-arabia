/**
 * File names and deck titles are sometimes UTF-8 bytes read as Latin-1,
 * once or twice. Mac Roman curly quotes read as Latin-1 show up as U+00D2
 * and U+00D3. Repair both, then drop quote marks around the name.
 */

const CP1252_BYTE: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
}

const MOJIBAKE_MARK =
  /[\u0080-\u009F]|(?:\u00C2|\u00C3|\u00E2)[\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/

const ODD_TITLE = /[^\p{L}\p{M}\p{N} .,&'\u2019/:()+\u00B7\u2022|\-]/u

export function titleHasOddChars(value: string): boolean {
  if (/[\u0000-\u001F\u007F-\u009F\uFFFD]/u.test(value)) return true
  return ODD_TITLE.test(value)
}

function mojibakeScore(value: string): number {
  let score = 0
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code >= 0x80 && code <= 0x9f) score += 3
    if (code === 0xfffd) score += 5
  }
  const marks = value.match(
    /(?:\u00C2|\u00C3|\u00E2)[\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/g,
  )
  return score + (marks?.length ?? 0) * 2
}

function bytesFromMisread(value: string): Uint8Array | null {
  const bytes: number[] = []
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0xff) {
      bytes.push(code)
      continue
    }
    const mapped = CP1252_BYTE[code]
    if (mapped == null) return null
    bytes.push(mapped)
  }
  return new Uint8Array(bytes)
}

function repairUtf8Misread(value: string): string {
  let current = value
  for (let pass = 0; pass < 2; pass += 1) {
    if (!MOJIBAKE_MARK.test(current)) break
    const bytes = bytesFromMisread(current)
    if (!bytes) break
    let decoded = ''
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      break
    }
    if (!decoded || decoded === current || decoded.includes('\uFFFD')) break
    if (mojibakeScore(decoded) >= mojibakeScore(current)) break
    current = decoded
  }
  return current
}

function mapMacRomanQuotes(value: string): string {
  return value.replace(/\u00D2/g, '\u201C').replace(/\u00D3/g, '\u201D')
}

const QUOTE_CODES = new Set([
  0x22, 0x27, 0x201c, 0x201d, 0x2018, 0x2019, 0x00ab, 0x00bb, 0x2039, 0x203a,
])
const DOUBLE_QUOTE_CODES = new Set([0x22, 0x201c, 0x201d, 0x00ab, 0x00bb])
const SINGLE_QUOTE_CODES = new Set([0x2018, 0x2019, 0x2039, 0x203a])

function isQuote(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return QUOTE_CODES.has(code)
}

function stripTitleQuotes(value: string): string {
  let text = value.replace(/(?:["']|\u201C|\u201D|\u2018|\u2019|\u00AB|\u00BB|\u2039|\u203A)+(?=\.(?:pdf|pptx|ppt|docx|doc)\b)/gi, '')
  let prev = ''
  while (text !== prev) {
    prev = text
    let start = 0
    while (start < text.length && (isQuote(text[start] ?? '') || (text[start] ?? '') === ' ')) start += 1
    let end = text.length
    while (end > start && (isQuote(text[end - 1] ?? '') || (text[end - 1] ?? '') === ' ')) end -= 1
    text = text.slice(start, end).trim()
  }
  let out = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    const code = char.codePointAt(0) ?? 0
    if (DOUBLE_QUOTE_CODES.has(code)) continue
    if (SINGLE_QUOTE_CODES.has(code)) {
      const prevChar = text[index - 1] ?? ''
      const nextChar = text[index + 1] ?? ''
      const atEdge = prevChar === '' || prevChar === ' ' || nextChar === '' || nextChar === ' '
      if (atEdge) continue
    }
    out += char
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Repair a file name or deck title. A normal name is returned unchanged. */
export function repairDeckLabel(raw: string): string {
  const text = mapMacRomanQuotes(repairUtf8Misread(raw.normalize('NFC')))
  return stripTitleQuotes(text)
}

function fileStem(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '').trim()
  return repairDeckLabel(base).replace(/\.(pdf|pptx|ppt|docx|doc)$/i, '').trim()
}

function stripOddChars(value: string): string {
  return value.replace(/[^\p{L}\p{M}\p{N} .,&'\u2019/:()+\u00B7\u2022|\-]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Use the repaired company. If odd characters remain, use the file name.
 * An empty company stays empty so the caller can keep its own fallback.
 */
export function cleanCompanyName(company: string, fileName: string): string {
  const fromCompany = repairDeckLabel(company)
  if (fromCompany && !titleHasOddChars(fromCompany)) return fromCompany
  if (!fromCompany) return ''
  const fromFile = fileStem(fileName)
  if (fromFile && !titleHasOddChars(fromFile)) return fromFile
  return stripOddChars(fromFile)
}

/** Last pass before a company name is stored. Does not invent a file name. */
export function persistCompanyLabel(company: string): string {
  const repaired = repairDeckLabel(company)
  if (!titleHasOddChars(repaired)) return repaired
  return stripOddChars(repaired) || repaired
}

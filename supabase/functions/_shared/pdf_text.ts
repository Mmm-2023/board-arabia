/**
 * Edge-safe PDF text read. No pdf.js bundle.
 * Inflates FlateDecode streams, follows classic xref and xref streams,
 * reads object streams, and applies ToUnicode when a font provides one.
 * Literal (text) Tj strings stay as a fallback for uncompressed decks.
 */

export type PdfRead = {
  text: string
  textOps: number
  imageOps: number
  encrypted: boolean
}

export function decidePdfText(
  read: PdfRead,
): { ok: true; text: string } | { ok: false; reason: 'scanned' | 'unreadable' } {
  const cleaned = read.text.replace(/\s+/g, ' ').trim()
  if (cleaned.length >= 40) return { ok: true, text: read.text.replace(/\r/g, '\n').trim() }
  if (!read.encrypted && read.imageOps > 0 && read.textOps === 0) return { ok: false, reason: 'scanned' }
  return { ok: false, reason: 'unreadable' }
}

type XEntry =
  | { kind: 'off'; offset: number }
  | { kind: 'objstm'; stream: number; index: number }
  | { kind: 'free' }

type PdfName = { t: 'name'; v: string }
type PdfRef = { t: 'ref'; n: number }
type PdfStr = { t: 'str'; v: Uint8Array }
type PdfNum = { t: 'num'; v: number }
type PdfArr = { t: 'arr'; v: PdfVal[] }
type PdfDict = { t: 'dict'; v: Map<string, PdfVal>; raw?: Uint8Array; decoded?: Uint8Array }
type PdfVal = PdfName | PdfRef | PdfStr | PdfNum | { t: 'bool'; v: boolean } | { t: 'null' } | PdfArr | PdfDict

type CMap = {
  spaces: { start: number; end: number; len: number }[]
  maps: { len: number; start: number; end: number; mode: 'inc' | 'list'; base: string; list?: string[] }[]
}

type FontDec = { cmap: CMap | null; encoding: string; differences: Map<number, string> }

const WINANSI: Record<number, string> = {
  0x80: '\u20ac',
  0x82: '\u201a',
  0x83: '\u0192',
  0x84: '\u201e',
  0x85: '\u2026',
  0x86: '\u2020',
  0x87: '\u2021',
  0x88: '\u02c6',
  0x89: '\u2030',
  0x8a: '\u0160',
  0x8b: '\u2039',
  0x8c: '\u0152',
  0x8e: '\u017d',
  0x91: '\u2018',
  0x92: '\u2019',
  0x93: '\u201c',
  0x94: '\u201d',
  0x95: '\u2022',
  0x96: '\u2013',
  0x97: '\u2014',
  0x98: '\u02dc',
  0x99: '\u2122',
  0x9a: '\u0161',
  0x9b: '\u203a',
  0x9c: '\u0153',
  0x9e: '\u017e',
  0x9f: '\u0178',
}

export async function readPdfText(bytes: Uint8Array): Promise<PdfRead> {
  const empty: PdfRead = { text: '', textOps: 0, imageOps: 0, encrypted: false }
  try {
    const doc = await openPdf(bytes)
    if (!doc) {
      const literal = literalPdfText(bytes)
      return { text: literal, textOps: literal.trim().length >= 40 ? 1 : 0, imageOps: 0, encrypted: false }
    }
    const walked = await walkPages(doc)
    let text = walked.text
    let textOps = walked.textOps
    const literalRaw = literalPdfText(bytes)
    const literalStreams = literalPdfText(doc.streamBytes)
    const literal = longerText(literalRaw, literalStreams)
    if (textLength(literal) > textLength(text)) {
      text = literal
      if (textLength(literal) >= 40) textOps = Math.max(textOps, 1)
    }
    return { text, textOps, imageOps: walked.imageOps, encrypted: doc.encrypted }
  } catch {
    const literal = literalPdfText(bytes)
    return { ...empty, text: literal, textOps: textLength(literal) >= 40 ? 1 : 0 }
  }
}

export function literalPdfText(bytes: Uint8Array): string {
  const raw = latin1(bytes)
  const parts: string[] = []
  const re = /\((?:\\\)|\\.|[^\\)]){3,}\)(?=\s*Tj)/g
  for (const match of raw.matchAll(re)) {
    const text = decodeLiteral(match[0].slice(1, -1))
    if (/[A-Za-z]{3,}/.test(text)) parts.push(text)
  }
  return parts.join('\n')
}

type Opened = {
  load: (n: number) => Promise<PdfVal | null>
  root: PdfDict | null
  encrypted: boolean
  streamBytes: Uint8Array
}

async function openPdf(bytes: Uint8Array): Promise<Opened | null> {
  const entries = new Map<number, XEntry>()
  let trailer = await readXrefChain(bytes, entries)
  if (!trailer) trailer = scanObjects(bytes, entries)
  if (!entries.size) return null
  const encrypted = trailer ? hasName(trailer, 'Encrypt') : false
  const cache = new Map<number, PdfVal | null>()
  const objstmCache = new Map<number, PdfVal[]>()
  const decodedStreams: Uint8Array[] = []

  async function load(n: number): Promise<PdfVal | null> {
    if (cache.has(n)) return cache.get(n) ?? null
    cache.set(n, null)
    const entry = entries.get(n)
    if (!entry || entry.kind === 'free') return null
    try {
      if (entry.kind === 'objstm') {
        const packed = await loadObjStm(entry.stream)
        const value = packed[entry.index] ?? null
        cache.set(n, value)
        return value
      }
      const value = await parseAt(bytes, entry.offset, decodedStreams)
      cache.set(n, value)
      return value
    } catch {
      return null
    }
  }

  async function loadObjStm(streamNum: number): Promise<PdfVal[]> {
    const cached = objstmCache.get(streamNum)
    if (cached) return cached
    const obj = await load(streamNum)
    if (!obj || obj.t !== 'dict') return []
    const data = await decoded(obj)
    const count = numOf(obj, 'N') ?? 0
    const first = numOf(obj, 'First') ?? 0
    if (!data || count <= 0 || first < 0 || first > data.length) return []
    const header = latin1(data.subarray(0, first)).trim().split(/\s+/)
    const values: PdfVal[] = []
    for (let i = 0; i < count; i += 1) {
      const offset = Number(header[i * 2 + 1])
      if (!Number.isFinite(offset)) {
        values.push({ t: 'null' })
        continue
      }
      try {
        values.push(parseValue(new Cursor(data, first + offset)))
      } catch {
        values.push({ t: 'null' })
      }
    }
    objstmCache.set(streamNum, values)
    return values
  }

  const rootVal = trailer ? await resolve(trailer.v.get('Root') ?? null, load) : null
  const root = rootVal && rootVal.t === 'dict' ? rootVal : null
  const streamBytes = concatBytes(decodedStreams)
  return { load, root, encrypted, streamBytes }
}

async function walkPages(doc: Opened): Promise<{ text: string; textOps: number; imageOps: number }> {
  const pages: string[] = []
  let textOps = 0
  let imageOps = 0
  if (!doc.root) return { text: '', textOps, imageOps }

  async function walk(node: PdfVal | null, inherited: PdfDict | null, depth: number) {
    if (!node || node.t !== 'dict' || depth > 12) return
    const resourcesVal = await resolve(node.v.get('Resources') ?? null, doc.load)
    const resources = resourcesVal && resourcesVal.t === 'dict' ? resourcesVal : inherited
    const kids = node.v.get('Kids')
    const contents = node.v.get('Contents')
    if (kids && kids.t === 'arr' && !contents) {
      for (const kid of kids.v) {
        const resolved = await resolve(kid, doc.load)
        await walk(resolved, resources, depth + 1)
      }
      return
    }
    if (!contents) return
    const fonts = await fontMap(resources, doc.load)
    const xobjects = await xobjectMap(resources, doc.load)
    const streams = await contentStreams(contents, doc.load)
    let page = ''
    for (const stream of streams) {
      const pulled = await pullContent(stream, fonts, xobjects, doc.load, 0)
      page += pulled.text
      textOps += pulled.textOps
      imageOps += pulled.imageOps
    }
    if (page.trim()) pages.push(page)
  }

  const pagesNode = await resolve(doc.root.v.get('Pages') ?? null, doc.load)
  await walk(pagesNode, null, 0)
  return { text: pages.join('\n'), textOps, imageOps }
}

async function contentStreams(contents: PdfVal, load: (n: number) => Promise<PdfVal | null>): Promise<Uint8Array[]> {
  const value = await resolve(contents, load)
  if (!value) return []
  if (value.t === 'dict') {
    const data = await decoded(value)
    return data ? [data] : []
  }
  if (value.t === 'arr') {
    const out: Uint8Array[] = []
    for (const item of value.v) {
      out.push(...(await contentStreams(item, load)))
    }
    return out
  }
  return []
}

async function pullContent(
  stream: Uint8Array,
  fonts: Map<string, FontDec>,
  xobjects: Map<string, PdfDict>,
  load: (n: number) => Promise<PdfVal | null>,
  depth: number,
): Promise<{ text: string; textOps: number; imageOps: number }> {
  let text = ''
  let textOps = 0
  let imageOps = 0
  let font: FontDec | null = fonts.values().next().value ?? null
  const stack: Token[] = []
  for (const token of tokenizeContent(stream)) {
    if (token.t !== 'op') {
      stack.push(token)
      continue
    }
    const op = token.v
    if (op === 'Tf') {
      const size = stack.pop()
      const name = stack.pop()
      if (name && name.t === 'name') font = fonts.get(name.v) ?? font
      void size
      continue
    }
    if (op === 'Tj' || op === "'" || op === '"') {
      if (op === '"') stack.pop()
      if (op === '"') stack.pop()
      const item = stack.pop()
      if (item && item.t === 'str') {
        textOps += 1
        text += showText(item.v, font)
      }
      if (op === "'" || op === '"') text += '\n'
      continue
    }
    if (op === 'TJ') {
      const item = stack.pop()
      if (item && item.t === 'arr') {
        textOps += 1
        for (const part of item.v) {
          if (part.t === 'str') text += showText(part.v, font)
          else if (part.t === 'num' && part.v <= -80) text += ' '
        }
      }
      continue
    }
    if (op === 'Td' || op === 'TD' || op === 'T*') {
      if (text && !text.endsWith('\n')) text += '\n'
      continue
    }
    if (op === 'Do') {
      const name = stack.pop()
      if (!name || name.t !== 'name') continue
      const xo = xobjects.get(name.v)
      if (!xo) continue
      const subtype = nameOf(xo, 'Subtype')
      if (subtype === 'Image') {
        imageOps += 1
        continue
      }
      if (subtype === 'Form' && depth < 3) {
        const data = await decoded(xo)
        if (!data) continue
        const resVal = await resolve(xo.v.get('Resources') ?? null, load)
        const res = resVal && resVal.t === 'dict' ? resVal : null
        const nestedFonts = res ? await fontMap(res, load) : fonts
        const nestedXo = res ? await xobjectMap(res, load) : xobjects
        const nested = await pullContent(data, nestedFonts, nestedXo, load, depth + 1)
        text += nested.text
        textOps += nested.textOps
        imageOps += nested.imageOps
      }
      continue
    }
    if (op === 'BI') imageOps += 1
  }
  return { text, textOps, imageOps }
}

function showText(bytes: Uint8Array, font: FontDec | null): string {
  if (font?.cmap) {
    const mapped = applyCMap(bytes, font.cmap)
    if (mapped.trim()) return mapped
  }
  if (font?.encoding === 'Identity-H' || font?.encoding === 'Identity-V') {
    const wide = utf16be(bytes)
    if (wide.trim()) return wide
  }
  if (font?.differences.size) {
    let out = ''
    for (const byte of bytes) {
      const diff = font.differences.get(byte)
      out += diff ? glyphName(diff) : winAnsiChar(byte)
    }
    return out
  }
  return winAnsi(bytes)
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: Uint8Array }
  | { t: 'name'; v: string }
  | { t: 'arr'; v: Token[] }
  | { t: 'op'; v: string }

function tokenizeContent(bytes: Uint8Array): Token[] {
  return readTokens(new Cursor(bytes, 0), false)
}

function readTokens(cursor: Cursor, inArray: boolean): Token[] {
  const tokens: Token[] = []
  while (cursor.i < cursor.bytes.length) {
    cursor.skipWs()
    if (cursor.i >= cursor.bytes.length) break
    const b = cursor.bytes[cursor.i] ?? 0
    if (inArray && b === 0x5d) {
      cursor.i += 1
      break
    }
    if (b === 0x25) {
      cursor.skipComment()
      continue
    }
    if (b === 0x28) {
      tokens.push({ t: 'str', v: cursor.readLiteral() })
      continue
    }
    if (b === 0x3c) {
      if (cursor.bytes[cursor.i + 1] === 0x3c) {
        cursor.i += 2
        skipDict(cursor)
        continue
      }
      tokens.push({ t: 'str', v: cursor.readHex() })
      continue
    }
    if (b === 0x5b) {
      cursor.i += 1
      tokens.push({ t: 'arr', v: readTokens(cursor, true) })
      continue
    }
    if (b === 0x2f) {
      tokens.push({ t: 'name', v: cursor.readName() })
      continue
    }
    if (b === 0x2b || b === 0x2d || b === 0x2e || isDigit(b)) {
      tokens.push({ t: 'num', v: cursor.readNumber() })
      continue
    }
    const word = cursor.readWord()
    if (word === 'BI') {
      skipInlineImage(cursor)
      tokens.push({ t: 'op', v: 'BI' })
      continue
    }
    if (word) tokens.push({ t: 'op', v: word })
  }
  return tokens
}

function skipDict(cursor: Cursor) {
  let depth = 1
  while (cursor.i < cursor.bytes.length && depth > 0) {
    if (cursor.bytes[cursor.i] === 0x3c && cursor.bytes[cursor.i + 1] === 0x3c) {
      depth += 1
      cursor.i += 2
      continue
    }
    if (cursor.bytes[cursor.i] === 0x3e && cursor.bytes[cursor.i + 1] === 0x3e) {
      depth -= 1
      cursor.i += 2
      continue
    }
    cursor.i += 1
  }
}

function skipInlineImage(cursor: Cursor) {
  const marker = latin1(cursor.bytes.subarray(cursor.i, Math.min(cursor.bytes.length, cursor.i + 2_000_000)))
  const at = marker.indexOf('EI')
  if (at >= 0) cursor.i += at + 2
}

class Cursor {
  bytes: Uint8Array
  i: number

  constructor(bytes: Uint8Array, i: number) {
    this.bytes = bytes
    this.i = i
  }

  skipWs() {
    while (this.i < this.bytes.length) {
      const b = this.bytes[this.i] ?? 0
      if (b === 0x25) {
        this.skipComment()
        continue
      }
      if (!isWs(b)) break
      this.i += 1
    }
  }

  skipComment() {
    while (this.i < this.bytes.length && this.bytes[this.i] !== 0x0a && this.bytes[this.i] !== 0x0d) this.i += 1
  }

  readWord(): string {
    const start = this.i
    while (this.i < this.bytes.length && !isDelim(this.bytes[this.i] ?? 0)) this.i += 1
    return latin1(this.bytes.subarray(start, this.i))
  }

  readNumber(): number {
    const start = this.i
    if (this.bytes[this.i] === 0x2b || this.bytes[this.i] === 0x2d) this.i += 1
    while (this.i < this.bytes.length && isDigit(this.bytes[this.i] ?? 0)) this.i += 1
    if (this.bytes[this.i] === 0x2e) {
      this.i += 1
      while (this.i < this.bytes.length && isDigit(this.bytes[this.i] ?? 0)) this.i += 1
    }
    return Number(latin1(this.bytes.subarray(start, this.i)))
  }

  readName(): string {
    this.i += 1
    let out = ''
    while (this.i < this.bytes.length && !isDelim(this.bytes[this.i] ?? 0)) {
      const b = this.bytes[this.i] ?? 0
      if (b === 0x23 && this.i + 2 < this.bytes.length) {
        const hex = latin1(this.bytes.subarray(this.i + 1, this.i + 3))
        out += String.fromCharCode(Number.parseInt(hex, 16))
        this.i += 3
        continue
      }
      out += String.fromCharCode(b)
      this.i += 1
    }
    return out
  }

  readLiteral(): Uint8Array {
    this.i += 1
    const out: number[] = []
    let depth = 1
    while (this.i < this.bytes.length && depth > 0) {
      const b = this.bytes[this.i] ?? 0
      if (b === 0x5c) {
        const n = this.bytes[this.i + 1] ?? 0
        if (n >= 0x30 && n <= 0x37) {
          let oct = ''
          let k = 1
          while (k <= 3 && (this.bytes[this.i + k] ?? 0) >= 0x30 && (this.bytes[this.i + k] ?? 0) <= 0x37) {
            oct += String.fromCharCode(this.bytes[this.i + k] ?? 0)
            k += 1
          }
          out.push(Number.parseInt(oct, 8) & 0xff)
          this.i += k
          continue
        }
        const map: Record<number, number> = { 0x6e: 0x0a, 0x72: 0x0d, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0c, 0x28: 0x28, 0x29: 0x29, 0x5c: 0x5c }
        out.push(map[n] ?? n)
        this.i += 2
        continue
      }
      if (b === 0x28) depth += 1
      if (b === 0x29) {
        depth -= 1
        if (depth === 0) {
          this.i += 1
          break
        }
      }
      out.push(b)
      this.i += 1
    }
    return Uint8Array.from(out)
  }

  readHex(): Uint8Array {
    this.i += 1
    let hex = ''
    while (this.i < this.bytes.length && this.bytes[this.i] !== 0x3e) {
      const b = this.bytes[this.i] ?? 0
      if (!isWs(b)) hex += String.fromCharCode(b)
      this.i += 1
    }
    if (this.bytes[this.i] === 0x3e) this.i += 1
    if (hex.length % 2) hex += '0'
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    return out
  }
}

function parseValue(cursor: Cursor): PdfVal {
  cursor.skipWs()
  const b = cursor.bytes[cursor.i] ?? 0
  if (b === 0x3c && cursor.bytes[cursor.i + 1] === 0x3c) return parseDict(cursor)
  if (b === 0x5b) return parseArray(cursor)
  if (b === 0x28) return { t: 'str', v: cursor.readLiteral() }
  if (b === 0x3c) return { t: 'str', v: cursor.readHex() }
  if (b === 0x2f) return { t: 'name', v: cursor.readName() }
  if (b === 0x2b || b === 0x2d || b === 0x2e || isDigit(b)) {
    const num = cursor.readNumber()
    const mark = cursor.i
    cursor.skipWs()
    if (isDigit(cursor.bytes[cursor.i] ?? 0)) {
      const gen = cursor.readNumber()
      cursor.skipWs()
      if (cursor.readWord() === 'R') return { t: 'ref', n: num }
      void gen
    }
    cursor.i = mark
    return { t: 'num', v: num }
  }
  const word = cursor.readWord()
  if (word === 'true') return { t: 'bool', v: true }
  if (word === 'false') return { t: 'bool', v: false }
  return { t: 'null' }
}

function parseDict(cursor: Cursor): PdfDict {
  cursor.i += 2
  const map = new Map<string, PdfVal>()
  while (cursor.i < cursor.bytes.length) {
    cursor.skipWs()
    if (cursor.bytes[cursor.i] === 0x3e && cursor.bytes[cursor.i + 1] === 0x3e) {
      cursor.i += 2
      break
    }
    if (cursor.bytes[cursor.i] !== 0x2f) break
    const key = cursor.readName()
    map.set(key, parseValue(cursor))
  }
  return { t: 'dict', v: map }
}

function parseArray(cursor: Cursor): PdfArr {
  cursor.i += 1
  const values: PdfVal[] = []
  while (cursor.i < cursor.bytes.length) {
    cursor.skipWs()
    if (cursor.bytes[cursor.i] === 0x5d) {
      cursor.i += 1
      break
    }
    values.push(parseValue(cursor))
  }
  return { t: 'arr', v: values }
}

async function parseAt(bytes: Uint8Array, offset: number, sink: Uint8Array[]): Promise<PdfVal | null> {
  const cursor = new Cursor(bytes, offset)
  cursor.skipWs()
  if (!isDigit(cursor.bytes[cursor.i] ?? 0)) return null
  cursor.readNumber()
  cursor.skipWs()
  cursor.readNumber()
  cursor.skipWs()
  if (cursor.readWord() !== 'obj') return null
  const value = parseValue(cursor)
  if (value.t !== 'dict') return value
  cursor.skipWs()
  if (latin1(cursor.bytes.subarray(cursor.i, cursor.i + 6)) !== 'stream') return value
  cursor.i += 6
  if (cursor.bytes[cursor.i] === 0x0d) cursor.i += 1
  if (cursor.bytes[cursor.i] === 0x0a) cursor.i += 1
  const length = numOf(value, 'Length')
  let raw: Uint8Array
  if (length != null && length >= 0 && cursor.i + length <= bytes.length) {
    raw = bytes.subarray(cursor.i, cursor.i + length)
  } else {
    const rest = latin1(bytes.subarray(cursor.i))
    const end = rest.indexOf('endstream')
    raw = bytes.subarray(cursor.i, cursor.i + Math.max(0, end))
  }
  value.raw = raw
  const data = await decoded(value)
  if (data && sink.length < 40) sink.push(data.subarray(0, Math.min(data.length, 200_000)))
  return value
}

async function decoded(dict: PdfDict): Promise<Uint8Array | null> {
  if (dict.decoded) return dict.decoded
  if (!dict.raw) return null
  let data = dict.raw
  const filters = filterList(dict)
  const predictor = predictorOf(dict)
  try {
    for (const filter of filters) {
      if (filter === 'FlateDecode' || filter === 'Fl') data = await inflateZlib(data)
      else if (filter === 'ASCIIHexDecode' || filter === 'AHx') data = hexBytes(latin1(data).replace(/\s+/g, ''))
      else if (filter === 'ASCII85Decode' || filter === 'A85') data = ascii85(data)
      else return null
    }
  } catch {
    return null
  }
  if (predictor > 1) return null
  dict.decoded = data
  return data
}

function filterList(dict: PdfDict): string[] {
  const filter = dict.v.get('Filter') ?? dict.v.get('F')
  if (!filter) return []
  if (filter.t === 'name') return [filter.v]
  if (filter.t === 'arr') return filter.v.flatMap((item) => (item.t === 'name' ? [item.v] : []))
  return []
}

function predictorOf(dict: PdfDict): number {
  const parms = dict.v.get('DecodeParms') ?? dict.v.get('DP')
  const dicts = parms?.t === 'arr' ? parms.v : parms ? [parms] : []
  for (const item of dicts) {
    if (item.t === 'dict') {
      const value = numOf(item, 'Predictor')
      if (value && value > 1) return value
    }
  }
  return 1
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  try {
    return await decompress(data, 'deflate')
  } catch {
    return await decompress(data, 'deflate-raw')
  }
}

async function decompress(data: Uint8Array, format: 'deflate' | 'deflate-raw'): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readXrefChain(bytes: Uint8Array, entries: Map<number, XEntry>): Promise<PdfDict | null> {
  const raw = latin1(bytes)
  let at = raw.lastIndexOf('startxref')
  if (at < 0) return null
  const offset = Number(raw.slice(at + 'startxref'.length).trim().split(/\s+/)[0])
  if (!Number.isFinite(offset)) return null
  let cursor = offset
  let trailer: PdfDict | null = null
  const seen = new Set<number>()
  while (cursor >= 0 && !seen.has(cursor) && seen.size < 8) {
    seen.add(cursor)
    const next = await readOneXref(bytes, cursor, entries)
    if (!next) break
    if (!trailer) trailer = next.trailer
    const prev = next.trailer ? numOf(next.trailer, 'Prev') : null
    if (prev == null) break
    cursor = prev
  }
  return trailer
}

async function readOneXref(
  bytes: Uint8Array,
  offset: number,
  entries: Map<number, XEntry>,
): Promise<{ trailer: PdfDict | null } | null> {
  const cursor = new Cursor(bytes, offset)
  cursor.skipWs()
  if (latin1(cursor.bytes.subarray(cursor.i, cursor.i + 4)) === 'xref') {
    cursor.i += 4
    while (cursor.i < bytes.length) {
      cursor.skipWs()
      if (latin1(cursor.bytes.subarray(cursor.i, cursor.i + 7)) === 'trailer') break
      const start = cursor.readNumber()
      cursor.skipWs()
      const count = cursor.readNumber()
      for (let n = 0; n < count; n += 1) {
        cursor.skipWs()
        const pos = cursor.readNumber()
        cursor.skipWs()
        cursor.readNumber()
        cursor.skipWs()
        const flag = cursor.readWord()
        const obj = start + n
        if (entries.has(obj)) continue
        entries.set(obj, flag === 'n' ? { kind: 'off', offset: pos } : { kind: 'free' })
      }
    }
    cursor.skipWs()
    cursor.readWord()
    const trailer = parseValue(cursor)
    return { trailer: trailer.t === 'dict' ? trailer : null }
  }
  const value = await parseAt(bytes, offset, [])
  if (!value || value.t !== 'dict') return null
  const data = await decoded(value)
  if (!data) return { trailer: value }
  const widths = value.v.get('W')
  const index = value.v.get('Index')
  if (!widths || widths.t !== 'arr') return { trailer: value }
  const w = widths.v.map((item) => (item.t === 'num' ? item.v : 0))
  const idx: number[] = []
  if (index && index.t === 'arr') {
    for (const item of index.v) if (item.t === 'num') idx.push(item.v)
  } else {
    idx.push(0, numOf(value, 'Size') ?? 0)
  }
  let p = 0
  for (let s = 0; s < idx.length; s += 2) {
    let obj = idx[s] ?? 0
    const count = idx[s + 1] ?? 0
    for (let n = 0; n < count; n += 1, obj += 1) {
      const type = w[0] ? readInt(data, p, w[0] ?? 0) : 1
      p += w[0] ?? 0
      const field2 = readInt(data, p, w[1] ?? 0)
      p += w[1] ?? 0
      const field3 = readInt(data, p, w[2] ?? 0)
      p += w[2] ?? 0
      if (entries.has(obj)) continue
      if (type === 1) entries.set(obj, { kind: 'off', offset: field2 })
      else if (type === 2) entries.set(obj, { kind: 'objstm', stream: field2, index: field3 })
      else entries.set(obj, { kind: 'free' })
    }
  }
  return { trailer: value }
}

function scanObjects(bytes: Uint8Array, entries: Map<number, XEntry>): PdfDict | null {
  const raw = latin1(bytes)
  const re = /(\d+)\s+(\d+)\s+obj/g
  for (const match of raw.matchAll(re)) {
    const num = Number(match[1])
    const at = match.index ?? 0
    if (!entries.has(num)) entries.set(num, { kind: 'off', offset: at })
  }
  return null
}

async function fontMap(resources: PdfDict | null, load: (n: number) => Promise<PdfVal | null>): Promise<Map<string, FontDec>> {
  const map = new Map<string, FontDec>()
  if (!resources) return map
  const fonts = await resolve(resources.v.get('Font') ?? null, load)
  if (!fonts || fonts.t !== 'dict') return map
  for (const [name, ref] of fonts.v) {
    const font = await resolve(ref, load)
    if (!font || font.t !== 'dict') continue
    map.set(name, await fontDec(font, load))
  }
  return map
}

async function fontDec(font: PdfDict, load: (n: number) => Promise<PdfVal | null>): Promise<FontDec> {
  let encoding = nameOf(font, 'Encoding') ?? ''
  const differences = new Map<number, string>()
  const encodingVal = font.v.get('Encoding')
  if (encodingVal && encodingVal.t === 'dict') {
    encoding = nameOf(encodingVal, 'BaseEncoding') ?? 'WinAnsiEncoding'
    const diff = encodingVal.v.get('Differences')
    if (diff && diff.t === 'arr') {
      let code = 0
      for (const item of diff.v) {
        if (item.t === 'num') code = item.v
        else if (item.t === 'name') {
          differences.set(code, item.v)
          code += 1
        }
      }
    }
  }
  if (!encoding && nameOf(font, 'Subtype') === 'Type0') encoding = 'Identity-H'
  const toUnicode = await resolve(font.v.get('ToUnicode') ?? null, load)
  let cmap: CMap | null = null
  if (toUnicode && toUnicode.t === 'dict') {
    const data = await decoded(toUnicode)
    if (data) cmap = parseCMap(latin1(data))
  }
  return { cmap, encoding, differences }
}

async function xobjectMap(resources: PdfDict | null, load: (n: number) => Promise<PdfVal | null>): Promise<Map<string, PdfDict>> {
  const map = new Map<string, PdfDict>()
  if (!resources) return map
  const xobjects = await resolve(resources.v.get('XObject') ?? null, load)
  if (!xobjects || xobjects.t !== 'dict') return map
  for (const [name, ref] of xobjects.v) {
    const obj = await resolve(ref, load)
    if (obj && obj.t === 'dict') map.set(name, obj)
  }
  return map
}

async function resolve(value: PdfVal | null, load: (n: number) => Promise<PdfVal | null>): Promise<PdfVal | null> {
  if (!value) return null
  if (value.t !== 'ref') return value
  return load(value.n)
}

function parseCMap(text: string): CMap {
  const cmap: CMap = { spaces: [], maps: [] }
  for (const block of text.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      cmap.spaces.push({
        start: Number.parseInt(pair[1], 16),
        end: Number.parseInt(pair[2], 16),
        len: Math.ceil(pair[1].length / 2),
      })
    }
  }
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const len = Math.ceil(pair[1].length / 2)
      const code = Number.parseInt(pair[1], 16)
      cmap.maps.push({ len, start: code, end: code, mode: 'list', base: '', list: [utf16hex(pair[2])] })
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:\[([\s\S]*?)\]|<([0-9A-Fa-f]+)>)/g
    for (const range of block[1].matchAll(re)) {
      const len = Math.ceil(range[1].length / 2)
      const start = Number.parseInt(range[1], 16)
      const end = Number.parseInt(range[2], 16)
      if (range[4]) cmap.maps.push({ len, start, end, mode: 'inc', base: utf16hex(range[4]) })
      else {
        const list = [...(range[3] || '').matchAll(/<([0-9A-Fa-f]+)>/g)].map((item) => utf16hex(item[1]))
        cmap.maps.push({ len, start, end, mode: 'list', base: '', list })
      }
    }
  }
  if (cmap.spaces.length === 0) {
    const lens = new Set(cmap.maps.map((item) => item.len))
    for (const len of lens) cmap.spaces.push({ start: 0, end: 2 ** (len * 8) - 1, len })
  }
  return cmap
}

function applyCMap(bytes: Uint8Array, cmap: CMap): string {
  const lengths = [...new Set(cmap.spaces.map((space) => space.len))].sort((a, b) => b - a)
  let i = 0
  let out = ''
  while (i < bytes.length) {
    let used = 0
    for (const len of lengths) {
      if (i + len > bytes.length) continue
      let code = 0
      for (let k = 0; k < len; k += 1) code = (code << 8) | (bytes[i + k] ?? 0)
      const space = cmap.spaces.find((item) => item.len === len && code >= item.start && code <= item.end)
      if (!space) continue
      out += lookupCMap(cmap, len, code)
      used = len
      break
    }
    i += used || 1
  }
  return out
}

function lookupCMap(cmap: CMap, len: number, code: number): string {
  for (const item of cmap.maps) {
    if (item.len !== len || code < item.start || code > item.end) continue
    if (item.mode === 'list') return item.list?.[code - item.start] ?? ''
    return shiftUtf16(item.base, code - item.start)
  }
  return ''
}

function shiftUtf16(base: string, delta: number): string {
  if (!base || delta === 0) return base
  const chars = base.split('')
  const last = chars.length - 1
  chars[last] = String.fromCharCode((chars[last]?.charCodeAt(0) ?? 0) + delta)
  return chars.join('')
}

function utf16hex(hex: string): string {
  const padded = hex.length % 4 === 0 ? hex : hex.padStart(Math.ceil(hex.length / 4) * 4, '0')
  let out = ''
  for (let i = 0; i < padded.length; i += 4) out += String.fromCharCode(Number.parseInt(padded.slice(i, i + 4), 16))
  return out
}

function utf16be(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0))
  return out
}

function winAnsi(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += winAnsiChar(byte)
  return out
}

function winAnsiChar(byte: number): string {
  return WINANSI[byte] ?? String.fromCharCode(byte)
}

function glyphName(name: string): string {
  if (/^uni[0-9A-Fa-f]{4}$/.test(name)) return String.fromCharCode(Number.parseInt(name.slice(3), 16))
  if (name.length === 1) return name
  const known: Record<string, string> = {
    space: ' ',
    hyphen: '-',
    period: '.',
    comma: ',',
    colon: ':',
    semicolon: ';',
  }
  return known[name] ?? ''
}

function ascii85(data: Uint8Array): Uint8Array {
  const text = latin1(data).replace(/\s+/g, '')
  const out: number[] = []
  let group = ''
  for (const char of text) {
    if (char === '~') break
    if (char === 'z' && group.length === 0) {
      out.push(0, 0, 0, 0)
      continue
    }
    group += char
    if (group.length === 5) {
      push85(out, group)
      group = ''
    }
  }
  if (group) {
    const padded = group.padEnd(5, 'u')
    const tmp: number[] = []
    push85(tmp, padded)
    out.push(...tmp.slice(0, group.length - 1))
  }
  return Uint8Array.from(out)
}

function push85(out: number[], group: string) {
  let value = 0
  for (const char of group) value = value * 85 + (char.charCodeAt(0) - 33)
  out.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff)
}

function hexBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, '')
  const padded = clean.length % 2 ? `${clean}0` : clean
  const out = new Uint8Array(padded.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(padded.slice(i * 2, i * 2 + 2), 16)
  return out
}

function decodeLiteral(inner: string): string {
  return inner
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
}

function numOf(dict: PdfDict, key: string): number | null {
  const value = dict.v.get(key)
  return value && value.t === 'num' ? value.v : null
}

function nameOf(dict: PdfDict, key: string): string | null {
  const value = dict.v.get(key)
  return value && value.t === 'name' ? value.v : null
}

function hasName(dict: PdfDict, key: string): boolean {
  return dict.v.has(key)
}

function readInt(data: Uint8Array, offset: number, width: number): number {
  let value = 0
  for (let i = 0; i < width; i += 1) value = (value << 8) | (data[offset + i] ?? 0)
  return value
}

function textLength(value: string): number {
  return value.replace(/\s+/g, ' ').trim().length
}

function longerText(a: string, b: string): string {
  return textLength(a) >= textLength(b) ? a : b
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function latin1(bytes: Uint8Array): string {
  let out = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)))
  }
  return out
}

function isWs(byte: number): boolean {
  return byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32
}

function isDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39
}

function isDelim(byte: number): boolean {
  return isWs(byte) || byte === 0x28 || byte === 0x29 || byte === 0x3c || byte === 0x3e || byte === 0x5b || byte === 0x5d || byte === 0x7b || byte === 0x7d || byte === 0x2f || byte === 0x25
}

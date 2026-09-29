import assert from 'node:assert/strict'
import { deflateRawSync, deflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { buildFixtures } from './generate-pdf-fixtures.mjs'
import { decidePdfText, literalPdfText, readPdfText } from '../supabase/functions/_shared/pdf_text.ts'

const PITCH =
  'Northwind Logistics serves 120 enterprise customers across the Gulf and is raising a seed round for regional freight.'

test('compressed pitch-deck text is readable when Tj literals are inside FlateDecode', async () => {
  const bytes = classicPdf(flateStream(`BT /F1 12 Tf (${PITCH}) Tj ET`))
  assert.equal(Buffer.from(bytes).includes(Buffer.from('Northwind')), false)
  const read = await readPdfText(bytes)
  const decision = decidePdfText(read)
  assert.equal(decision.ok, true)
  if (decision.ok) {
    assert.match(decision.text, /Northwind Logistics/)
    assert.ok(decision.text.replace(/\s+/g, ' ').trim().length >= 40)
  }
})

test('modern ToUnicode hex strings survive compression', async () => {
  const hex = utf16Hex(PITCH)
  const cmap = `1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfrange\n<0020> <007E> <0020>\nendbfrange\n`
  const bytes = classicPdf(flateStream(`BT /F1 12 Tf ${hex} Tj ET`), { toUnicode: cmap })
  const read = await readPdfText(bytes)
  const decision = decidePdfText(read)
  assert.equal(decision.ok, true)
  if (decision.ok) assert.match(decision.text, /Northwind Logistics serves 120/)
})

test('uncompressed literal Tj still reads', async () => {
  const bytes = classicPdf(plainStream(`BT /F1 12 Tf (${PITCH}) Tj ET`))
  const read = await readPdfText(bytes)
  assert.equal(decidePdfText(read).ok, true)
  assert.match(literalPdfText(bytes), /Northwind/)
})

test('image-only deck is a scanned read, not a short text success', async () => {
  const bytes = imageOnlyPdf()
  const read = await readPdfText(bytes)
  const decision = decidePdfText(read)
  assert.equal(decision.ok, false)
  if (!decision.ok) assert.equal(decision.reason, 'scanned')
})

test('xref stream plus object stream still yields the pitch text', async () => {
  const bytes = modernPdf(`BT /F1 12 Tf (${PITCH}) Tj ET`)
  const raw = Buffer.from(bytes).toString('latin1')
  assert.equal(raw.includes(PITCH), false)
  const read = await readPdfText(bytes)
  const decision = decidePdfText(read)
  assert.equal(decision.ok, true)
  if (decision.ok) assert.match(decision.text, /enterprise customers across the Gulf/)
})

test('indirect length still reads when endstream bytes sit inside the stream', async () => {
  const payload = Buffer.from(`endstream\nBT /F1 12 Tf (${PITCH}) Tj ET`)
  const bytes = classicPdf(storedZlib(payload), { length: 'indirect' })
  const read = await readPdfText(bytes)
  const decision = decidePdfText(read)
  assert.equal(decision.ok, true)
  if (decision.ok) assert.match(decision.text, /Northwind Logistics serves 120/)
})

test('a missing length keeps text when endstream is preceded by LF or CRLF', async () => {
  for (const eol of ['\n', '\r\n']) {
    const bytes = classicPdf(flateStream(`BT /F1 12 Tf (${PITCH}) Tj ET`), { length: 'missing', eol })
    const read = await readPdfText(bytes)
    const decision = decidePdfText(read)
    assert.equal(decision.ok, true, eol === '\n' ? 'lf' : 'crlf')
    if (decision.ok) assert.match(decision.text, /regional freight/)
  }
})

test('a truncated flate stream keeps the pitch instead of dropping the page', async () => {
  const full = deflateSync(Buffer.from(`BT /F1 12 Tf (${PITCH}) Tj ET`))
  const chopped = full.subarray(0, full.length - 5)
  const bytes = classicPdf({ dict: `<< /Length ${chopped.length} /Filter /FlateDecode >>`, data: chopped })
  const read = await readPdfText(bytes)
  assert.match(read.text, /Northwind Logistics/)
})

test('raw deflate content is read after zlib does not match', async () => {
  const data = deflateRawSync(Buffer.from(`BT /F1 12 Tf (${PITCH}) Tj ET`))
  const bytes = classicPdf({ dict: `<< /Length ${data.length} /Filter /FlateDecode >>`, data })
  const read = await readPdfText(bytes)
  assert.match(read.text, /enterprise customers across the Gulf/)
})

test('one bad stream does not throw away the rest of the document', async () => {
  const good = flateStream(`BT /F1 12 Tf (${PITCH}) Tj ET`)
  const junk = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  const bytes = twoStreamPdf(
    { dict: `<< /Length ${junk.length} /Filter /FlateDecode >>`, data: junk },
    good,
  )
  const read = await readPdfText(bytes)
  assert.match(read.text, /Northwind Logistics serves 120/)
})

test('winansi, macroman, and glyph names keep symbols and drop em dashes', async () => {
  const win = await readPdfText(symbolPdf('win'))
  const mac = await readPdfText(symbolPdf('mac'))
  const names = await readPdfText(symbolPdf('names'))
  for (const read of [win, mac, names]) {
    assert.equal(read.text.includes('\u2014'), false)
    assert.match(read.text, /Routes • Gulf – Levant … “priority” lanes/)
    assert.match(read.text, /Riyadh - Jeddah corridor opens in 2027/)
    assert.match(read.text, /80 refrigerated trucks/)
  }
})

test('synthetic export fixtures yield readable Northwind sentences', async () => {
  const built = buildFixtures()
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'decks')
  const expect = {
    'libreoffice-northwind.pdf': /Northwind Logistics serves 120 enterprise customers across the Gulf and is raising a seed round/,
    'chrome-type3-northwind.pdf': /Northwind Logistics serves 120 enterprise customers across the Gulf and is raising a seed round/,
    'powerpoint-northwind.pdf': /Northwind Logistics serves 120 enterprise customers across the Gulf and is raising a seed round/,
    'canva-northwind.pdf': /Canva style deck hauls 80 refrigerated lanes for Gulf grocers/,
  }
  for (const [name, pattern] of Object.entries(expect)) {
    const bytes = built[name]
    assert.ok(bytes, name)
    const onDisk = readFileSync(path.join(dir, name))
    assert.deepEqual(Buffer.from(bytes), onDisk, name)
    const read = await readPdfText(bytes)
    const decision = decidePdfText(read)
    assert.equal(decision.ok, true, name)
    if (!decision.ok) continue
    assert.match(decision.text, pattern, name)
    assert.match(decision.text, /Routes • Gulf – Levant … “priority” lanes/, name)
    assert.match(decision.text, /Riyadh - Jeddah corridor opens in 2027/, name)
    assert.match(decision.text, /80 refrigerated trucks/, name)
    assert.equal(decision.text.includes('\u2014'), false, name)
    assert.equal(/\n[A-Za-z]\n/.test(decision.text), false, name)
  }
  const chrome = await readPdfText(built['chrome-type3-northwind.pdf'])
  assert.match(chrome.text, /Northwind Logistics\nNorthwind Logistics serves 120/)
  const canva = await readPdfText(built['canva-northwind.pdf'])
  assert.match(canva.text, /Northwind Logistics/)
  const wrapped = /Northwind Logistics serves 120 enterprise customers across the Gulf and is raising a seed round for regional freight\./
  for (const name of ['libreoffice-northwind.pdf', 'chrome-type3-northwind.pdf']) {
    const read = await readPdfText(built[name])
    assert.match(read.text, wrapped, name)
    assert.equal(/\n[A-Za-z]\n/.test(read.text), false, name)
  }
})

function utf16Hex(text: string): string {
  let hex = ''
  for (const char of text) hex += char.charCodeAt(0).toString(16).padStart(4, '0')
  return `<${hex}>`
}

function flateStream(content: string): { dict: string; data: Buffer } {
  const data = deflateSync(Buffer.from(content))
  return { dict: `<< /Length ${data.length} /Filter /FlateDecode >>`, data }
}

function plainStream(content: string): { dict: string; data: Buffer } {
  const data = Buffer.from(content)
  return { dict: `<< /Length ${data.length} >>`, data }
}

function classicPdf(
  stream: { dict: string; data: Buffer },
  options: { toUnicode?: string; length?: 'direct' | 'indirect' | 'missing'; eol?: string } = {},
): Uint8Array {
  const objects: Buffer[] = []
  const push = (body: string | Buffer) => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body))
  }
  const eol = options.eol ?? '\n'
  const fontId = options.length === 'indirect' ? 6 : 5
  push('<< /Type /Catalog /Pages 2 0 R >>')
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
  )
  const lengthDict =
    options.length === 'indirect'
      ? stream.dict.replace(/\/Length\s+\d+/, '/Length 5 0 R')
      : options.length === 'missing'
        ? stream.dict.replace(/\/Length\s+\d+\s*/, '')
        : stream.dict
  push(
    Buffer.concat([
      Buffer.from(`${lengthDict}\nstream\n`),
      stream.data,
      Buffer.from(`${eol}endstream`),
    ]),
  )
  if (options.length === 'indirect') push(String(stream.data.length))
  if (options.toUnicode) {
    const cmap = Buffer.from(options.toUnicode)
    const cmapId = options.length === 'indirect' ? 7 : 6
    push(
      `<< /Type /Font /Subtype /Type0 /BaseFont /F1 /Encoding /Identity-H /ToUnicode ${cmapId} 0 R >>`,
    )
    push(
      Buffer.concat([
        Buffer.from(`<< /Length ${cmap.length} >>\nstream\n`),
        cmap,
        Buffer.from('\nendstream'),
      ]),
    )
  } else {
    push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  }
  return wrapClassic(objects)
}

function storedZlib(payload: Buffer): { dict: string; data: Buffer } {
  const block = Buffer.alloc(5 + payload.length)
  block[0] = 0x01
  block.writeUInt16LE(payload.length, 1)
  block.writeUInt16LE(payload.length ^ 0xffff, 3)
  payload.copy(block, 5)
  let a = 1
  let b = 0
  for (const byte of payload) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  const sum = ((b << 16) | a) >>> 0
  const data = Buffer.concat([
    Buffer.from([0x78, 0x01]),
    block,
    Buffer.from([(sum >>> 24) & 0xff, (sum >>> 16) & 0xff, (sum >>> 8) & 0xff, sum & 0xff]),
  ])
  return { dict: `<< /Length ${data.length} /Filter /FlateDecode >>`, data }
}

function twoStreamPdf(
  first: { dict: string; data: Buffer },
  second: { dict: string; data: Buffer },
): Uint8Array {
  const streamObj = (stream: { dict: string; data: Buffer }) =>
    Buffer.concat([Buffer.from(`${stream.dict}\nstream\n`), stream.data, Buffer.from('\nendstream')])
  return wrapClassic([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents [4 0 R 5 0 R] /Resources << /Font << /F1 6 0 R >> >> >>',
    ),
    streamObj(first),
    streamObj(second),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ])
}

function symbolPdf(kind: 'win' | 'mac' | 'names'): Uint8Array {
  const win = 'Routes \\225 Gulf \\226 Levant \\205 \\223priority\\224 lanes. Riyadh \\227 Jeddah corridor opens in 2027. Fleet keeps 80\\240refrigerated trucks.'
  const mac = 'Routes \\245 Gulf \\320 Levant \\311 \\322priority\\323 lanes. Riyadh \\321 Jeddah corridor opens in 2027. Fleet keeps 80\\312refrigerated trucks.'
  const named = 'Routes \\200 Gulf \\201 Levant \\205 \\203priority\\204 lanes. Riyadh \\202 Jeddah corridor opens in 2027. Fleet keeps 80\\206refrigerated trucks.'
  const text = kind === 'win' ? win : kind === 'mac' ? mac : named
  const encoding =
    kind === 'mac'
      ? '/Encoding /MacRomanEncoding'
      : kind === 'names'
        ? '/Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 /bullet /endash /emdash /quotedblleft /quotedblright /ellipsis /nbspace] >>'
        : '/Encoding /WinAnsiEncoding'
  const content = Buffer.from(`BT /F1 12 Tf (${text}) Tj ET`)
  return wrapClassic([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from('\nendstream'),
    ]),
    Buffer.from(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ${encoding} >>`),
  ])
}

function imageOnlyPdf(): Uint8Array {
  const pixel = Buffer.from([0])
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>',
    ),
    Buffer.concat([
      Buffer.from('<< /Length 10 >>\nstream\n'),
      Buffer.from('q /Im1 Do Q'),
      Buffer.from('\nendstream'),
    ]),
    Buffer.concat([
      Buffer.from(
        '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n',
      ),
      pixel,
      Buffer.from('\nendstream'),
    ]),
  ]
  return wrapClassic(objects)
}

function modernPdf(content: string): Uint8Array {
  const stream = flateStream(content)
  const page = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'
  const header = '3 0 '
  const packed = deflateSync(Buffer.from(header + page))
  const chunks: { body: Buffer }[] = []
  const add = (body: Buffer) => chunks.push({ body })
  add(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'))
  add(Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'))
  add(
    Buffer.concat([
      Buffer.from(`${stream.dict}\nstream\n`),
      stream.data,
      Buffer.from('\nendstream'),
    ]),
  )
  add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'))
  add(
    Buffer.concat([
      Buffer.from(
        `<< /Type /ObjStm /N 1 /First ${header.length} /Filter /FlateDecode /Length ${packed.length} >>\nstream\n`,
      ),
      packed,
      Buffer.from('\nendstream'),
    ]),
  )

  let cursor = Buffer.from('%PDF-1.5\n').length
  const offsets: number[] = []
  const parts: Buffer[] = [Buffer.from('%PDF-1.5\n')]
  chunks.forEach((chunk, index) => {
    const objNum = index < 2 ? index + 1 : index + 2
    const wrapped = Buffer.concat([Buffer.from(`${objNum} 0 obj\n`), chunk.body, Buffer.from('\nendobj\n')])
    offsets.push(cursor)
    parts.push(wrapped)
    cursor += wrapped.length
  })
  const xrefOffset = cursor
  const size = 8
  const row = 1 + 4 + 2
  const table = Buffer.alloc(size * row)
  const write = (index: number, type: number, a: number, b: number) => {
    const at = index * row
    table[at] = type
    table.writeUInt32BE(a, at + 1)
    table.writeUInt16BE(b, at + 5)
  }
  write(0, 0, 0, 65535)
  write(1, 1, offsets[0] ?? 0, 0)
  write(2, 1, offsets[1] ?? 0, 0)
  write(3, 2, 6, 0)
  write(4, 1, offsets[2] ?? 0, 0)
  write(5, 1, offsets[3] ?? 0, 0)
  write(6, 1, offsets[4] ?? 0, 0)
  write(7, 1, xrefOffset, 0)
  const compressed = deflateSync(table)
  const xrefBody = Buffer.concat([
    Buffer.from(
      `<< /Type /XRef /Size 8 /W [1 4 2] /Root 1 0 R /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
    ),
    compressed,
    Buffer.from('\nendstream'),
  ])
  const xrefObj = Buffer.concat([Buffer.from('7 0 obj\n'), xrefBody, Buffer.from('\nendobj\n')])
  parts.push(xrefObj)
  parts.push(Buffer.from(`startxref\n${xrefOffset}\n%%EOF\n`))
  return new Uint8Array(Buffer.concat(parts))
}

function wrapClassic(objects: Buffer[]): Uint8Array {
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')]
  const offsets = [0]
  let cursor = parts[0]!.length
  objects.forEach((body, index) => {
    const wrapped = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')])
    offsets.push(cursor)
    parts.push(wrapped)
    cursor += wrapped.length
  })
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`
  parts.push(Buffer.from(xref))
  return new Uint8Array(Buffer.concat(parts))
}

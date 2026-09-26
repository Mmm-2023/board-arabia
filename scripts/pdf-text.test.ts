import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import test from 'node:test'
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

test('sample report PDF yields usable text when the fixture is on disk', async () => {
  const paths = [
    '/workspace/handoff/ba-ai-dd-fix-2026-09-26/sample-report-style.pdf',
    '/home/ubuntu/.cursor/projects/workspace/uploads/sample-report-style_68c9.pdf',
  ]
  for (const path of paths) {
    try {
      const bytes = new Uint8Array(readFileSync(path))
      const read = await readPdfText(bytes)
      const decision = decidePdfText(read)
      assert.equal(decision.ok, true, path)
      if (decision.ok) assert.match(decision.text, /Goldman|assessment|Finding/i)
      return
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') continue
      throw err
    }
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
  options: { toUnicode?: string } = {},
): Uint8Array {
  const objects: Buffer[] = []
  const push = (body: string | Buffer) => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body))
  }
  push('<< /Type /Catalog /Pages 2 0 R >>')
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  )
  push(
    Buffer.concat([
      Buffer.from(`${stream.dict}\nstream\n`),
      stream.data,
      Buffer.from('\nendstream'),
    ]),
  )
  if (options.toUnicode) {
    const cmap = Buffer.from(options.toUnicode)
    push(
      `<< /Type /Font /Subtype /Type0 /BaseFont /F1 /Encoding /Identity-H /ToUnicode 6 0 R >>`,
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

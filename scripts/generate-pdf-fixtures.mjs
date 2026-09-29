/**
 * Rebuild the neutral synthetic deck fixtures used by scripts/pdf-text.test.ts.
 * Run: node scripts/generate-pdf-fixtures.mjs
 * Figures and names are fictional. Do not point this at a client deck.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'decks')

const LO_LINES = [
  { y: 760, text: 'Northwind Logistics' },
  { y: 728, text: 'Company: Northwind Logistics' },
  { y: 696, text: 'Sector: Regional freight' },
  { y: 664, text: 'Routes \u2022 Gulf \u2013 Levant \u2026 \u201cpriority\u201d lanes' },
  { y: 632, text: 'Riyadh \u2014 Jeddah corridor opens in 2027.' },
  { y: 600, text: 'Overview' },
  { y: 568, text: 'Northwind Logistics serves 120 enterprise customers across the Gulf' },
  { y: 552, text: 'and is raising a seed round for regional freight.' },
  { y: 520, text: 'Fleet keeps 80\u00a0refrigerated trucks on Gulf lanes.' },
  { y: 488, text: 'The team runs 14 warehouses with 220 staff.' },
]

const CHROME_LINES = [
  { y: 700, text: 'Northwind Logistics' },
  { y: 664, text: 'Northwind Logistics serves 120 enterprise customers across the Gulf' },
  { y: 648, text: 'and is raising a seed round for regional freight.' },
  { y: 612, text: 'Routes \u2022 Gulf \u2013 Levant \u2026 \u201cpriority\u201d lanes.' },
  { y: 576, text: 'Riyadh \u2014 Jeddah corridor opens in 2027.' },
  { y: 540, text: 'Fleet keeps 80\u00a0refrigerated trucks on Gulf lanes.' },
]

const CANVA_SENTENCE = 'Canva style deck hauls 80 refrigerated lanes for Gulf grocers.'

export function buildFixtures() {
  return {
    'libreoffice-northwind.pdf': libreOfficePdf(),
    'chrome-type3-northwind.pdf': chromeType3Pdf(),
    'powerpoint-northwind.pdf': powerPointPdf(),
    'canva-northwind.pdf': canvaPdf(),
  }
}

function libreOfficePdf() {
  const chars = []
  for (const line of LO_LINES) {
    for (const ch of line.text) if (!chars.includes(ch)) chars.push(ch)
  }
  const codes = new Map(chars.map((ch, index) => [ch, index + 1]))
  const content = LO_LINES.map((line) => {
    return ['BT', `56 ${line.y} Td /F1 14 Tf`, tjHex(line.text, codes), 'ET'].join('\n')
  }).join('\n')
  const compressed = deflateSync(Buffer.from(content))
  const cmap = toUnicodeCmap(codes)
  const objects = []
  objects.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'))
  objects.push(Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'))
  objects.push(
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 6 0 R >> >> >>',
    ),
  )
  objects.push(
    Buffer.concat([
      Buffer.from(`<< /Length 5 0 R /Filter /FlateDecode >>\nstream\n`),
      compressed,
      Buffer.from('\nendstream'),
    ]),
  )
  objects.push(Buffer.from(String(compressed.length)))
  objects.push(Buffer.from('<< /Type /Font /Subtype /TrueType /BaseFont /LiberationSans /ToUnicode 7 0 R >>'))
  objects.push(
    Buffer.concat([
      Buffer.from(`<< /Length ${cmap.length} >>\nstream\n`),
      Buffer.from(cmap),
      Buffer.from('\nendstream'),
    ]),
  )
  return wrapClassic(objects)
}

function chromeType3Pdf() {
  const specials = [
    ['\u2022', 0x80],
    ['\u2013', 0x81],
    ['\u2026', 0x82],
    ['\u201c', 0x83],
    ['\u201d', 0x84],
    ['\u2014', 0x85],
    ['\u00a0', 0x86],
  ]
  const codes = new Map(specials)
  const content = ['BT', '/F1 18 Tf']
  for (const line of CHROME_LINES) {
    content.push(`1 0 0 1 36 ${line.y} Tm`)
    content.push(type3Runs(line.text, codes))
  }
  content.push('ET')
  const stream = Buffer.from(content.join('\n'))
  const cmap = chromeCmap(specials)
  const widths = chromeWidths()
  const objects = []
  objects.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'))
  objects.push(Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'))
  objects.push(
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    ),
  )
  objects.push(
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`),
      deflateSync(stream),
      Buffer.from('\nendstream'),
    ]),
  )
  const font = `<< /Type /Font /Subtype /Type3 /FontMatrix [0.001 0 0 0.001 0 0] /FirstChar 0 /LastChar 134 /Widths [${widths}] /ToUnicode 6 0 R >>`
  objects.push(Buffer.from(font))
  objects.push(
    Buffer.concat([
      Buffer.from(`<< /Length ${cmap.length} >>\nstream\n`),
      Buffer.from(cmap),
      Buffer.from('\nendstream'),
    ]),
  )
  return wrapClassic(objects)
}

function powerPointPdf() {
  const content = [
    'BT',
    '/F1 18 Tf',
    '1 0 0 1 72 720 Tm',
    '(Northwind Logistics) Tj',
    '0 -32 Td',
    '[(Northwind) -320 (Logistics serves 120 enterprise customers across the Gulf)] TJ',
    '0 -16 Td',
    '(and is raising a seed round for regional freight.) Tj',
    '0 -32 Td',
    '(Routes \\225 Gulf \\226 Levant \\205 \\223priority\\224 lanes.) Tj',
    '0 -32 Td',
    '(Riyadh \\227 Jeddah corridor opens in 2027.) Tj',
    '0 -32 Td',
    '(Fleet keeps 80\\240refrigerated trucks on Gulf lanes.) Tj',
    'ET',
  ].join('\n')
  const data = Buffer.from(content)
  const objects = []
  objects.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'))
  objects.push(Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'))
  objects.push(
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 720 540] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    ),
  )
  objects.push(
    Buffer.concat([
      Buffer.from(`<< /Length ${data.length} >>\nstream\n`),
      data,
      Buffer.from('\nendstream'),
    ]),
  )
  objects.push(
    Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Calibri /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 122 /Widths [250 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500] >>',
    ),
  )
  return wrapClassic(objects)
}

function canvaPdf() {
  const content = [
    'BT',
    '/F1 16 Tf',
    '1 0 0 1 40 500 Tm',
    '(Northwind) Tj',
    '1 0 0 1 150 500 Tm',
    '(Logistics) Tj',
    '1 0 0 1 40 468 Tm',
    `(${CANVA_SENTENCE}) Tj`,
    '1 0 0 1 40 436 Tm',
    '(Routes \\245 Gulf \\320 Levant \\311 \\322priority\\323 lanes.) Tj',
    '1 0 0 1 40 404 Tm',
    '(Riyadh \\321 Jeddah corridor opens in 2027.) Tj',
    '1 0 0 1 40 372 Tm',
    '(Fleet keeps 80\\312refrigerated trucks on Gulf lanes.) Tj',
    'ET',
  ].join('\n')
  const data = deflateSync(Buffer.from(content))
  const widths = new Array(128).fill(500)
  widths[32] = 280
  const objects = []
  objects.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'))
  objects.push(Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'))
  objects.push(
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    ),
  )
  objects.push(
    Buffer.concat([
      Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`),
      data,
      Buffer.from('\nendstream'),
    ]),
  )
  objects.push(
    Buffer.from(
      `<< /Type /Font /Subtype /Type1 /BaseFont /CanvaSans /Encoding /MacRomanEncoding /FirstChar 0 /LastChar 127 /Widths [${widths.join(' ')}] >>`,
    ),
  )
  return wrapClassic(objects)
}

function tjHex(text, codes) {
  let out = '['
  let index = 0
  for (const ch of text) {
    if (index > 0 && index % 6 === 0) out += '-1'
    const code = codes.get(ch)
    out += `<${code.toString(16).padStart(2, '0')}>`
    index += 1
  }
  return `${out}] TJ`
}

function toUnicodeCmap(codes) {
  const lines = [...codes.entries()].map(([ch, code]) => {
    const src = code.toString(16).padStart(2, '0')
    const dst = ch.codePointAt(0).toString(16).padStart(4, '0')
    return `<${src}> <${dst}>`
  })
  return [
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
    `${lines.length} beginbfchar`,
    ...lines,
    'endbfchar',
    '',
  ].join('\n')
}

function type3Runs(text, codes) {
  const parts = []
  let pending = null
  for (const ch of text) {
    if (pending != null) parts.push(`${pending} 0 Td`)
    const code = codes.get(ch) ?? ch.charCodeAt(0)
    parts.push(`<${code.toString(16).padStart(2, '0')}> Tj`)
    pending = ch === ' ' || ch === '\u00a0' ? 4.5 : 9
  }
  return parts.join('\n')
}

function chromeCmap(specials) {
  const rows = specials.map(([ch, code]) => {
    const src = code.toString(16).padStart(2, '0')
    const dst = ch.codePointAt(0).toString(16).padStart(4, '0')
    return `<${src}> <${dst}>`
  })
  return [
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
    '1 beginbfrange',
    '<20> <7E> <0020>',
    'endbfrange',
    `${rows.length} beginbfchar`,
    ...rows,
    'endbfchar',
    '',
  ].join('\n')
}

function chromeWidths() {
  const widths = new Array(135).fill(500)
  widths[32] = 250
  widths[0x86] = 250
  return widths.join(' ')
}

function wrapClassic(objects) {
  const parts = [Buffer.from('%PDF-1.4\n')]
  const offsets = [0]
  let cursor = parts[0].length
  objects.forEach((body, index) => {
    const wrapped = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')])
    offsets.push(cursor)
    parts.push(wrapped)
    cursor += wrapped.length
  })
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`
  parts.push(Buffer.from(xref))
  return new Uint8Array(Buffer.concat(parts))
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (invoked) {
  mkdirSync(outDir, { recursive: true })
  const built = buildFixtures()
  for (const [name, bytes] of Object.entries(built)) {
    const file = path.join(outDir, name)
    writeFileSync(file, bytes)
    process.stdout.write(`${file} ${bytes.length}\n`)
  }
}

export { CANVA_SENTENCE }

/**
 * Made-up example.com financials used by fixtures and tests.
 * Example Holdings is not a real company.
 */

import { strToU8, zipSync } from '../../_shared/fflate-browser.js'

export const CFO_EXAMPLE_ROWS: readonly [string, string][] = [
  ['Company', 'Example Holdings'],
  ['Website', 'example.com'],
  ['Currency', 'SAR'],
  ['Cash', '2400000'],
  ['Monthly burn', '200000'],
  ['Revenue', '3600000'],
  ['Cost of goods sold', '1440000'],
  ['Operating expenses', '2400000'],
  ['Net income', '-240000'],
  ['Current assets', '3100000'],
  ['Current liabilities', '1400000'],
  ['Accounts receivable', '980000'],
  ['Accounts payable', '410000'],
]

export function exampleCsv(): string {
  const lines = ['Line,Amount', ...CFO_EXAMPLE_ROWS.map(([label, amount]) => `${label},${amount}`)]
  return `${lines.join('\n')}\n`
}

export function examplePdfLines(): string[] {
  return CFO_EXAMPLE_ROWS.map(([label, amount]) => `${label} ${amount}`)
}

export function buildExamplePdf(lines = examplePdfLines()): Uint8Array {
  const commands = ['BT', '/F1 12 Tf', '72 740 Td']
  lines.forEach((line, index) => {
    if (index > 0) commands.push('0 -16 Td')
    commands.push(`(${escapePdf(line)}) Tj`)
  })
  commands.push('ET')
  return wrapPdf(commands.join('\n'))
}

export function buildExampleXlsx(rows: readonly [string, string][] = CFO_EXAMPLE_ROWS): Uint8Array {
  const shared: string[] = []
  const index = new Map<string, number>()
  const sid = (text: string) => {
    const hit = index.get(text)
    if (hit !== undefined) return hit
    const id = shared.length
    shared.push(text)
    index.set(text, id)
    return id
  }
  const rowXml = rows
    .map((pair, rowIndex) => {
      const row = rowIndex + 1
      const amount = /^-?\d+(\.\d+)?$/.test(pair[1])
        ? `<c r="B${row}"><v>${pair[1]}</v></c>`
        : `<c r="B${row}" t="s"><v>${sid(pair[1])}</v></c>`
      return `<row r="${row}"><c r="A${row}" t="s"><v>${sid(pair[0])}</v></c>${amount}</row>`
    })
    .join('')
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((item) => `<si><t>${escapeXml(item)}</t></si>`).join('')}</sst>`
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Financials" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`
  return zipSync({
    '[Content_Types].xml': strToU8(types),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/sharedStrings.xml': strToU8(sst),
  })
}

function escapePdf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrapPdf(stream: string): Uint8Array {
  const body = Buffer.from(stream)
  const objects: (string | Buffer)[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    Buffer.concat([
      Buffer.from(`<< /Length ${body.length} >>\nstream\n`),
      body,
      Buffer.from('\nendstream'),
    ]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')]
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
    const data = Buffer.isBuffer(objects[index]) ? (objects[index] as Buffer) : Buffer.from(objects[index] as string)
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`))
    chunks.push(data)
    chunks.push(Buffer.from('\nendobj\n'))
  }
  const xrefAt = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  let xref = 'xref\n0 6\n0000000000 65535 f \n'
  for (let index = 1; index <= 5; index += 1) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  chunks.push(Buffer.from(xref))
  return new Uint8Array(Buffer.concat(chunks))
}

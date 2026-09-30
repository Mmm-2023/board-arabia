/**
 * Small xlsx reader for CFO uploads. Reads shared strings and the first
 * worksheets. No spreadsheet package.
 */

import { strFromU8, unzipSync } from '../../_shared/fflate-browser.js'

export function xlsxToText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes) as Record<string, Uint8Array>
  } catch {
    return ''
  }
  const shared = readSharedStrings(textOf(files, /xl\/sharedstrings\.xml$/i))
  const sheets = Object.keys(files)
    .filter((name) => /xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort()
  const lines: string[] = []
  for (const name of sheets) {
    lines.push(...sheetLines(strFromU8(files[name]), shared))
  }
  return lines.join('\n')
}

function textOf(files: Record<string, Uint8Array>, pattern: RegExp): string {
  const name = Object.keys(files).find((key) => pattern.test(key))
  return name ? strFromU8(files[name]) : ''
}

function readSharedStrings(xml: string): string[] {
  if (!xml) return []
  const items = xml.match(/<si\b[\s\S]*?<\/si>/gi) ?? []
  return items.map((item) => {
    const parts = [...item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) => decodeXml(match[1]))
    return parts.join('')
  })
}

function sheetLines(xml: string, shared: string[]): string[] {
  const rows = xml.split(/<row\b/i).slice(1)
  const lines: string[] = []
  for (const row of rows) {
    const cells = [...row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi)]
    const values = cells
      .map((cell) => ({ ref: attr(cell[1], 'r'), value: cellValue(cell[1], cell[2] ?? '', shared) }))
      .filter((cell) => cell.value !== '')
      .sort((a, b) => colIndex(a.ref) - colIndex(b.ref))
    if (values.length >= 2) lines.push(`${values[0].value}\t${values[1].value}`)
    else if (values.length === 1) lines.push(values[0].value)
  }
  return lines
}

function cellValue(attrs: string, body: string, shared: string[]): string {
  const kind = attr(attrs, 't')
  if (kind === 'inlineStr') {
    const parts = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) => decodeXml(match[1]))
    return parts.join('').trim()
  }
  const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1]
  if (raw == null) return ''
  const text = decodeXml(raw).trim()
  if (kind === 's') {
    const index = Number(text)
    return Number.isInteger(index) && shared[index] != null ? shared[index] : ''
  }
  return text
}

function attr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))
  return match?.[1] ?? ''
}

function colIndex(ref: string): number {
  const letters = ref.replace(/[^A-Za-z]/g, '')
  let index = 0
  for (const char of letters) index = index * 26 + (char.toUpperCase().charCodeAt(0) - 64)
  return index
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

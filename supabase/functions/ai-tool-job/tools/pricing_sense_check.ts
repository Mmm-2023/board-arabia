import { guardStubOutput } from './legal_guard.ts'
import type { StubInput, StubOutput } from './types.ts'

type Note = {
  title: string
  url: string
  dated: string
  priceLow: number | null
  priceHigh: number | null
  multipleLow: number | null
  multipleHigh: number | null
}

const LIMITS =
  'General and educational only. Not a price opinion or an investment recommendation. Public notes can be incomplete or stale. Private deal data is not used.'

export function pricingSenseCheckOutput(input: StubInput): StubOutput {
  const parsed = parsePricing(input.sourceText || '')
  if (parsed.asking == null) {
    return guardStubOutput({
      tool_key: 'pricing_sense_check',
      title: 'Pricing sense-check',
      summary: `Pricing sense-check of ${input.fileName}. General and educational only. No readable asking figure was found, so no comparison is shown.`,
      findings: [
        'Add an asking figure, and any public notes you are allowed to share, as text.',
        'Public comparables and reported deals can be incomplete or stale.',
      ],
      questions: ['Which public sources should a licensed adviser check before you rely on a figure?'],
      sources: [],
      limits: LIMITS,
      generated_on: input.generatedOn,
      model_id: input.modelId,
      model_skip_reason: input.modelSkipReason,
    })
  }

  const findings: string[] = []
  const name = parsed.company || input.fileName
  const where = [parsed.sector, parsed.stage, parsed.region].filter(Boolean).join(', ')
  findings.push(
    `Asking figure for ${name}${where ? ` (${where})` : ''} is ${sar(parsed.asking)}.`,
  )

  let askingMultiple: number | null = null
  if (parsed.revenue != null && parsed.revenue > 0) {
    askingMultiple = parsed.asking / parsed.revenue
    findings.push(
      `Stated revenue is ${sar(parsed.revenue)}. The asking figure is ${multiple(askingMultiple)} that revenue.`,
    )
  } else {
    findings.push('No revenue figure was readable, so no revenue multiple is shown.')
  }

  const priceLows = parsed.notes.map((note) => note.priceLow).filter((value): value is number => value != null)
  const priceHighs = parsed.notes.map((note) => note.priceHigh).filter((value): value is number => value != null)
  const multipleLows = parsed.notes.map((note) => note.multipleLow).filter((value): value is number => value != null)
  const multipleHighs = parsed.notes.map((note) => note.multipleHigh).filter((value): value is number => value != null)

  if (priceLows.length > 0 && priceHighs.length > 0) {
    const low = Math.min(...priceLows)
    const high = Math.max(...priceHighs)
    findings.push(`The public notes supplied describe price figures from ${sar(low)} to ${sar(high)}.`)
    if (parsed.asking < low || parsed.asking > high) {
      findings.push(
        `The asking figure sits outside the ${sar(low)} to ${sar(high)} band in those notes. This is a gap in the comparison. It is not a statement that the figure is suitable or unsuitable.`,
      )
    } else {
      findings.push(
        `The asking figure sits inside the ${sar(low)} to ${sar(high)} band in those notes. Sitting inside a band is a description of the notes, not a statement that the figure is suitable.`,
      )
    }
  } else {
    findings.push('No price band could be read from the public notes supplied.')
  }

  if (multipleLows.length > 0 && multipleHighs.length > 0) {
    const low = Math.min(...multipleLows)
    const high = Math.max(...multipleHighs)
    findings.push(`Those notes describe revenue multiples from ${multiple(low)} to ${multiple(high)}.`)
    if (askingMultiple != null && (askingMultiple < low || askingMultiple > high)) {
      findings.push(
        `The asking multiple of ${multiple(askingMultiple)} sits outside the ${multiple(low)} to ${multiple(high)} band in the notes supplied. This is a gap in the comparison, not a view on the figure.`,
      )
    } else if (askingMultiple != null) {
      findings.push(
        `The asking multiple of ${multiple(askingMultiple)} sits inside the ${multiple(low)} to ${multiple(high)} band in the notes supplied. That only describes the notes.`,
      )
    }
  }

  findings.push(
    'Main gaps: the notes may not match this sector, stage, or region; they may be incomplete or stale; and private deal data is not used.',
  )
  if (parsed.unused.length > 0) {
    findings.push(`Lines not used: ${parsed.unused.slice(0, 3).join(' | ')}`)
  }

  const summaryBand =
    askingMultiple != null
      ? ` The asking figure is ${sar(parsed.asking)}, which is ${multiple(askingMultiple)} the stated revenue.`
      : ` The asking figure is ${sar(parsed.asking)}.`

  return guardStubOutput({
    tool_key: 'pricing_sense_check',
    title: 'Pricing sense-check',
    summary: `Pricing sense-check for ${name}. General and educational only.${summaryBand}`,
    findings,
    questions: [
      'Which of the supplied notes, if any, are close enough in sector, stage, and region for a licensed adviser to use?',
      'What is missing from the comparison, including notes that are stale or too few?',
      'What should a licensed adviser confirm before you rely on any figure?',
    ],
    sources: parsed.notes.map((note) => ({ title: note.title, url: note.url, dated: note.dated })),
    limits: LIMITS,
    generated_on: input.generatedOn,
    model_id: input.modelId,
    model_skip_reason: input.modelSkipReason,
  })
}

function parsePricing(text: string): {
  company: string
  sector: string
  stage: string
  region: string
  asking: number | null
  revenue: number | null
  notes: Note[]
  unused: string[]
} {
  const parsed = {
    company: '',
    sector: '',
    stage: '',
    region: '',
    asking: null as number | null,
    revenue: null as number | null,
    notes: [] as Note[],
    unused: [] as string[],
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.length > 500) continue
    const match = line.match(/^([^:]{2,40}):\s*(.+)$/)
    if (!match) {
      parsed.unused.push(line.slice(0, 220))
      continue
    }
    const key = match[1].trim().toLowerCase()
    const value = match[2].trim()
    if (key === 'company') parsed.company = value.slice(0, 160)
    else if (key === 'sector') parsed.sector = value.slice(0, 160)
    else if (key === 'stage') parsed.stage = value.slice(0, 80)
    else if (key === 'region') parsed.region = value.slice(0, 80)
    else if (key === 'asking figure sar' || key === 'asking figure') parsed.asking = readMoney(value)
    else if (key === 'revenue sar' || key === 'revenue') parsed.revenue = readMoney(value)
    else if (key === 'public note') {
      const note = parseNote(value)
      if (note) parsed.notes.push(note)
      else parsed.unused.push(line.slice(0, 220))
    } else if (key === 'contact') continue
    else parsed.unused.push(line.slice(0, 220))
  }
  return parsed
}

function parseNote(value: string): Note | null {
  const parts = value.split('|').map((part) => part.trim())
  if (parts.length < 3) return null
  const [title, url, dated, pricePart = '', multiplePart = ''] = parts
  if (!title || !dated || !/^https:\/\/[^\s]+$/i.test(url)) return null
  const price = readRange(pricePart)
  const band = readRange(multiplePart)
  return {
    title: title.slice(0, 180),
    url,
    dated: dated.slice(0, 40),
    priceLow: price?.low ?? null,
    priceHigh: price?.high ?? null,
    multipleLow: band?.low ?? null,
    multipleHigh: band?.high ?? null,
  }
}

function readMoney(value: string): number | null {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return null
  const amount = Number(digits)
  if (!Number.isSafeInteger(amount) || amount <= 0) return null
  return amount
}

function readRange(value: string): { low: number; high: number } | null {
  const match = value.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:to|-)\s*(\d[\d,]*(?:\.\d+)?)/i)
  if (!match) return null
  const low = Number(match[1].replace(/,/g, ''))
  const high = Number(match[2].replace(/,/g, ''))
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) return null
  return { low: Math.min(low, high), high: Math.max(low, high) }
}

function sar(amount: number): string {
  const digits = String(Math.round(amount))
  return `SAR ${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function multiple(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const text = rounded.toFixed(1).replace(/\.0$/, '')
  return `${text}x`
}

/**
 * Labelled figures from a CFO upload. CSV rows, spreadsheet rows, and PDF
 * text all land here as plain text. No accounting opinion is applied.
 */

export type CfoRead = {
  company: string | null
  website: string | null
  currency: string
  cash: number | null
  monthlyBurn: number | null
  revenue: number | null
  cogs: number | null
  operatingExpenses: number | null
  netIncome: number | null
  currentAssets: number | null
  currentLiabilities: number | null
  accountsReceivable: number | null
  accountsPayable: number | null
  runwayMonths: number | null
  grossMargin: number | null
  netMargin: number | null
  workingCapital: number | null
  dsoDays: number | null
  annualBurn: number | null
  burnGap: number | null
}

type MoneyKey =
  | 'cash'
  | 'monthlyBurn'
  | 'revenue'
  | 'cogs'
  | 'operatingExpenses'
  | 'netIncome'
  | 'currentAssets'
  | 'currentLiabilities'
  | 'accountsReceivable'
  | 'accountsPayable'

type LabelKey = MoneyKey | 'company' | 'website' | 'currency' | 'netLoss'

const LABELS: { phrase: string; key: LabelKey }[] = [
  { phrase: 'cost of goods sold', key: 'cogs' },
  { phrase: 'operating expenses', key: 'operatingExpenses' },
  { phrase: 'accounts receivable', key: 'accountsReceivable' },
  { phrase: 'trade receivables', key: 'accountsReceivable' },
  { phrase: 'accounts payable', key: 'accountsPayable' },
  { phrase: 'trade payables', key: 'accountsPayable' },
  { phrase: 'current liabilities', key: 'currentLiabilities' },
  { phrase: 'current assets', key: 'currentAssets' },
  { phrase: 'monthly cash burn', key: 'monthlyBurn' },
  { phrase: 'monthly burn', key: 'monthlyBurn' },
  { phrase: 'cash and cash equivalents', key: 'cash' },
  { phrase: 'cash balance', key: 'cash' },
  { phrase: 'net income', key: 'netIncome' },
  { phrase: 'net profit', key: 'netIncome' },
  { phrase: 'net loss', key: 'netLoss' },
  { phrase: 'total revenue', key: 'revenue' },
  { phrase: 'cost of sales', key: 'cogs' },
  { phrase: 'revenue', key: 'revenue' },
  { phrase: 'company', key: 'company' },
  { phrase: 'website', key: 'website' },
  { phrase: 'currency', key: 'currency' },
  { phrase: 'receivables', key: 'accountsReceivable' },
  { phrase: 'payables', key: 'accountsPayable' },
  { phrase: 'cogs', key: 'cogs' },
  { phrase: 'opex', key: 'operatingExpenses' },
  { phrase: 'cash', key: 'cash' },
]

export function readCfoFigures(raw: string): CfoRead {
  const read = emptyRead()
  const text = raw.replace(/^\uFEFF/, '').replace(/\u0000/g, ' ').replace(/\r/g, '\n')
  for (const hit of labelHits(text)) {
    const value = text.slice(hit.from, hit.to).replace(/^[\s:|,;\t|]+/, '').trim()
    apply(read, hit.key, value)
  }
  return derive(read)
}

export function cfoHasFigures(read: CfoRead): boolean {
  return [
    read.cash,
    read.monthlyBurn,
    read.revenue,
    read.cogs,
    read.operatingExpenses,
    read.netIncome,
    read.currentAssets,
    read.currentLiabilities,
  ].some((value) => value != null)
}

export function formatMoney(currency: string, value: number): string {
  const negative = value < 0
  const abs = Math.abs(value)
  const digits = Number.isInteger(abs) ? abs.toString() : abs.toFixed(2)
  const [whole, frac] = digits.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${currency} ${frac ? `${grouped}.${frac}` : grouped}`
}

export function formatPercent(ratio: number): string {
  const rounded = Math.round(ratio * 1000) / 10
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

export function formatMonths(months: number, lang: 'en' | 'ar'): string {
  const rounded = Math.round(months * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return lang === 'ar' ? `${text} شهراً` : `${text} ${rounded === 1 ? 'month' : 'months'}`
}

function emptyRead(): CfoRead {
  return {
    company: null,
    website: null,
    currency: 'SAR',
    cash: null,
    monthlyBurn: null,
    revenue: null,
    cogs: null,
    operatingExpenses: null,
    netIncome: null,
    currentAssets: null,
    currentLiabilities: null,
    accountsReceivable: null,
    accountsPayable: null,
    runwayMonths: null,
    grossMargin: null,
    netMargin: null,
    workingCapital: null,
    dsoDays: null,
    annualBurn: null,
    burnGap: null,
  }
}

function derive(read: CfoRead): CfoRead {
  const runwayMonths = read.cash != null && read.monthlyBurn != null && read.monthlyBurn > 0 ? read.cash / read.monthlyBurn : null
  const grossMargin = read.revenue != null && read.cogs != null && read.revenue !== 0 ? (read.revenue - read.cogs) / read.revenue : null
  const netMargin = read.revenue != null && read.netIncome != null && read.revenue !== 0 ? read.netIncome / read.revenue : null
  const workingCapital =
    read.currentAssets != null && read.currentLiabilities != null ? read.currentAssets - read.currentLiabilities : null
  const dsoDays =
    read.revenue != null && read.revenue > 0 && read.accountsReceivable != null
      ? read.accountsReceivable / (read.revenue / 365)
      : null
  const annualBurn = read.monthlyBurn != null && read.monthlyBurn > 0 ? read.monthlyBurn * 12 : null
  const reportedUse = read.netIncome != null && read.netIncome < 0 ? -read.netIncome : read.netIncome != null ? 0 : null
  const burnGap =
    annualBurn != null && reportedUse != null ? Math.abs(annualBurn - reportedUse) : null
  return { ...read, runwayMonths, grossMargin, netMargin, workingCapital, dsoDays, annualBurn, burnGap }
}

type Hit = { key: LabelKey; from: number; to: number; index: number; length: number }

function labelHits(text: string): Hit[] {
  const lower = text.toLowerCase()
  const found: { key: LabelKey; index: number; length: number }[] = []
  for (const label of LABELS) {
    let from = 0
    while (from < lower.length) {
      const at = lower.indexOf(label.phrase, from)
      if (at < 0) break
      const before = at === 0 ? ' ' : lower[at - 1]
      const after = lower[at + label.phrase.length] ?? ' '
      if (!/[a-z]/i.test(before) && !/[a-z]/i.test(after)) {
        const overlaps = found.some(
          (hit) => at < hit.index + hit.length && at + label.phrase.length > hit.index,
        )
        if (!overlaps) found.push({ key: label.key, index: at, length: label.phrase.length })
      }
      from = at + label.phrase.length
    }
  }
  found.sort((a, b) => a.index - b.index || b.length - a.length)
  const kept: { key: LabelKey; index: number; length: number }[] = []
  for (const hit of found) {
    const overlaps = kept.some((prev) => hit.index < prev.index + prev.length && hit.index + hit.length > prev.index)
    if (!overlaps) kept.push(hit)
  }
  return kept.map((hit, index) => ({
    key: hit.key,
    index: hit.index,
    length: hit.length,
    from: hit.index + hit.length,
    to: kept[index + 1]?.index ?? text.length,
  }))
}

function apply(read: CfoRead, key: LabelKey, value: string) {
  if (key === 'company') {
    if (!read.company) read.company = parseCompany(value)
    return
  }
  if (key === 'website') {
    if (!read.website) read.website = parseWebsite(value)
    return
  }
  if (key === 'currency') {
    const code = value.match(/\b[A-Za-z]{3}\b/)
    if (code) read.currency = code[0].toUpperCase()
    return
  }
  if (key === 'netLoss') {
    if (read.netIncome != null) return
    const amount = parseMoney(value)
    if (amount == null) return
    read.netIncome = amount > 0 ? -amount : amount
    return
  }
  if (read[key] != null) return
  const amount = parseMoney(value)
  if (amount == null) return
  read[key] = amount
}

function parseMoney(value: string): number | null {
  const match = value.match(/-?\(?\d[\d,]*(?:\.\d+)?\)?/)
  if (!match) return null
  let token = match[0].replace(/,/g, '')
  let negative = false
  if (token.startsWith('-')) {
    negative = true
    token = token.slice(1)
  }
  if (token.startsWith('(') || token.endsWith(')')) {
    negative = true
    token = token.replace(/[()]/g, '')
  }
  const num = Number(token)
  if (!Number.isFinite(num)) return null
  return negative ? -num : num
}

function parseCompany(value: string): string | null {
  const cleaned = value.replace(/[|,]/g, ' ').replace(/\s+/g, ' ').trim()
  const cut = cleaned.split(/\d{3,}/)[0]?.trim() ?? ''
  if (cut.length < 2 || cut.length > 80) return null
  return cut
}

function parseWebsite(value: string): string | null {
  const match = value.match(/[a-z0-9.-]+\.[a-z]{2,}/i)
  if (!match) return null
  return match[0].replace(/\.$/, '').toLowerCase()
}

/**
 * Display cleanup for the AI tools recent list.
 * Stored report rows stay as they are. This only chooses a title, drops repeats, and caps the list.
 */

export type RecentReportInput = {
  id: string
  company_label: string
  file_name: string
}

export type RecentReportRow = {
  id: string
  title: string
}

const RECENT_LIMIT = 5

const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'for', 'in', 'on', 'at', 'by', 'it'])
const ACRONYMS = new Set(['ai', 'ksa', 'pe', 'vc'])

const WORDS = new Set([
  'a',
  'an',
  'ai',
  'all',
  'and',
  'annual',
  'arabia',
  'are',
  'asset',
  'at',
  'bank',
  'banking',
  'board',
  'by',
  'capital',
  'case',
  'central',
  'centralized',
  'city',
  'company',
  'confidential',
  'consortium',
  'cost',
  'costs',
  'deal',
  'deals',
  'development',
  'digital',
  'diligence',
  'due',
  'east',
  'economy',
  'energy',
  'equity',
  'estate',
  'family',
  'finance',
  'financial',
  'first',
  'for',
  'from',
  'fund',
  'funds',
  'future',
  'gateway',
  'global',
  'goes',
  'going',
  'gone',
  'group',
  'growth',
  'health',
  'holding',
  'holdings',
  'how',
  'in',
  'industrial',
  'industry',
  'insurance',
  'international',
  'into',
  'investment',
  'investments',
  'is',
  'it',
  'its',
  'ksa',
  'law',
  'legal',
  'limited',
  'made',
  'make',
  'management',
  'market',
  'markets',
  'model',
  'national',
  'net',
  'new',
  'next',
  'north',
  'not',
  'of',
  'office',
  'on',
  'or',
  'over',
  'partner',
  'partners',
  'pe',
  'per',
  'plan',
  'private',
  'project',
  'public',
  'quarterly',
  'real',
  'region',
  'regional',
  'report',
  'return',
  'revenue',
  'review',
  'right',
  'risk',
  'saudi',
  'sector',
  'seed',
  'series',
  'south',
  'strategy',
  'the',
  'to',
  'total',
  'trade',
  'vc',
  'venture',
  'via',
  'vision',
  'west',
  'what',
  'when',
  'where',
  'who',
  'why',
  'with',
  'wrong',
  'year',
  'years',
])

function tidyReportTitle(raw: string): string {
  let text = raw.normalize('NFKC')
  text = text.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
  text = text.replace(/[\u00D2\u00D3]/g, '')
  text = text.replace(/[\u201C\u201D\u2018\u2019\u00AB\u00BB]/g, '')
  text = text.replace(/\u2014/g, ', ').replace(/\u2013/g, '-')
  text = text.replace(/\s+/g, ' ').trim()
  text = collapseLetterSpacing(text)
  return restyleCapsRuns(text)
}

function collapseLetterSpacing(value: string): string {
  const tokens = value.split(/\s+/).filter(Boolean)
  if (tokens.length < 8) return value
  const singles = tokens.filter((token) => /^\p{L}$/u.test(token)).length
  if (singles / tokens.length < 0.75) return value
  let out = ''
  for (const token of tokens) {
    if (/^\p{L}$/u.test(token)) {
      out += token
      continue
    }
    if (out && !out.endsWith(' ')) out += ' '
    out += token
    if (!out.endsWith(' ')) out += ' '
  }
  return out.replace(/\s+/g, ' ').trim()
}

function restyleCapsRuns(value: string): string {
  return value
    .split(/(\s+|·)/)
    .map((part) => {
      if (!/^[A-Z]{4,}$/.test(part)) return part
      const segmented = segmentCaps(part)
      if (!segmented) return part
      return styleWords(segmented)
    })
    .join('')
}

function segmentCaps(word: string): string | null {
  const lower = word.toLowerCase()
  const parts: string[] = []
  let index = 0
  while (index < lower.length) {
    let match = ''
    const max = Math.min(16, lower.length - index)
    for (let len = max; len >= 2; len -= 1) {
      const slice = lower.slice(index, index + len)
      if (WORDS.has(slice)) {
        match = slice
        break
      }
    }
    if (!match) return null
    parts.push(match)
    index += match.length
  }
  return parts.join(' ')
}

function styleWords(value: string): string {
  return value
    .split(' ')
    .map((word, index) => {
      if (ACRONYMS.has(word)) return word.toUpperCase()
      if (index > 0 && SMALL_WORDS.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

function stripExtension(name: string): string {
  return name.replace(/\.(pdf|pptx|ppt|docx|doc)$/i, '').replace(/[_]+/g, ' ').trim()
}

function usableTitle(value: string): boolean {
  if (!value) return false
  if (/^not stated\b/i.test(value)) return false
  return true
}

export function reportListTitle(company: string, fileName: string): string {
  const fromCompany = tidyReportTitle(company)
  if (usableTitle(fromCompany)) return fromCompany
  const fromFile = tidyReportTitle(stripExtension(fileName))
  if (usableTitle(fromFile)) return fromFile
  return 'Due diligence report'
}

export function recentReports(items: readonly RecentReportInput[], limit = RECENT_LIMIT): RecentReportRow[] {
  const seen = new Set<string>()
  const rows: RecentReportRow[] = []
  const cap = limit > 0 ? limit : RECENT_LIMIT
  for (const item of items) {
    const title = reportListTitle(item.company_label || '', item.file_name || '')
    const key = title.toLowerCase().replace(/[·•]/g, ' ').replace(/\s+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ id: item.id, title })
    if (rows.length >= cap) break
  }
  return rows
}

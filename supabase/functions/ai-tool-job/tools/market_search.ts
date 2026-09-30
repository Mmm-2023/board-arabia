import { formatReportDate } from '../../_shared/ai_tools.ts'
import {
  acceptPublicSourceUrl,
  marketSearchQueries,
  type MarketSearchHit,
  type MarketTopicId,
} from './market_brief.ts'

const SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** A source date from a search payload. Relative ages are dropped, not guessed. */
export function sourceDateFromPageAge(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!iso) return null
  const year = Number(iso[1])
  const month = Number(iso[2])
  const day = Number(iso[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const label = formatReportDate(date)
  const expectedMonth = MONTHS[month - 1]
  if (!label.startsWith(String(day).padStart(2, '0')) || !label.includes(expectedMonth || '')) return null
  return label
}

export function hitsFromSearchBody(body: unknown, topic: MarketTopicId): MarketSearchHit[] {
  if (!body || typeof body !== 'object') return []
  const web = (body as { web?: { results?: unknown } }).web
  const results = web && Array.isArray(web.results) ? web.results : []
  const hits: MarketSearchHit[] = []
  for (const result of results) {
    if (!result || typeof result !== 'object') continue
    const row = result as { title?: unknown; url?: unknown; description?: unknown; page_age?: unknown }
    if (typeof row.title !== 'string' || typeof row.url !== 'string' || typeof row.description !== 'string') continue
    const url = acceptPublicSourceUrl(row.url)
    const dated = sourceDateFromPageAge(row.page_age)
    const snippet = row.description.replace(/\s+/g, ' ').trim()
    if (!url || !dated || snippet.length < 8) continue
    hits.push({ topic, title: row.title.replace(/\s+/g, ' ').trim(), url, dated, snippet })
    if (hits.length >= 2) break
  }
  return hits
}

/**
 * Brave web search. A blank key does not call the network.
 * Null means every query failed. An empty array means search ran and returned nothing dated.
 */
export async function searchMarketSector(
  sector: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketSearchHit[] | null> {
  const token = key.trim()
  if (!token) return null
  const hits: MarketSearchHit[] = []
  let failures = 0
  const queries = marketSearchQueries(sector)
  for (const query of queries) {
    const found = await searchOne(query.q, query.topic, token, fetchImpl)
    if (found === null) {
      failures += 1
      continue
    }
    hits.push(...found)
  }
  if (failures === queries.length) return null
  return hits
}

async function searchOne(
  term: string,
  topic: MarketTopicId,
  key: string,
  fetchImpl: typeof fetch,
): Promise<MarketSearchHit[] | null> {
  const query = term.replace(/[^\w\s.:-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  if (query.length < 2) return []
  const url = new URL(SEARCH_ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('count', '3')
  url.searchParams.set('search_lang', 'en')
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': key,
        'User-Agent': BROWSER_UA,
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    const body = (await response.json()) as unknown
    return hitsFromSearchBody(body, topic)
  } catch {
    return null
  }
}

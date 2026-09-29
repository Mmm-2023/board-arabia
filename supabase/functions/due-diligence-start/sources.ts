import {
  htmlToText,
  isBlockedPublicSourceUrl,
  isPublicIp,
  parsePublicHttpsUrl,
  publicHitMatchesTerm,
  relatedCompanyUrls,
  searchMatchTerm,
  wikiHitMatchesTerm,
  type RetrievedPage,
} from '../_shared/due_diligence.ts'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const PAGE_CAP = 6
const SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

export type PublicRetrieval = {
  pages: RetrievedPage[]
  searchRan: boolean
  searchSkipReason: string | null
  sourcesFetched: number
}

export async function retrievePublicPages(input: {
  companyUrl: string | null
  searchTerms: string[]
}): Promise<PublicRetrieval> {
  const pages: RetrievedPage[] = []
  const key = Deno.env.get('BA_DD_SEARCH_API_KEY')?.trim()
  let searchRan = false
  let searchSkipReason: string | null = key ? null : 'missing_api_key'
  let searchAttempts = 0
  let searchFailures = 0
  if (key) {
    searchRan = true
    for (const term of input.searchTerms) {
      if (pages.length >= PAGE_CAP) break
      searchAttempts += 1
      const hits = await searchWebHits(term, key)
      if (hits === null) {
        searchFailures += 1
        continue
      }
      for (const hit of hits) {
        if (pages.length >= PAGE_CAP) break
        const page = await fetchPublicPage(hit.url)
        if (page && !pages.some((item) => item.url === page.url)) pages.push(page)
      }
    }
    if (searchAttempts > 0 && searchFailures === searchAttempts) searchSkipReason = 'search_request_failed'
  }
  for (const term of input.searchTerms) {
    if (pages.length >= PAGE_CAP) break
    if (/\bsite:/i.test(term)) continue
    const wiki = await wikipediaPage(term)
    if (wiki && !pages.some((page) => page.url === wiki.url)) pages.push(wiki)
    if (pages.length >= PAGE_CAP) break
    const data = await wikidataPage(term)
    if (data && !pages.some((page) => page.url === data.url)) pages.push(data)
  }
  if (input.companyUrl && !isBlockedPublicSourceUrl(input.companyUrl) && pages.length < PAGE_CAP) {
    const site = await fetchPublicPage(input.companyUrl)
    if (site && !pages.some((item) => item.url === site.url)) pages.push(site)
    for (const extra of relatedCompanyUrls(input.companyUrl)) {
      if (pages.length >= PAGE_CAP) break
      const page = await fetchPublicPage(extra)
      if (page && !pages.some((item) => item.url === page.url)) pages.push(page)
    }
  }
  const kept = pages.slice(0, PAGE_CAP)
  return {
    pages: kept,
    searchRan,
    searchSkipReason,
    sourcesFetched: kept.length,
  }
}

async function searchWebHits(term: string, key: string): Promise<{ title: string; url: string }[] | null> {
  const query = term.replace(/[^\w\s.:-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  if (query.length < 2) return []
  const url = new URL(SEARCH_ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('count', '3')
  url.searchParams.set('search_lang', 'en')
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': key,
        'User-Agent': BROWSER_UA,
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    const body = (await response.json()) as {
      web?: { results?: { title?: string; url?: string }[] }
    }
    const hits: { title: string; url: string }[] = []
    for (const result of body.web?.results ?? []) {
      if (typeof result.title !== 'string' || typeof result.url !== 'string') continue
      if (isBlockedPublicSourceUrl(result.url)) continue
      if (!publicHitMatchesTerm(result.title, result.url, searchMatchTerm(term))) continue
      hits.push({ title: result.title, url: result.url })
      if (hits.length >= 2) break
    }
    return hits
  } catch {
    return null
  }
}

async function wikipediaPage(term: string): Promise<RetrievedPage | null> {
  const query = term.replace(/[^\w\s.-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (query.length < 2) return null
  const search = new URL('https://en.wikipedia.org/w/api.php')
  search.searchParams.set('action', 'query')
  search.searchParams.set('list', 'search')
  search.searchParams.set('srsearch', query)
  search.searchParams.set('srlimit', '1')
  search.searchParams.set('utf8', '1')
  search.searchParams.set('format', 'json')
  const found = await getJson(search)
  const hit = found?.query?.search?.[0]
  const pageId = hit?.pageid
  const title = typeof hit?.title === 'string' ? hit.title : ''
  if (!pageId || !title || !wikiHitMatchesTerm(title, term)) return null
  const extract = new URL('https://en.wikipedia.org/w/api.php')
  extract.searchParams.set('action', 'query')
  extract.searchParams.set('prop', 'extracts')
  extract.searchParams.set('explaintext', '1')
  extract.searchParams.set('exchars', '3500')
  extract.searchParams.set('pageids', String(pageId))
  extract.searchParams.set('format', 'json')
  const body = await getJson(extract)
  const page = body?.query?.pages?.[String(pageId)]
  const text = typeof page?.extract === 'string' ? page.extract.trim() : ''
  if (text.length < 80) return null
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
  if (!parsePublicHttpsUrl(url).ok) return null
  return { title, url, text: text.slice(0, 3500) }
}

async function wikidataPage(term: string): Promise<RetrievedPage | null> {
  const query = term.replace(/[^\w\s.-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (query.length < 2) return null
  const search = new URL('https://www.wikidata.org/w/api.php')
  search.searchParams.set('action', 'wbsearchentities')
  search.searchParams.set('search', query)
  search.searchParams.set('language', 'en')
  search.searchParams.set('format', 'json')
  search.searchParams.set('limit', '1')
  const body = await getJson(search)
  const hit = body?.search?.[0]
  const id = typeof hit?.id === 'string' ? hit.id : ''
  const label = typeof hit?.label === 'string' ? hit.label : ''
  const description = typeof hit?.description === 'string' ? hit.description.trim() : ''
  if (!/^Q\d+$/.test(id) || description.length < 40 || !wikiHitMatchesTerm(label, term)) return null
  const url = `https://www.wikidata.org/wiki/${id}`
  if (!parsePublicHttpsUrl(url).ok) return null
  return {
    title: label ? `Wikidata: ${label}` : `Wikidata ${id}`,
    url,
    text: description.slice(0, 500),
  }
}

async function fetchPublicPage(raw: string): Promise<RetrievedPage | null> {
  let current = raw
  for (let hop = 0; hop < 3; hop += 1) {
    if (isBlockedPublicSourceUrl(current)) return null
    const parsed = parsePublicHttpsUrl(current)
    if (!parsed.ok) return null
    if (!(await hostResolvesPublic(parsed.url.hostname))) return null
    let response: Response
    try {
      response = await fetch(parsed.url, {
        redirect: 'manual',
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,text/plain;q=0.9' },
        signal: AbortSignal.timeout(8000),
      })
    } catch {
      return null
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return null
      current = new URL(location, parsed.url).toString()
      continue
    }
    if (!response.ok) return null
    const type = response.headers.get('content-type') || ''
    if (!/text\/html|text\/plain/i.test(type)) return null
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > 200_000) return null
    const text = htmlToText(new TextDecoder().decode(buffer)).slice(0, 8000)
    if (text.length < 80) return null
    if (looksLikeLoginWall(text)) return null
    const headline = text
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .find((line) => line.length >= 4 && line.length <= 120) || parsed.url.hostname
    return {
      title: headline,
      url: `${parsed.url.origin}${parsed.url.pathname}`,
      text,
    }
  }
  return null
}

function looksLikeLoginWall(text: string): boolean {
  if (text.length > 700) return false
  const head = text.slice(0, 280).toLowerCase()
  return /\b(sign in|log in|data room)\b/.test(head)
}

async function hostResolvesPublic(hostname: string): Promise<boolean> {
  const ips: string[] = []
  try {
    ips.push(...(await Deno.resolveDns(hostname, 'A')))
  } catch {
    // No A record.
  }
  try {
    ips.push(...(await Deno.resolveDns(hostname, 'AAAA')))
  } catch {
    // No AAAA record.
  }
  if (ips.length === 0) return false
  return ips.every((ip) => isPublicIp(ip))
}

async function getJson(url: URL): Promise<JsonRecord | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    const body = (await response.json()) as JsonRecord
    return body
  } catch {
    return null
  }
}

type JsonRecord = {
  query?: {
    search?: { pageid?: number; title?: string }[]
    pages?: Record<string, { extract?: string }>
  }
  search?: { id?: string; label?: string; description?: string }[]
}

import type { StubInput, StubOutput } from './types.ts'

/**
 * Frame placeholder only. The live brief is buildMarketBrief.
 * That path copies dated public hits and does not call this function.
 */
export function marketBriefOutput(input: StubInput): StubOutput {
  return {
    tool_key: 'market_brief',
    title: 'Market brief',
    summary:
      'Placeholder brief on entering the Saudi market. General and sourced. Rules change often. This is not legal or tax advice.',
    findings: [
      'Licences, local partner rules, Saudization, and incentives are not confirmed for a specific case here.',
    ],
    questions: ['What should a licensed Saudi lawyer and MISA confirm before you act?'],
    sources: [
      {
        title: 'Example public note on market entry',
        url: 'https://example.com/misa',
        dated: input.generatedOn,
      },
    ],
    limits: 'General and sourced. Every source is dated. Confirm current rules with a licensed Saudi lawyer and the relevant authority.',
    generated_on: input.generatedOn,
    model_id: input.modelId,
    model_skip_reason: input.modelSkipReason,
  }
}

/** Same eight sectors as the member profile list. The stored value is the English label. */
export const MARKET_SECTORS = [
  { en: 'Energy transition', ar: 'تحول الطاقة' },
  { en: 'Health', ar: 'الصحة' },
  { en: 'Tourism', ar: 'السياحة' },
  { en: 'Financial services', ar: 'الخدمات المالية' },
  { en: 'Logistics', ar: 'الخدمات اللوجستية' },
  { en: 'Mining', ar: 'التعدين' },
  { en: 'Digital infrastructure', ar: 'البنية التحتية الرقمية' },
  { en: 'Food security', ar: 'الأمن الغذائي' },
] as const

export type MarketSector = (typeof MARKET_SECTORS)[number]['en']

export const MARKET_TOPICS = [
  { id: 'licences', en: 'Licences', ar: 'التراخيص' },
  { id: 'ownership', en: 'Foreign ownership and local partner', ar: 'الملكية الأجنبية والشريك المحلي' },
  { id: 'saudization', en: 'Saudization (Nitaqat)', ar: 'التوطين (نطاقات)' },
  { id: 'incentives', en: 'Incentives', ar: 'الحوافز' },
] as const

export type MarketTopicId = (typeof MARKET_TOPICS)[number]['id']

export type MarketSearchHit = {
  topic: MarketTopicId
  title: string
  url: string
  dated: string
  snippet: string
}

const DATED = /^\d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/

export function isMarketSector(value: string): value is MarketSector {
  return MARKET_SECTORS.some((item) => item.en === value)
}

export function marketFileName(sector: string): string {
  return `${sector}.txt`
}

export function sectorFromFileName(name: string): MarketSector | null {
  const base = name.trim().replace(/\.txt$/i, '')
  return isMarketSector(base) ? base : null
}

export function marketSearchQueries(sector: string): { topic: MarketTopicId; q: string }[] {
  return [
    { topic: 'licences', q: `Saudi Arabia ${sector} investment licence MISA` },
    { topic: 'ownership', q: `Saudi Arabia ${sector} foreign ownership local partner` },
    { topic: 'saudization', q: `Saudi Arabia ${sector} Saudization Nitaqat` },
    { topic: 'incentives', q: `Saudi Arabia ${sector} investment incentives` },
  ]
}

/** https only. Drops localhost, credentials, and non-public hosts. Does not invent a host. */
export function acceptPublicSourceUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 300) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.port && url.port !== '443') return null
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host.includes('.') || host.length > 200) return null
  if (!/^[a-z0-9.-]+$/.test(host)) return null
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return null
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return null
  return url.toString()
}

function cleanText(value: string, max: number): string {
  const text = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text
}

function usableHit(hit: MarketSearchHit): boolean {
  if (!MARKET_TOPICS.some((topic) => topic.id === hit.topic)) return false
  if (!DATED.test(hit.dated)) return false
  if (!acceptPublicSourceUrl(hit.url)) return false
  if (!cleanText(hit.title, 180) || !cleanText(hit.snippet, 320)) return false
  return true
}

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] as const
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function arDigits(value: string): string {
  return value.replace(/\d/g, (digit) => AR_DIGITS[Number(digit)] ?? digit)
}

/** Arabic dates follow the legal pages: eastern digits and the Arabic month name. */
export function localizeReportDate(dated: string, lang: 'en' | 'ar'): string {
  if (lang !== 'ar') return dated
  const match = /^(\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/.exec(dated.trim())
  if (!match) return dated
  const monthIndex = EN_MONTHS.findIndex((item) => item === match[2])
  const month = AR_MONTHS[monthIndex]
  if (!month) return dated
  return `${arDigits(match[1])} ${month} ${arDigits(match[3])}`
}

function sectorLabel(sector: string, lang: 'en' | 'ar'): string {
  const found = MARKET_SECTORS.find((item) => item.en === sector)
  if (!found) return lang === 'ar' ? 'هذا القطاع' : 'this sector'
  return lang === 'ar' ? found.ar : found.en
}

const QUESTIONS = {
  en: [
    'Which licence applies to this sector today, and which authority issues it?',
    'Does this sector still require a local partner or a foreign ownership limit?',
    'What Nitaqat band applies, and which roles count toward Saudization?',
    'Which incentives are open now, and what are the conditions?',
    'What should a licensed Saudi lawyer and MISA confirm before you act?',
  ],
  ar: [
    'أي ترخيص ينطبق على هذا القطاع اليوم، وأي جهة تصدره؟',
    'هل ما زال هذا القطاع يتطلب شريكاً محلياً أو حداً للملكية الأجنبية؟',
    'ما نطاق نطاقات الذي ينطبق، وأي أدوار تُحتسب في التوطين؟',
    'أي حوافز متاحة الآن، وما شروطها؟',
    'ما الذي يجب أن يؤكده محامٍ سعودي مرخّص ووزارة الاستثمار قبل التصرف؟',
  ],
} as const

const LIMITS = {
  en: 'This brief does not confirm what applies to your specific case. It does not replace a licensed Saudi lawyer, tax adviser, or the relevant government authority. Confirm current rules with a licensed Saudi lawyer and the relevant authority.',
  ar: 'لا يؤكد هذا الموجز ما ينطبق على حالتك تحديداً. ولا يغني عن محامٍ سعودي مرخّص أو مستشار ضريبي أو الجهة الحكومية المختصة. تحقّق من الأنظمة السارية مع محامٍ سعودي مرخّص والجهة المختصة.',
} as const

/**
 * One-page brief. Every source is one of the hits passed in.
 * An empty hit list stays empty. Nothing is filled in from memory.
 * Arabic runs use Arabic findings, questions, and the Arabic disclaimer.
 * Source titles stay in the language of the page.
 */
export function buildMarketBrief(input: {
  sector: string
  hits: readonly MarketSearchHit[]
  generatedOn: string
  lang?: 'en' | 'ar'
}): StubOutput {
  const lang = input.lang === 'ar' ? 'ar' : 'en'
  const seen = new Set<string>()
  const kept: MarketSearchHit[] = []
  for (const hit of input.hits) {
    if (!usableHit(hit)) continue
    const url = acceptPublicSourceUrl(hit.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    kept.push({
      topic: hit.topic,
      title: cleanText(hit.title, 180),
      url,
      dated: localizeReportDate(hit.dated, lang),
      snippet: cleanText(hit.snippet, 320),
    })
  }

  const findings: string[] = []
  for (const topic of MARKET_TOPICS) {
    const rows = kept.filter((hit) => hit.topic === topic.id).slice(0, 2)
    const label = topic[lang]
    if (rows.length === 0) {
      findings.push(
        lang === 'ar'
          ? `${label}: لم يُرجع مصدر عام مؤرخ لهذه النقطة.`
          : `${label}: No dated public source was returned for this point.`,
      )
      continue
    }
    if (lang === 'ar') {
      findings.push(`${label}: وُجد مصدر عام مؤرخ في القائمة أدناه. النقطة عامة وليست تأكيداً لما ينطبق على حالتك.`)
      continue
    }
    for (const row of rows) {
      findings.push(`${label}: ${row.snippet}`)
    }
  }

  const sector = sectorLabel(input.sector, lang)
  const summary = lang === 'ar'
    ? `موجز عام عن دخول السوق السعودي في ${sector}، مبني فقط على المصادر العامة المؤرخة أدناه. لا يؤكد ما ينطبق على حالة بعينها. تتغير الأنظمة كثيراً. هذه ليست استشارة قانونية أو ضريبية.`
    : `A general brief on entering the Saudi market in ${sector}, drawn only from the dated public sources below. It does not confirm what applies to a specific case. Rules change often. This is not legal or tax advice.`
  return {
    tool_key: 'market_brief',
    title: lang === 'ar' ? 'موجز دخول السوق السعودي' : 'Market brief',
    summary,
    findings,
    questions: [...QUESTIONS[lang]],
    sources: kept.map((hit) => ({ title: hit.title, url: hit.url, dated: hit.dated })),
    limits: LIMITS[lang],
    generated_on: localizeReportDate(input.generatedOn, lang),
    model_id: null,
    model_skip_reason: 'public_search',
  }
}

import {
  cfoHasFigures,
  formatMoney,
  formatMonths,
  formatPercent,
  readCfoFigures,
  type CfoRead,
} from './cfo_figures.ts'
import type { CfoMetric, StubInput, StubOutput } from './types.ts'

const LIMITS = {
  en: 'This is not SOCPA accounting or audit, and it is not financial advice. Figures are taken from the file you uploaded. They are not checked against IFRS or SOCPA standards, and they are not verified as true.',
  ar: 'هذه ليست محاسبة أو تدقيقاً وفق معايير الهيئة السعودية للمراجعين والمحاسبين، وليست استشارة مالية. الأرقام مأخوذة من الملف الذي رفعته، ولم يُتحقق من صحتها.',
} as const

export const CFO_MODEL_SYSTEM =
  'You draft questions a member can ask their finance lead. Use only the figures in the user message. Do not give accounting, audit, tax, investment, or financial advice. Do not recommend buying, selling, or holding anything. Do not change any figure. Return JSON with a questions array of at most 3 short questions.'

const BLOCKED_QUESTION = new RegExp(
  `\\b(buy|sell|buying|selling|invest|investing|${'valu'}ation)\\b|اشتري|استثمر|تقييم`,
  'i',
)

export function cfoCheckOutput(input: StubInput): StubOutput {
  const lang = input.lang === 'ar' ? 'ar' : 'en'
  const read = input.sourceText ? readCfoFigures(input.sourceText) : null
  if (!read || !cfoHasFigures(read)) return emptyOutput(input, lang)
  return computedOutput(input, lang, read)
}

export function cfoModelUser(output: StubOutput): string {
  return [
    output.summary,
    ...(output.metrics ?? []).map((item) => `${item.label}: ${item.value}. ${item.note ?? ''}`),
    ...(output.red_flags ?? []),
  ].join('\n')
}

export function appendCfoModelQuestions(output: StubOutput, modelText: string | null): StubOutput {
  if (!modelText) return output
  const extra = parseModelQuestions(modelText).filter((item) => !BLOCKED_QUESTION.test(item))
  if (extra.length === 0) return output
  const questions = [...output.questions]
  const seen = new Set(questions)
  for (const item of extra) {
    if (seen.has(item) || questions.length >= 7) continue
    questions.push(item)
    seen.add(item)
  }
  return { ...output, questions }
}

function emptyOutput(input: StubInput, lang: 'en' | 'ar'): StubOutput {
  return {
    tool_key: 'cfo_check',
    title: lang === 'ar' ? 'الفحص المالي بالذكاء الاصطناعي' : 'CFO check',
    summary:
      lang === 'ar'
        ? `تعذر حساب مدة التشغيل المتبقية أو الهوامش أو رأس المال العامل من ${input.fileName}. هذه ليست محاسبة أو تدقيقاً وفق معايير الهيئة السعودية للمراجعين والمحاسبين.`
        : `Could not calculate runway, margins, or working capital from ${input.fileName}. This is not SOCPA accounting or audit.`,
    findings: [
      lang === 'ar'
        ? 'لم يُعثر في الملف على أرقام معنونة للنقد أو الإيراد أو التكلفة أو رأس المال العامل.'
        : 'No labelled cash, revenue, cost, or working capital figures were found in the file.',
    ],
    questions: [
      lang === 'ar'
        ? 'أي بنود للنقد والإيراد والتكلفة والأصول المتداولة والالتزامات المتداولة يجب أن يؤكدها فريقك المالي؟'
        : 'Which cash, revenue, cost, and current asset and liability lines should your finance team confirm?',
    ],
    sources: [],
    limits: LIMITS[lang],
    generated_on: input.generatedOn,
    model_id: input.modelId,
    model_skip_reason: input.modelSkipReason,
  }
}

function computedOutput(input: StubInput, lang: 'en' | 'ar', read: CfoRead): StubOutput {
  const metrics = metricCards(read, lang)
  const redFlags = redFlagLines(read, lang)
  return {
    tool_key: 'cfo_check',
    title: lang === 'ar' ? 'الفحص المالي بالذكاء الاصطناعي' : 'CFO check',
    summary: summary(input, lang, read),
    findings: findingLines(input, lang, read),
    questions: questionLines(read, lang),
    sources: [],
    limits: LIMITS[lang],
    generated_on: input.generatedOn,
    model_id: input.modelId,
    model_skip_reason: input.modelSkipReason,
    metrics: metrics.length > 0 ? metrics : undefined,
    red_flags: redFlags.length > 0 ? redFlags : undefined,
  }
}

function summary(input: StubInput, lang: 'en' | 'ar', read: CfoRead): string {
  const who = subject(read)
  const bits: string[] = []
  if (read.runwayMonths != null) {
    bits.push(
      lang === 'ar'
        ? `مدة التشغيل المتبقية ${formatMonths(read.runwayMonths, 'ar')}`
        : `cash runway is ${formatMonths(read.runwayMonths, 'en')}`,
    )
  }
  if (read.grossMargin != null) {
    bits.push(lang === 'ar' ? `هامش مجمل الربح ${formatPercent(read.grossMargin)}` : `gross margin is ${formatPercent(read.grossMargin)}`)
  }
  if (read.netMargin != null) {
    bits.push(lang === 'ar' ? `هامش صافي الربح ${formatPercent(read.netMargin)}` : `net margin is ${formatPercent(read.netMargin)}`)
  }
  if (read.workingCapital != null) {
    bits.push(
      lang === 'ar'
        ? `رأس المال العامل ${formatMoney(read.currency, read.workingCapital)}`
        : `working capital is ${formatMoney(read.currency, read.workingCapital)}`,
    )
  }
  const lead = lang === 'ar' ? `قراءة أولية لـ ${who} من ${input.fileName}.` : `First read of ${who} from ${input.fileName}.`
  const tail =
    lang === 'ar'
      ? 'هذه ليست محاسبة أو تدقيقاً وفق معايير الهيئة السعودية للمراجعين والمحاسبين.'
      : 'This is not SOCPA accounting or audit.'
  if (bits.length === 0) {
    const missing =
      lang === 'ar'
        ? 'قُرئت بعض الأرقام، لكن مدة التشغيل المتبقية والهوامش ورأس المال العامل لم تكتمل.'
        : 'Some figures were read, but runway, margins, and working capital could not all be calculated.'
    return `${lead} ${missing} ${tail}`
  }
  const body = lang === 'ar' ? `${bits.join('، و')}.` : `${capitalize(joinAnd(bits))}.`
  return `${lead} ${body} ${tail}`
}

function metricCards(read: CfoRead, lang: 'en' | 'ar'): CfoMetric[] {
  const cards: CfoMetric[] = []
  if (read.runwayMonths != null && read.cash != null && read.monthlyBurn != null) {
    cards.push({
      label: lang === 'ar' ? 'مدة التشغيل المتبقية' : 'Runway',
      value: formatMonths(read.runwayMonths, lang),
      note:
        lang === 'ar'
          ? `النقد ${formatMoney(read.currency, read.cash)} مقسوماً على الحرق الشهري ${formatMoney(read.currency, read.monthlyBurn)}.`
          : `Cash ${formatMoney(read.currency, read.cash)} divided by monthly burn ${formatMoney(read.currency, read.monthlyBurn)}.`,
    })
  }
  if (read.grossMargin != null && read.revenue != null && read.cogs != null) {
    cards.push({
      label: lang === 'ar' ? 'هامش مجمل الربح' : 'Gross margin',
      value: formatPercent(read.grossMargin),
      note:
        lang === 'ar'
          ? `الإيراد ${formatMoney(read.currency, read.revenue)} ناقص تكلفة المبيعات ${formatMoney(read.currency, read.cogs)}.`
          : `Revenue ${formatMoney(read.currency, read.revenue)} less cost of goods sold ${formatMoney(read.currency, read.cogs)}.`,
    })
  }
  if (read.netMargin != null && read.revenue != null && read.netIncome != null) {
    cards.push({
      label: lang === 'ar' ? 'هامش صافي الربح' : 'Net margin',
      value: formatPercent(read.netMargin),
      note:
        lang === 'ar'
          ? `صافي الدخل ${incomePhrase(read, 'ar')} على إيراد ${formatMoney(read.currency, read.revenue)}.`
          : `Net income is ${incomePhrase(read, 'en')} on revenue ${formatMoney(read.currency, read.revenue)}.`,
    })
  }
  if (read.workingCapital != null && read.currentAssets != null && read.currentLiabilities != null) {
    cards.push({
      label: lang === 'ar' ? 'رأس المال العامل' : 'Working capital',
      value: formatMoney(read.currency, read.workingCapital),
      note:
        lang === 'ar'
          ? `الأصول المتداولة ${formatMoney(read.currency, read.currentAssets)} ناقص الالتزامات المتداولة ${formatMoney(read.currency, read.currentLiabilities)}.`
          : `Current assets ${formatMoney(read.currency, read.currentAssets)} less current liabilities ${formatMoney(read.currency, read.currentLiabilities)}.`,
    })
  }
  return cards
}

function redFlagLines(read: CfoRead, lang: 'en' | 'ar'): string[] {
  const flags: string[] = []
  if (read.runwayMonths != null && read.runwayMonths <= 18) {
    const months = formatMonths(read.runwayMonths, lang)
    if (read.runwayMonths < 6) {
      flags.push(
        lang === 'ar'
          ? `مدة التشغيل المتبقية أقل من 6 أشهر (${months}) حسب الحرق الشهري المذكور.`
          : `Cash runway is under 6 months (${months}) at the stated monthly burn.`,
      )
    } else {
      flags.push(
        lang === 'ar'
          ? `مدة التشغيل المتبقية ${months} حسب الحرق الشهري المذكور. ارتفاع الحرق أو انخفاض النقد يقصّرها.`
          : `Cash runway is ${months} at the stated monthly burn. A higher burn or lower cash shortens it.`,
      )
    }
  }
  if (burnMismatch(read) && read.annualBurn != null && read.netIncome != null) {
    flags.push(
      lang === 'ar'
        ? `الحرق الشهري يعني استخدام نقد بنحو ${formatMoney(read.currency, read.annualBurn)} في السنة، بينما صافي الدخل ${incomePhrase(read, 'ar')}. الرقمان لا يتوافقان.`
        : `Monthly burn implies about ${formatMoney(read.currency, read.annualBurn)} of cash use a year. Net income in the file is ${incomePhrase(read, 'en')}. Those two do not line up.`,
    )
  }
  if (read.dsoDays != null && read.dsoDays > 90) {
    const days = String(Math.round(read.dsoDays))
    flags.push(
      lang === 'ar'
        ? `الذمم المدينة تغطي نحو ${days} يوماً من الإيراد.`
        : `Receivables cover about ${days} days of revenue.`,
    )
  }
  if (read.workingCapital != null && read.workingCapital < 0) {
    flags.push(
      lang === 'ar'
        ? `رأس المال العامل سالب عند ${formatMoney(read.currency, read.workingCapital)}. الالتزامات المتداولة أعلى من الأصول المتداولة.`
        : `Working capital is negative at ${formatMoney(read.currency, read.workingCapital)}. Current liabilities are higher than current assets.`,
    )
  }
  if (read.grossMargin != null && read.grossMargin < 0) {
    flags.push(
      lang === 'ar'
        ? `هامش مجمل الربح سالب (${formatPercent(read.grossMargin)}). تكلفة المبيعات أعلى من الإيراد في الملف.`
        : `Gross margin is negative (${formatPercent(read.grossMargin)}). Cost of goods sold is higher than revenue in the file.`,
    )
  }
  return flags
}

function questionLines(read: CfoRead, lang: 'en' | 'ar'): string[] {
  const questions: string[] = []
  if (read.monthlyBurn != null) {
    questions.push(
      lang === 'ar'
        ? `ماذا يشمل الحرق الشهري البالغ ${formatMoney(read.currency, read.monthlyBurn)}، وأي بنود منه غير متكررة؟`
        : `What does the monthly burn of ${formatMoney(read.currency, read.monthlyBurn)} include, and which items are one-off?`,
    )
  }
  if (burnMismatch(read)) {
    questions.push(
      lang === 'ar'
        ? 'ما تفسير الفرق بين الحرق الشهري وصافي الدخل في الملف؟'
        : 'What explains the gap between the monthly burn and the net income in the file?',
    )
  }
  if (read.dsoDays != null && read.dsoDays > 90) {
    const days = String(Math.round(read.dsoDays))
    questions.push(
      lang === 'ar'
        ? `الذمم المدينة تغطي نحو ${days} يوماً من الإيراد. أي أرصدة متأخرة، ومتى يُتوقع تحصيلها؟`
        : `Accounts receivable cover about ${days} days of revenue. Which balances are overdue, and when do you expect to collect them?`,
    )
  }
  if (read.workingCapital != null && read.workingCapital < 0) {
    questions.push(
      lang === 'ar'
        ? 'ما الذي يرفع الالتزامات المتداولة فوق الأصول المتداولة، وما توقيت السداد؟'
        : 'What pushes current liabilities above current assets, and what is the timing of payment?',
    )
  }
  questions.push(
    lang === 'ar'
      ? 'ما الذي يجب أن يؤكده مديرك المالي أو مراجع الحسابات قبل الاعتماد على هذه الأرقام؟'
      : 'What should your CFO or auditor confirm before anyone relies on these figures?',
  )
  return questions
}

function findingLines(input: StubInput, lang: 'en' | 'ar', read: CfoRead): string[] {
  const lines = [
    lang === 'ar'
      ? `قُرئ ${input.fileName}${read.company ? ` لـ ${read.company}` : ''}${read.website ? ` (${read.website})` : ''}. العملة ${read.currency}.`
      : `Read ${input.fileName}${read.company ? ` for ${read.company}` : ''}${read.website ? ` (${read.website})` : ''}. Currency ${read.currency}.`,
  ]
  if (read.operatingExpenses != null) {
    lines.push(
      lang === 'ar'
        ? `المصروفات التشغيلية في الملف ${formatMoney(read.currency, read.operatingExpenses)}.`
        : `Operating expenses in the file are ${formatMoney(read.currency, read.operatingExpenses)}.`,
    )
  }
  if (read.accountsPayable != null) {
    lines.push(
      lang === 'ar'
        ? `الذمم الدائنة في الملف ${formatMoney(read.currency, read.accountsPayable)}.`
        : `Accounts payable in the file are ${formatMoney(read.currency, read.accountsPayable)}.`,
    )
  }
  return lines
}

function burnMismatch(read: CfoRead): boolean {
  if (read.annualBurn == null || read.burnGap == null || read.netIncome == null) return false
  const reported = read.netIncome < 0 ? -read.netIncome : 0
  const base = Math.max(read.annualBurn, reported, 1)
  return read.burnGap > 100_000 && read.burnGap / base > 0.25
}

function incomePhrase(read: CfoRead, lang: 'en' | 'ar'): string {
  const amount = read.netIncome ?? 0
  if (amount < 0) {
    const text = formatMoney(read.currency, Math.abs(amount))
    return lang === 'ar' ? `خسارة ${text}` : `a loss of ${text}`
  }
  return formatMoney(read.currency, amount)
}

function subject(read: CfoRead): string {
  if (read.company && read.website) return `${read.company} (${read.website})`
  return read.company || read.website || 'the uploaded file'
}

function joinAnd(parts: string[]): string {
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

function parseModelQuestions(text: string): string[] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { questions?: unknown }
    if (!Array.isArray(parsed.questions)) return []
    return parsed.questions
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter((item) => item.length >= 12 && item.length <= 280)
      .slice(0, 3)
  } catch {
    return []
  }
}

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  AI_TOOL_BUCKET,
  AI_TOOL_FLAG_DEFAULTS,
  aiToolStoragePath,
  blockVersion,
  ownedAiToolPath,
  safeStoragePath,
  type AiToolKey,
  type ConsentRow,
} from '../supabase/functions/_shared/ai_tools.ts'
import {
  AI_TOOL_MESSAGES,
  handleAiToolJob,
  type AiToolStore,
  type JobRow,
  type OutputRow,
} from '../supabase/functions/ai-tool-job/handle.ts'
import { guardAiText, guardStubOutput } from '../supabase/functions/ai-tool-job/tools/legal_guard.ts'
import { pricingSenseCheckOutput } from '../supabase/functions/ai-tool-job/tools/pricing_sense_check.ts'
import { termSheetReviewOutput } from '../supabase/functions/ai-tool-job/tools/term_sheet_review.ts'
import { SHARED_WILL_NOT, SHARED_WILL_NOT_AR, renderToolCopy } from '../src/lib/aiToolCopy.ts'
import { PRICING_FIXTURE, TERM_SHEET_FIXTURE } from './fixtures/legal-flagged.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const USER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-09-30T08:00:00.000Z')
const PRICE_WORD = ['valu', 'ation'].join('')
const AR_SERVICE = String.fromCharCode(0x062a, 0x0642, 0x064a, 0x064a, 0x0645)

const SLOTS = {
  entity: 'Example Holdings',
  cr: '0000000000',
  provider: 'Example AI',
  privacy: '/privacy',
  terms: '/terms',
  retentionDays: 30,
  date: '30 Sep 2026',
}

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function input(fileName: string, sourceText: string) {
  return {
    fileName,
    generatedOn: '30 Sep 2026',
    modelId: null,
    modelSkipReason: 'provider_not_configured',
    sourceText,
    mimeType: 'text/plain',
  }
}

test('term sheet and pricing flags stay off', () => {
  assert.equal(AI_TOOL_FLAG_DEFAULTS.term_sheet_review, false)
  assert.equal(AI_TOOL_FLAG_DEFAULTS.pricing_sense_check, false)
  const migrations = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'))
  for (const name of migrations) {
    const sql = read(`supabase/migrations/${name}`)
    assert.equal(sql.includes("('term_sheet_review', true)"), false, name)
    assert.equal(sql.includes("('pricing_sense_check', true)"), false, name)
  }
})

test('retention sweep covers term sheet and pricing uploads', () => {
  for (const ext of ['txt', 'csv', 'pdf'] as const) {
    const storagePath = aiToolStoragePath(USER, JOB, ext)
    assert.equal(AI_TOOL_BUCKET, 'ai-tool-uploads')
    assert.equal(safeStoragePath(storagePath), true, storagePath)
    assert.equal(ownedAiToolPath(USER, JOB, storagePath), true, storagePath)
    assert.equal(storagePath, `${USER}/${JOB}/source.${ext}`)
  }
  const edge = read('supabase/functions/retention-sweep/index.ts')
  assert.match(edge, /from\('ai-tool-uploads'\)/)
  assert.match(edge, /source\\\.\(pdf\|txt\|csv\|xlsx\|docx\)/)
  const sql = read('supabase/migrations/20261120120000_aitools_frame.sql')
  const dueAt = sql.lastIndexOf('from public.ai_tool_jobs j')
  const due = sql.slice(dueAt, dueAt + 220)
  assert.match(due, /from public\.ai_tool_jobs j/)
  assert.match(due, /make_interval\(days => retention_days\)/)
  assert.equal(/tool_key/.test(due), false)
  assert.match(sql, /delete from public\.ai_tool_outputs/)
  assert.match(sql, /delete from public\.ai_tool_notes/)
  assert.match(sql, /delete from public\.ai_tool_consents/)
  assert.match(sql, /delete from public\.ai_tool_jobs/)
  assert.match(read('supabase/functions/ai-tool-job/db.ts'), /AI_TOOL_BUCKET/)
  assert.match(read('supabase/functions/ai-tool-job/handle.ts'), /guardStubOutput/)
})

test('arabic will and will-not lines match the bullets file', () => {
  const term = renderToolCopy('term_sheet_review', 'ar', SLOTS)
  assert.deepEqual(term.will, [
    'تلخّص البنود الرئيسية بلغة واضحة.',
    'تُبرز البنود التي تبدو غير مألوفة مقارنة بالممارسات العامة في السوق.',
    'تقترح أسئلة لتطرحها على محاميك.',
  ])
  assert.equal(term.willNot[0], 'لا تخبرك ما إذا كان عليك التوقيع أو الاستثمار أو التفاوض على أي بند.')
  assert.equal(term.willNot[1], 'لا تقدّم رأياً قانونياً ولا تتحقق من قابلية النفاذ بموجب أي نظام.')
  for (const line of SHARED_WILL_NOT_AR) assert.equal(term.willNot.includes(line), true, line)

  const pricing = renderToolCopy('pricing_sense_check', 'ar', SLOTS)
  assert.deepEqual(pricing.will, [
    'تقارن الرقم المطلوب بشركات مماثلة معلنة وصفقات إقليمية منشورة.',
    'تعرض النطاقات والمصادر التي استخدمتها.',
    'توضّح أبرز أوجه القصور في المقارنة.',
  ])
  assert.equal(pricing.willNot[0], 'لا تقدّم رأياً في السعر أو سعراً مستهدفاً أو رأياً بشأن عدالة السعر.')
  assert.equal(pricing.willNot[1], 'لا تحدّد ما إذا كان السعر مناسباً أو ما إذا كان عليك الاستثمار.')
  assert.equal(pricing.willNot[2], 'لا تستخدم بيانات صفقات خاصة أو معلومات غير معلنة.')
  for (const line of SHARED_WILL_NOT_AR) assert.equal(pricing.willNot.includes(line), true, line)

  const termEn = renderToolCopy('term_sheet_review', 'en', SLOTS)
  assert.equal(termEn.banner, 'An AI read of a term sheet. It flags terms that look unusual compared with common market practice so you know what to ask. It is not legal or investment advice.')
  assert.equal(termEn.will[0], 'Summarise the key terms in plain words.')
  assert.equal(termEn.willNot[0], 'Tell you whether to sign, invest or negotiate a term.')
  for (const line of SHARED_WILL_NOT) assert.equal(termEn.willNot.includes(line), true)

  const pricingEn = renderToolCopy('pricing_sense_check', 'en', SLOTS)
  assert.equal(pricingEn.will[0], 'Compare the asking figure with public comparables and reported regional deals.')
  assert.equal(pricingEn.willNot[0], 'Give a price opinion, price target or fairness opinion.')
  assert.match(pricingEn.banner, /not a price opinion, fairness opinion or investment advice/)
  assert.match(pricingEn.footerLead, /Pricing sense-check/)
})

test('fixture reads describe the made-up documents and avoid verdicts', () => {
  const term = termSheetReviewOutput(input('example-term-sheet.txt', TERM_SHEET_FIXTURE))
  const termBlob = JSON.stringify(term)
  assert.match(term.summary, /Example Logistics LLC/)
  assert.match(term.summary, /General and educational only/)
  assert.match(termBlob, /Liquidation preference is stated as 2x non-participating/)
  assert.match(termBlob, /full ratchet/)
  assert.match(termBlob, /2 investor directors of 3/)
  assert.match(termBlob, /90 days/)
  assert.equal(term.sources.some((source) => source.url === 'https://example.com/terms-practice'), true)
  assert.equal(term.questions.length > 2, true)
  assertClean(termBlob)

  const pricing = pricingSenseCheckOutput(input('pricing-inputs.txt', PRICING_FIXTURE))
  const pricingBlob = JSON.stringify(pricing)
  assert.match(pricing.summary, /Pricing sense-check/)
  assert.match(pricing.summary, /General and educational only/)
  assert.match(pricing.summary, /SAR 40,000,000/)
  assert.match(pricing.summary, /16\.7x/)
  assert.match(pricingBlob, /SAR 18,000,000 to SAR 35,000,000/)
  assert.match(pricingBlob, /6x to 12x/)
  assert.match(pricingBlob, /sits outside/)
  assert.match(pricingBlob, /private deal data is not used/)
  assert.deepEqual(
    pricing.sources.map((source) => source.url),
    ['https://example.com/deals/logistics-seed', 'https://example.com/deals/gulf-software'],
  )
  assert.equal(pricing.sources.every((source) => source.dated.length > 0), true)
  assertClean(pricingBlob)
})

test('the output guard strips the banned product word and verdicts', () => {
  const dirty = `A ${PRICE_WORD} that is overpriced, a good deal, fair, and a reason to buy, sell, or hold. ${AR_SERVICE} ${AR_SERVICE}اً ال${AR_SERVICE}`
  const cleaned = guardAiText(dirty)
  assertClean(cleaned)
  assert.match(cleaned, /price figure/)
  assert.match(cleaned, /above the noted band/)
  const output = guardStubOutput({
    tool_key: 'pricing_sense_check',
    title: `Pricing ${PRICE_WORD}`,
    summary: dirty,
    findings: [dirty],
    questions: [dirty],
    sources: [{ title: dirty, url: `https://example.com/${PRICE_WORD}`, dated: '30 Sep 2026' }],
    limits: dirty,
    generated_on: '30 Sep 2026',
    model_id: null,
    model_skip_reason: null,
  })
  assertClean(JSON.stringify(output))
  const valuers = 'مقيّم معتمد من الهيئة السعودية للمقيّمين المعتمدين'
  assert.equal(guardAiText(valuers), valuers)
})

test('a run stores guarded text for both tools', async () => {
  const dirty = `Company: Example Logistics LLC
Asking figure SAR: 1000000
Revenue SAR: 100000
Side: ${PRICE_WORD} overpriced good deal fair buy sell hold ${AR_SERVICE}
Public note: Example Note | https://example.com/deals/note | 01 Jan 2026 | price SAR 100000 to 200000 | multiple 2 to 4
`
  for (const tool of ['term_sheet_review', 'pricing_sense_check'] as const) {
    const store = memoryStore(dirty)
    store.consents.set(JOB, consent(tool))
    const res = await handleAiToolJob(request(startBody(tool, 'example.txt', 'text/plain')), {
      resolveUser: async () => ({ ok: true, userId: USER }),
      store: () => store,
      now: () => NOW,
      newId: () => '33333333-3333-4333-8333-333333333333',
    })
    assert.equal(res.status, 200, tool)
    const body = store.outputs.get(JOB)?.body
    assert.ok(body)
    assertClean(JSON.stringify(body))
    assert.equal(body.tool_key, tool)
  }

  const off = memoryStore('')
  off.toolEnabled = async () => false
  off.consents.set(JOB, consent('pricing_sense_check'))
  const denied = await handleAiToolJob(request(startBody('pricing_sense_check', 'example.txt', 'text/plain')), {
    resolveUser: async () => ({ ok: true, userId: USER }),
    store: () => off,
    now: () => NOW,
  })
  assert.equal(denied.status, 403)
  assert.equal((await denied.json()).code, 'tool_off')
  assert.equal(AI_TOOL_MESSAGES.off.length > 0, true)
})

test('tool copy and prompts do not offer the banned product word', () => {
  const files = [
    'src/lib/aiToolCopy.ts',
    'src/components/ai/AiToolDesk.tsx',
    'src/components/ai/PricingInputs.tsx',
    'src/pages/dashboard/AiToolPage.tsx',
    'supabase/functions/ai-tool-job/tools/term_sheet_review.ts',
    'supabase/functions/ai-tool-job/tools/pricing_sense_check.ts',
    'supabase/functions/ai-tool-job/tools/pricing_format.ts',
    'supabase/functions/ai-tool-job/tools/legal_guard.ts',
    'supabase/functions/ai-tool-job/handle.ts',
  ]
  for (const file of files) {
    const text = read(file)
    assert.equal(new RegExp(`\\b${PRICE_WORD}\\b`, 'i').test(text), false, file)
    assert.equal(text.includes(AR_SERVICE), false, file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
  }
  for (const tool of ['term_sheet_review', 'pricing_sense_check'] as const) {
    for (const lang of ['en', 'ar'] as const) {
      const copy = renderToolCopy(tool, lang, SLOTS)
      const blob = `${copy.title}\n${copy.banner}\n${copy.will.join('\n')}\n${copy.willNot.join('\n')}\n${copy.consent}\n${copy.footer}`
      assert.equal(new RegExp(`\\b${PRICE_WORD}\\b`, 'i').test(blob), false, `${tool} ${lang}`)
      assert.equal(blob.includes(AR_SERVICE), false, `${tool} ${lang}`)
    }
  }
})

function assertClean(blob: string) {
  assert.equal(new RegExp(`\\b${PRICE_WORD}\\b`, 'i').test(blob), false, blob)
  assert.equal(blob.includes(AR_SERVICE), false, blob)
  assert.equal(/\b(overpriced|underpriced|good deal)\b/i.test(blob), false, blob)
  assert.equal(/\b(buy|sell|hold|fair)\b/i.test(blob), false, blob)
}

function request(body: Record<string, unknown>) {
  return new Request('https://example.com/functions/v1/ai-tool-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function startBody(tool: AiToolKey, fileName: string, mime: string) {
  const ext = mime === 'text/csv' ? 'csv' : 'txt'
  return {
    action: 'start',
    tool_key: tool,
    job_id: JOB,
    storage_path: `${USER}/${JOB}/source.${ext}`,
    file_name: fileName,
    mime_type: mime,
    byte_size: 900,
  }
}

function consent(tool: AiToolKey): ConsentRow {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    member_id: USER,
    tool_key: tool,
    copy_version: blockVersion('consent', tool),
    accepted_at: NOW.toISOString(),
    job_id: JOB,
  }
}

function memoryStore(sourceText: string): AiToolStore & {
  outputs: Map<string, OutputRow>
  consents: Map<string, ConsentRow>
  toolEnabled: (tool: AiToolKey) => Promise<boolean | null>
} {
  const jobs = new Map<string, JobRow>()
  const outputs = new Map<string, OutputRow>()
  const consents = new Map<string, ConsentRow>()
  const store: AiToolStore & {
    outputs: Map<string, OutputRow>
    consents: Map<string, ConsentRow>
    toolEnabled: (tool: AiToolKey) => Promise<boolean | null>
  } = {
    outputs,
    consents,
    memberLive: async () => true,
    isStaff: async () => false,
    toolEnabled: async () => true,
    consentByJob: async (jobId) => consents.get(jobId) ?? null,
    jobById: async (jobId) => jobs.get(jobId) ?? null,
    outputByJob: async (jobId) => outputs.get(jobId) ?? null,
    fileReady: async () => true,
    insertJob: async (row) => {
      jobs.set(row.id, {
        ...row,
        error: null,
        created_at: NOW.toISOString(),
        updated_at: NOW.toISOString(),
      })
      return 'ok'
    },
    saveOutput: async (row) => {
      outputs.set(row.job_id, { id: row.id, job_id: row.job_id, body: row.body, created_at: NOW.toISOString() })
      return true
    },
    saveNote: async () => true,
    markJob: async (jobId, patch) => {
      const current = jobs.get(jobId)
      if (!current) return false
      jobs.set(jobId, { ...current, ...patch, error: patch.error ?? null, updated_at: NOW.toISOString() })
      return true
    },
    deleteOwned: async () => null,
    removeFile: async () => true,
    readSource: async () => sourceText,
  }
  return store
}

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { AI_TOOL_FLAG_DEFAULTS, aiToolStoragePath, blockVersion, safeStoragePath, type AiToolKey, type ConsentRow } from '../supabase/functions/_shared/ai_tools.ts'
import { handleAiToolJob, type AiToolStore, type JobRow, type OutputRow } from '../supabase/functions/ai-tool-job/handle.ts'
import { appendCfoModelQuestions, cfoCheckOutput } from '../supabase/functions/ai-tool-job/tools/cfo_check.ts'
import { buildExamplePdf, buildExampleXlsx, exampleCsv } from '../supabase/functions/ai-tool-job/tools/cfo_example.ts'
import { readCfoFigures } from '../supabase/functions/ai-tool-job/tools/cfo_figures.ts'
import { readCfoUpload } from '../supabase/functions/ai-tool-job/tools/cfo_read.ts'
import { SHARED_WILL_NOT_AR, renderToolCopy } from '../src/lib/aiToolCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const USER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-09-30T08:00:00.000Z')
const fixtureDir = path.join(root, 'fixtures/cfo')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('cfo_check stays off in code and in the frame migration', () => {
  assert.equal(AI_TOOL_FLAG_DEFAULTS.cfo_check, false)
  const sql = read('supabase/migrations/20261120120000_aitools_frame.sql')
  assert.match(sql, /\('cfo_check', false\)/)
  assert.equal(sql.includes("('cfo_check', true)"), false)
  const migrations = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'))
  for (const name of migrations) {
    assert.equal(readFileSync(path.join(root, 'supabase/migrations', name), 'utf8').includes("('cfo_check', true)"), false, name)
  }
})

test('retention sweep covers cfo upload paths and output rows', () => {
  const edge = read('supabase/functions/retention-sweep/index.ts')
  assert.match(edge, /ai-tool-uploads/)
  assert.match(edge, /source\\\.\(pdf\|txt\|csv\|xlsx\|docx\)/)
  const sql = read('supabase/migrations/20261120120000_aitools_frame.sql')
  const sweep = sql.slice(sql.lastIndexOf('create or replace function public.retention_sweep_plan'))
  assert.match(sweep, /from public\.ai_tool_jobs j/)
  assert.match(sweep, /delete from public\.ai_tool_outputs/)
  assert.match(sweep, /ai_tool_files/)
  for (const ext of ['pdf', 'csv', 'xlsx']) {
    const storagePath = aiToolStoragePath(USER, JOB, ext)
    assert.equal(safeStoragePath(storagePath), true, ext)
    assert.match(storagePath, /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/source\.(pdf|csv|xlsx)$/i)
    assert.match(edge, new RegExp(ext))
  }
})

test('example.com csv, xlsx, and pdf fixtures compute the same figures', async () => {
  const csv = readFileSync(path.join(fixtureDir, 'example-holdings.csv'), 'utf8')
  assert.equal(csv, exampleCsv())
  assert.equal(csv.includes('@'), false)
  assert.match(csv, /example\.com/)
  const pdf = new Uint8Array(readFileSync(path.join(fixtureDir, 'example-holdings.pdf')))
  assert.deepEqual(pdf, buildExamplePdf())
  const xlsx = new Uint8Array(readFileSync(path.join(fixtureDir, 'example-holdings.xlsx')))
  const fromCsv = readCfoFigures(csv)
  const fromPdf = readCfoFigures(await readCfoUpload('application/pdf', pdf))
  const fromXlsx = readCfoFigures(await readCfoUpload('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx))
  for (const read of [fromCsv, fromPdf, fromXlsx]) {
    assert.equal(read.company, 'Example Holdings')
    assert.equal(read.website, 'example.com')
    assert.equal(read.currency, 'SAR')
    assert.equal(read.cash, 2_400_000)
    assert.equal(read.monthlyBurn, 200_000)
    assert.equal(read.runwayMonths, 12)
    assert.equal(read.grossMargin, 0.6)
    assert.equal(read.workingCapital, 1_700_000)
    assert.equal(read.netIncome, -240_000)
  }
  const output = cfoCheckOutput({
    fileName: 'example-holdings.csv',
    generatedOn: '30 Sep 2026',
    modelId: null,
    modelSkipReason: 'provider_not_configured',
    sourceText: csv,
  })
  assert.match(output.summary, /not SOCPA accounting or audit/)
  assert.match(output.limits, /not SOCPA accounting or audit/)
  assert.equal(output.metrics?.find((item) => item.label === 'Runway')?.value, '12 months')
  assert.equal(output.metrics?.find((item) => item.label === 'Gross margin')?.value, '60%')
  assert.equal(output.metrics?.find((item) => item.label === 'Net margin')?.value, '-6.7%')
  assert.equal(output.metrics?.find((item) => item.label === 'Working capital')?.value, 'SAR 1,700,000')
  assert.ok((output.red_flags ?? []).some((item) => /do not line up/.test(item)))
  assert.ok(output.questions.some((item) => /CFO or auditor/.test(item)))
  assert.equal(/\bvaluation\b/i.test(JSON.stringify(output)), false)
  const rebuilt = readCfoFigures(await readCfoUpload('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buildExampleXlsx()))
  assert.equal(rebuilt.workingCapital, fromXlsx.workingCapital)
  assert.equal(rebuilt.runwayMonths, 12)
})

test('arabic will and shared will-not lines are the bullets file verbatim', () => {
  const slots = {
    entity: 'To be confirmed',
    cr: 'To be confirmed',
    provider: 'To be confirmed',
    privacy: '/privacy',
    terms: '/terms',
    retentionDays: 30,
    date: '30 Sep 2026',
  }
  const arabic = renderToolCopy('cfo_check', 'ar', slots)
  assert.deepEqual(arabic.will, [
    'تقرأ الحسابات أو النموذج المالي الذي ترفعه.',
    'تقدّر مدة التشغيل المتبقية والهوامش بناءً على أرقامك.',
    'تُبرز نقاط الخطر المحتملة وأوجه عدم الاتساق.',
    'تقترح أسئلة لتطرحها على مديرك المالي أو مراجع حساباتك.',
  ])
  assert.deepEqual(arabic.willNot.slice(0, 2), [
    'لا تدقّق الحسابات أو تراجعها أو تعتمدها، ولا تتحقق من مطابقتها للمعايير الدولية لإعداد التقارير المالية أو معايير الهيئة السعودية للمراجعين والمحاسبين.',
    'لا تتحقق من صحة أرقامك.',
  ])
  assert.deepEqual(arabic.willNot.slice(2), [...SHARED_WILL_NOT_AR])
  const english = renderToolCopy('cfo_check', 'en', slots)
  assert.equal(english.willNot.includes('Audit, review or certify accounts, or check them against IFRS or SOCPA standards.'), true)
  assert.equal(english.willNot.includes('Give legal, financial, investment, tax or accounting advice.'), true)
  const page = read('src/pages/dashboard/AiToolPage.tsx')
  assert.match(page, /PDF, CSV, or XLSX/)
  assert.match(page, /acceptCfoFile/)
})

test('cfo job reads the upload and refuses a document file', async () => {
  const store = memoryStore(new TextEncoder().encode(exampleCsv()))
  store.consents.set(JOB, consent('cfo_check'))
  const ok = await handleAiToolJob(
    request({
      action: 'start',
      tool_key: 'cfo_check',
      job_id: JOB,
      storage_path: `${USER}/${JOB}/source.csv`,
      file_name: 'example-holdings.csv',
      mime_type: 'text/csv',
      byte_size: exampleCsv().length,
      lang: 'en',
    }),
    { resolveUser: async () => ({ ok: true as const, userId: USER }), store: () => store, now: () => NOW },
  )
  assert.equal(ok.status, 200)
  const body = await ok.json()
  assert.equal(body.output.metrics.find((item: { label: string }) => item.label === 'Runway').value, '12 months')
  assert.match(body.output.limits, /not SOCPA accounting or audit/)
  const docx = await handleAiToolJob(
    request({
      action: 'start',
      tool_key: 'cfo_check',
      job_id: JOB,
      storage_path: `${USER}/${JOB}/source.docx`,
      file_name: 'example.docx',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      byte_size: 1200,
    }),
    { resolveUser: async () => ({ ok: true as const, userId: USER }), store: () => memoryStore(null), now: () => NOW },
  )
  assert.equal(docx.status, 400)
})

test('model questions that recommend a transaction are dropped', () => {
  const output = cfoCheckOutput({
    fileName: 'example-holdings.csv',
    generatedOn: '30 Sep 2026',
    modelId: 'example-model',
    modelSkipReason: null,
    sourceText: exampleCsv(),
  })
  const next = appendCfoModelQuestions(
    output,
    '{"questions":["What is included in the cash balance?","You should buy more inventory now."]}',
  )
  assert.equal(next.questions.includes('What is included in the cash balance?'), true)
  assert.equal(next.questions.some((item) => /buy/i.test(item)), false)
  const provider = read('supabase/functions/_shared/ai_tool_provider.ts')
  const handle = read('supabase/functions/ai-tool-job/handle.ts')
  assert.match(handle, /completeAiToolPrompt/)
  assert.match(handle, /readCfoUpload/)
  assert.equal(/BA_CFO_[A-Z0-9_]+/.test(`${provider}\n${handle}`), false)
  for (const file of [
    'supabase/functions/ai-tool-job/tools/cfo_check.ts',
    'supabase/functions/ai-tool-job/tools/cfo_figures.ts',
    'supabase/functions/ai-tool-job/tools/cfo_read.ts',
    'supabase/functions/ai-tool-job/tools/xlsx_read.ts',
    'src/lib/aiToolCopy.ts',
    'src/pages/dashboard/AiToolPage.tsx',
  ]) {
    const text = read(file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
  }
})

function request(body: Record<string, unknown>) {
  return new Request('https://example.com/functions/v1/ai-tool-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

function memoryStore(bytes: Uint8Array | null): AiToolStore & { consents: Map<string, ConsentRow> } {
  const jobs = new Map<string, JobRow>()
  const outputs = new Map<string, OutputRow>()
  const consents = new Map<string, ConsentRow>()
  return {
    consents,
    memberLive: async () => true,
    isStaff: async () => false,
    toolEnabled: async () => true,
    consentByJob: async (jobId) => consents.get(jobId) ?? null,
    jobById: async (jobId) => jobs.get(jobId) ?? null,
    outputByJob: async (jobId) => outputs.get(jobId) ?? null,
    fileReady: async () => true,
    downloadFile: async () => bytes,
    insertJob: async (row) => {
      jobs.set(row.id, { ...row, error: null, created_at: NOW.toISOString(), updated_at: NOW.toISOString() })
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
  }
}

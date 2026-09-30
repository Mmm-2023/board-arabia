import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  AI_TOOL_FLAG_DEFAULTS,
  AI_TOOL_RETENTION_DAYS_DEFAULT,
  blockVersion,
  consentMatches,
  type AiToolKey,
  type ConsentRow,
} from '../supabase/functions/_shared/ai_tools.ts'
import { aiToolRetentionDue } from '../supabase/functions/_shared/retention_plan.ts'
import {
  AI_TOOL_MESSAGES,
  handleAiToolJob,
  type AiToolStore,
  type JobRow,
  type OutputRow,
} from '../supabase/functions/ai-tool-job/handle.ts'
import { pricingSenseCheckOutput } from '../supabase/functions/ai-tool-job/tools/pricing_sense_check.ts'
import { cfoCheckOutput } from '../supabase/functions/ai-tool-job/tools/cfo_check.ts'
import { marketBriefOutput } from '../supabase/functions/ai-tool-job/tools/market_brief.ts'
import { termSheetReviewOutput } from '../supabase/functions/ai-tool-job/tools/term_sheet_review.ts'
import { runToolStub } from '../supabase/functions/ai-tool-job/tools/index.ts'
import { SHARED_FOOTER, renderToolCopy } from '../src/lib/aiToolCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const USER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-09-30T08:00:00.000Z')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

test('term sheet and pricing flags default off, and the other two default on', () => {
  assert.equal(AI_TOOL_FLAG_DEFAULTS.term_sheet_review, false)
  assert.equal(AI_TOOL_FLAG_DEFAULTS.pricing_sense_check, false)
  assert.equal(AI_TOOL_FLAG_DEFAULTS.cfo_check, true)
  assert.equal(AI_TOOL_FLAG_DEFAULTS.market_brief, true)
  assert.equal(AI_TOOL_RETENTION_DAYS_DEFAULT, 30)
  const sql = read('supabase/migrations/20261120120000_aitools_frame.sql')
  assert.match(sql, /\('cfo_check', true\)/)
  assert.match(sql, /\('market_brief', true\)/)
  assert.match(sql, /\('term_sheet_review', false\)/)
  assert.match(sql, /\('pricing_sense_check', false\)/)
  assert.match(sql, /retention_days integer not null default 30/)
  assert.match(sql, /force row level security/)
  assert.match(sql, /set search_path = public/)
  assert.match(sql, /set search_path = ''/)
  assert.equal(/grant execute[^;]*to anon/i.test(sql), false)
  assert.equal(sql.includes('storage.objects') && /delete from storage\.objects/i.test(sql), false)
})

test('pricing output and tool UI copy do not use the banned product word', () => {
  const output = pricingSenseCheckOutput({
    fileName: 'example.pdf',
    generatedOn: '30 Sep 2026',
    modelId: null,
    modelSkipReason: 'provider_not_configured',
  })
  const blob = JSON.stringify(output)
  assert.equal(/\bvaluation\b/i.test(blob), false)
  assert.equal(/\b(buy|sell|overpriced|fair)\b/i.test(blob), false)
  assert.equal(/\bgood deal\b/i.test(blob), false)
  assert.match(blob, /Pricing sense-check/)
  assert.match(blob, /General and educational only/)
  const files = [
    'src/lib/aiToolCopy.ts',
    'src/lib/aiToolApi.ts',
    'src/lib/aiToolConfig.ts',
    'src/components/ai/AiToolDesk.tsx',
    'src/components/ai/AiToolCards.tsx',
    'src/pages/dashboard/AiToolPage.tsx',
    'src/pages/dashboard/AiToolsHome.tsx',
    'src/pages/admin/AiToolSettingsPanel.tsx',
    'supabase/functions/ai-tool-job/tools/pricing_sense_check.ts',
    'supabase/functions/ai-tool-job/tools/cfo_check.ts',
    'supabase/functions/ai-tool-job/tools/market_brief.ts',
    'supabase/functions/ai-tool-job/tools/term_sheet_review.ts',
    'supabase/functions/_shared/ai_tools.ts',
  ]
  for (const file of files) {
    assert.equal(/\bvaluation\b/i.test(read(file)), false, file)
    assert.equal(read(file).includes('\u2014'), false, file)
    assert.equal(read(file).includes('\u2013'), false, file)
  }
})

test('cfo output names the accounting limit and market sources are dated', () => {
  const cfo = cfoCheckOutput({
    fileName: 'example.pdf',
    generatedOn: '30 Sep 2026',
    modelId: null,
    modelSkipReason: null,
  })
  assert.match(`${cfo.summary} ${cfo.limits}`, /not SOCPA accounting or audit/)
  const market = marketBriefOutput({
    fileName: 'example.txt',
    generatedOn: '30 Sep 2026',
    modelId: null,
    modelSkipReason: null,
  })
  assert.ok(market.sources.length > 0)
  assert.ok(market.sources.every((source) => source.dated === '30 Sep 2026'))
  const term = termSheetReviewOutput({
    fileName: 'example.pdf',
    generatedOn: '30 Sep 2026',
    modelId: null,
    modelSkipReason: null,
  })
  assert.match(term.summary, /General and educational only/)
  assert.equal(/\b(buy|sell)\b/i.test(JSON.stringify(term)), false)
  for (const key of ['cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check'] as const) {
    const stub = runToolStub(key, {
      fileName: 'example.pdf',
      generatedOn: '30 Sep 2026',
      modelId: 'example-model',
      modelSkipReason: null,
    })
    assert.equal(stub.tool_key, key)
    assert.equal(/\bvaluation\b/i.test(JSON.stringify(stub)), false)
  }
})

test('shared footer and the cfo banner keep the legal wording', () => {
  assert.equal(
    SHARED_FOOTER.en,
    'Generated by AI on [DATE] from your inputs and public sources only. It may be wrong, incomplete or out of date. It is not legal, financial, investment, tax or accounting advice, is not an activity authorised by the Capital Market Authority, and is not a recommendation, offer or solicitation. Verify with licensed advisers before you act. Provided by [BA ENTITY], CR [CR], under the Board Arabia Terms [TERMS LINK]. Governed by the laws of the Kingdom of Saudi Arabia.',
  )
  const slots = {
    entity: 'Example Holdings',
    cr: '0000000000',
    provider: 'Example AI',
    privacy: 'https://example.com/privacy',
    terms: 'https://example.com/terms',
    retentionDays: 30,
    date: '30 Sep 2026',
  }
  const copy = renderToolCopy('cfo_check', 'en', slots)
  assert.match(copy.banner, /It is not accounting, audit or financial advice\./)
  assert.match(copy.consent, /kept for 30 days/)
  assert.match(copy.footer, /Example Holdings/)
  assert.match(copy.footer, /https:\/\/example.com\/terms/)
  assert.match(copy.footer, /30 Sep 2026/)
  assert.equal(copy.willNot.includes('Give legal, financial, investment, tax or accounting advice.'), true)
})

test('a run without a matching consent is rejected', async () => {
  const store = memoryStore()
  const denied = await handleAiToolJob(request(startBody()), { resolveUser: allow, store: () => store, now: () => NOW })
  assert.equal(denied.status, 403)
  const body = await denied.json()
  assert.equal(body.code, 'consent_required')
  assert.equal(store.jobs.size, 0)
  store.consents.set(JOB, consent('cfo_check'))
  const ok = await handleAiToolJob(request(startBody()), { resolveUser: allow, store: () => store, now: () => NOW, newId: () => '33333333-3333-4333-8333-333333333333' })
  assert.equal(ok.status, 200)
  const started = await ok.json()
  assert.equal(started.ok, true)
  assert.equal(store.outputs.has(JOB), true)
  assert.equal(store.notes.has(JOB), true)
})

test('delete removes the uploaded file and the output', async () => {
  const store = memoryStore()
  store.jobs.set(JOB, job('cfo_check'))
  store.outputs.set(JOB, {
    id: '33333333-3333-4333-8333-333333333333',
    job_id: JOB,
    body: cfoCheckOutput({ fileName: 'example.pdf', generatedOn: '30 Sep 2026', modelId: null, modelSkipReason: null }),
    created_at: NOW.toISOString(),
  })
  store.notes.set(JOB, true)
  store.consents.set(JOB, consent('cfo_check'))
  const res = await handleAiToolJob(request({ action: 'delete', job_id: JOB }), {
    resolveUser: allow,
    store: () => store,
    now: () => NOW,
  })
  assert.equal(res.status, 200)
  assert.deepEqual(store.removed, [`${USER}/${JOB}/source.pdf`])
  assert.equal(store.outputs.has(JOB), false)
  assert.equal(store.notes.has(JOB), false)
  assert.equal(store.consents.has(JOB), false)
  assert.equal(store.jobs.has(JOB), false)
  const sql = read('supabase/migrations/20261120120000_aitools_frame.sql')
  const fn = sql.slice(sql.indexOf('function public.delete_own_ai_tool_job'))
  assert.match(fn, /delete from public\.ai_tool_outputs/)
  assert.match(fn, /delete from public\.ai_tool_notes/)
  assert.match(fn, /delete from public\.ai_tool_consents/)
  assert.match(fn, /delete from public\.ai_tool_jobs/)
  assert.equal(/delete from storage\.objects/i.test(fn), false)
})

test('retention sweep selects ai tool rows older than the setting', () => {
  assert.equal(aiToolRetentionDue(daysAgo(31), 30, NOW), true)
  assert.equal(aiToolRetentionDue(daysAgo(29), 30, NOW), false)
  assert.equal(aiToolRetentionDue(daysAgo(30), 30, NOW), false)
  assert.equal(aiToolRetentionDue(daysAgo(10), 7, NOW), true)
  const sql = read('supabase/migrations/20261120120000_aitools_frame.sql')
  const sweep = sql.slice(sql.lastIndexOf('create or replace function public.retention_sweep_plan'))
  assert.match(sweep, /from public\.ai_tool_jobs j/)
  assert.match(sweep, /make_interval\(days => retention_days\)/)
  assert.match(sweep, /delete from public\.ai_tool_outputs/)
  assert.match(sweep, /ai_tool_files/)
  const edge = read('supabase/functions/retention-sweep/index.ts')
  assert.match(edge, /ai-tool-uploads/)
  assert.match(edge, /\.remove\(/)
  assert.match(edge, /ai_tool_file_purge/)
  assert.match(read('supabase/functions/ai-tool-job/db.ts'), /AI_TOOL_BUCKET/)
  assert.match(read('supabase/functions/ai-tool-job/db.ts'), /\.remove\(/)
  assert.equal(AI_TOOL_MESSAGES.consent.length > 0, true)
})

test('provider wiring reuses the existing secret names', () => {
  const provider = read('supabase/functions/_shared/ai_tool_provider.ts')
  const llm = read('supabase/functions/due-diligence-start/llm.ts')
  for (const name of ['BA_DD_LLM_API_KEY', 'BA_DD_LLM_MODEL', 'BA_DD_LLM_BASE_URL', 'BA_DD_LLM_PROVIDER']) {
    assert.equal(provider.includes(name), true, name)
    assert.equal(llm.includes(name), true, name)
  }
  assert.equal(/BA_AI_TOOL_[A-Z0-9_]+/.test(provider), false)
})

test('run stays disabled until consent is ticked', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const desk = await vite.ssrLoadModule('/src/components/ai/AiToolDesk.tsx')
    const copy = renderToolCopy('cfo_check', 'en', {
      entity: '[BA ENTITY]',
      cr: '[CR]',
      provider: '[AI PROVIDER]',
      privacy: '[PRIVACY LINK]',
      terms: '[TERMS LINK]',
      retentionDays: 30,
      date: '30 Sep 2026',
    })
    const unticked = renderToStaticMarkup(
      createElement(desk.AiToolForm, {
        copy,
        consented: false,
        fileName: 'example.pdf',
        busy: false,
        onConsent: () => {},
        onFile: () => {},
        onRun: () => {},
      }),
    )
    const ticked = renderToStaticMarkup(
      createElement(desk.AiToolForm, {
        copy,
        consented: true,
        fileName: 'example.pdf',
        busy: false,
        onConsent: () => {},
        onFile: () => {},
        onRun: () => {},
      }),
    )
    assert.equal(unticked.includes('disabled=""'), true)
    assert.equal(unticked.includes('data-ai-run="off"'), true)
    assert.equal(unticked.includes('data-consent="off"'), true)
    assert.equal(ticked.includes('data-ai-run="on"'), true)
    assert.equal(ticked.includes('disabled=""'), false)
    assert.match(unticked, /Will not/)
    assert.match(unticked, /not accounting, audit or financial advice/)
    const cards = await vite.ssrLoadModule('/src/components/ai/AiToolCards.tsx')
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(cards.AiToolCardList, {
          flags: AI_TOOL_FLAG_DEFAULTS,
          staff: true,
        }),
      ),
    )
    assert.match(html, /Pricing sense-check/)
    assert.match(html, /Off for members/)
    assert.equal((html.match(/Start a check/g) || []).length, 4)
    assert.equal(/\bvaluation\b/i.test(html), false)
  } finally {
    await vite.close()
  }
})

test('legal placeholders stay in one module until LEGAL-PAGES lands', () => {
  const config = read('src/lib/aiToolConfig.ts')
  assert.match(config, /VITE_LEGAL_ENTITY/)
  assert.match(config, /VITE_LEGAL_CR/)
  assert.match(config, /VITE_LEGAL_AI_PROVIDER/)
  assert.match(config, /export const PRIVACY_LINK/)
  assert.match(config, /export const TERMS_LINK/)
  assert.equal(config.includes('src/config/legal.ts') && config.includes("from '../config/legal"), false)
  let legalFile = false
  try {
    read('src/config/legal.ts')
    legalFile = true
  } catch {
    legalFile = false
  }
  assert.equal(legalFile, false)
})

test('with no env set, consent links point at the in-app pages', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const config = await vite.ssrLoadModule('/src/lib/aiToolConfig.ts')
    const copyMod = await vite.ssrLoadModule('/src/lib/aiToolCopy.ts')
    const desk = await vite.ssrLoadModule('/src/components/ai/AiToolDesk.tsx')
    assert.equal(config.PRIVACY_LINK, '/privacy')
    assert.equal(config.TERMS_LINK, '/terms')
    const slots = config.legalSlotsFromEnv(30, '30 Sep 2026')
    const copy = copyMod.renderToolCopy('cfo_check', 'en', slots)
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(desk.AiToolForm, {
          copy,
          lang: 'en',
          consented: false,
          fileName: 'example.pdf',
          busy: false,
          onConsent: () => {},
          onFile: () => {},
          onRun: () => {},
        }),
      ),
    )
    assert.match(html, /href="\/privacy"/)
    assert.match(html, /href="\/terms"/)
    assert.match(html, />Privacy Notice</)
    assert.match(html, />Terms</)
    assert.equal(html.includes('[PRIVACY LINK]'), false)
    assert.equal(html.includes('[TERMS LINK]'), false)
    assert.equal(html.includes('https://example.com'), false)
    const arabic = copyMod.renderToolCopy('cfo_check', 'ar', slots)
    const arHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(desk.AiToolConsent, {
          text: arabic.consent,
          lang: 'ar',
          checked: false,
          onChange: () => {},
        }),
      ),
    )
    assert.match(arHtml, /href="\/privacy"/)
    assert.match(arHtml, /href="\/terms"/)
    assert.match(arHtml, /إشعار الخصوصية/)
    assert.match(arHtml, /الشروط/)
    assert.equal(arHtml.includes('[PRIVACY LINK]'), false)
    assert.equal(arHtml.includes('[TERMS LINK]'), false)
  } finally {
    await vite.close()
  }
})

test('public apply route is unchanged while the two-tier flag is off', () => {
  const app = read('src/App.tsx')
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  for (const file of [
    'src/pages/LandingPage.tsx',
    'src/components/Nav.tsx',
    'src/components/Footer.tsx',
    'src/components/landing/StickyApply.tsx',
    'src/components/CtaBand.tsx',
  ]) {
    assert.equal(read(file).includes('"/register"'), false, file)
  }
  const migrations = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'))
  assert.equal(migrations.includes('20261120120000_aitools_frame.sql'), true)
  assert.equal(migrations.filter((name) => name.startsWith('20261120120000')).length, 1)
})

function allow() {
  return Promise.resolve({ ok: true as const, userId: USER })
}

function request(body: Record<string, unknown>) {
  return new Request('https://example.com/functions/v1/ai-tool-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function startBody() {
  return {
    action: 'start',
    tool_key: 'cfo_check',
    job_id: JOB,
    storage_path: `${USER}/${JOB}/source.pdf`,
    file_name: 'example.pdf',
    mime_type: 'application/pdf',
    byte_size: 1200,
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

function job(tool: AiToolKey): JobRow {
  return {
    id: JOB,
    member_id: USER,
    tool_key: tool,
    status: 'queued',
    step: 'intake',
    storage_path: `${USER}/${JOB}/source.pdf`,
    file_name: 'example.pdf',
    mime_type: 'application/pdf',
    byte_size: 1200,
    error: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  }
}

function memoryStore(): AiToolStore & {
  jobs: Map<string, JobRow>
  outputs: Map<string, OutputRow>
  notes: Map<string, boolean>
  consents: Map<string, ConsentRow>
  removed: string[]
} {
  const jobs = new Map<string, JobRow>()
  const outputs = new Map<string, OutputRow>()
  const notes = new Map<string, boolean>()
  const consents = new Map<string, ConsentRow>()
  const removed: string[] = []
  const store: AiToolStore & {
    jobs: Map<string, JobRow>
    outputs: Map<string, OutputRow>
    notes: Map<string, boolean>
    consents: Map<string, ConsentRow>
    removed: string[]
  } = {
    jobs,
    outputs,
    notes,
    consents,
    removed,
    memberLive: async () => true,
    isStaff: async () => false,
    toolEnabled: async (tool) => AI_TOOL_FLAG_DEFAULTS[tool],
    consentByJob: async (jobId) => consents.get(jobId) ?? null,
    jobById: async (jobId) => jobs.get(jobId) ?? null,
    outputByJob: async (jobId) => outputs.get(jobId) ?? null,
    fileReady: async () => true,
    insertJob: async (row) => {
      if (jobs.has(row.id)) return 'conflict'
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
    saveNote: async (row) => {
      notes.set(row.job_id, true)
      return true
    },
    markJob: async (jobId, patch) => {
      const current = jobs.get(jobId)
      if (!current) return false
      jobs.set(jobId, { ...current, ...patch, error: patch.error ?? null, updated_at: NOW.toISOString() })
      return true
    },
    deleteOwned: async (jobId, userId) => {
      const current = jobs.get(jobId)
      if (!current || current.member_id !== userId) return null
      outputs.delete(jobId)
      notes.delete(jobId)
      consents.delete(jobId)
      jobs.delete(jobId)
      return { storagePath: current.storage_path }
    },
    removeFile: async (filePath) => {
      removed.push(filePath)
      return true
    },
  }
  assert.equal(consentMatches(null, USER, 'cfo_check', JOB), false)
  return store
}

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { strToU8, zipSync } from '../supabase/functions/_shared/fflate-browser.js'
import {
  AI_TOOL_FLAG_DEFAULTS,
  blockVersion,
  visibleAiTools,
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
import { docxToText } from '../supabase/functions/ai-tool-job/tools/deal_read.ts'
import { dealReadinessOutput, NOT_STATED } from '../supabase/functions/ai-tool-job/tools/deal_readiness.ts'
import { runToolStub } from '../supabase/functions/ai-tool-job/tools/index.ts'
import type { StubOutput } from '../supabase/functions/ai-tool-job/tools/types.ts'
import { renderToolCopy } from '../src/lib/aiToolCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const USER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-10-05T08:00:00.000Z')
const FIXTURE = readFileSync(path.join(root, 'fixtures/re/example-teaser.txt'), 'utf8')

const SLOTS = {
  entity: 'To be confirmed',
  cr: 'To be confirmed',
  provider: 'Example AI',
  privacy: '/privacy',
  terms: '/terms',
  retentionDays: 30,
  date: '05 Oct 2026',
}

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function input(fileName: string, sourceText: string) {
  return {
    fileName,
    generatedOn: '05 Oct 2026',
    modelId: 'should-not-be-used',
    modelSkipReason: 'provider_not_configured',
    sourceText,
    lang: 'en' as const,
    mimeType: 'text/plain',
  }
}

test('deal readiness quotes the document and does not invent a yield, comparable, or name', () => {
  const output = dealReadinessOutput(input('example-teaser.txt', FIXTURE))
  const blob = JSON.stringify(output)
  assert.equal(output.tool_key, 'deal_readiness')
  assert.equal(output.model_id, null)
  assert.equal(output.model_skip_reason, 'document_only')
  assert.equal(output.example, true)
  assert.equal(output.checklist?.length, 4)
  assert.match(section(output, 'title_escrow'), /title deed/i)
  assert.match(section(output, 'title_escrow'), /escrow/i)
  assert.match(section(output, 'foreign_ownership'), /designated zone/i)
  assert.match(section(output, 'white_land'), /White Land/)
  assert.match(section(output, 'white_land'), /white land pending/i)
  assert.match(section(output, 'known_gaps'), /does not state a yield, a comparable, or a counterparty name/)
  assert.equal(blob.includes('9.5'), false)
  assert.equal(blob.includes('4000'), false)
  assert.equal(blob.includes('Northwind'), false)
  assert.equal(blob.includes('Comparable sales'), false)
  assert.match(blob, /does not state a yield, a comparable, or a counterparty name/)
  assert.equal(/[\u0600-\u06FF]/.test(blob), false)
  assert.equal(blob.includes('\u2014') || blob.includes('\u2013'), false)

  const silent = dealReadinessOutput(input('plot.txt', ''))
  assert.equal(silent.example, false)
  for (const key of ['title_escrow', 'foreign_ownership', 'white_land'] as const) {
    assert.equal(section(silent, key), NOT_STATED)
  }
  assert.match(section(silent, 'known_gaps'), /no readable text/i)
  assert.match(section(silent, 'known_gaps'), new RegExp(NOT_STATED))

  const titled = dealReadinessOutput(input('plot.txt', 'Freehold title deed registered before transfer.'))
  assert.match(section(titled, 'title_escrow'), /Freehold title deed/)
  assert.equal(section(titled, 'foreign_ownership'), NOT_STATED)
  assert.equal(section(titled, 'white_land'), NOT_STATED)
  assert.match(section(titled, 'known_gaps'), /Foreign ownership notes: Not stated in the document/)

  const viaStub = runToolStub('deal_readiness', input('plot.txt', FIXTURE))
  assert.equal(viaStub.tool_key, 'deal_readiness')
  assert.equal(JSON.stringify(viaStub).includes('Pricing sense-check'), false)
})

test('a document upload is read as text and a missing file is refused', async () => {
  const xml = `<w:document><w:p>Escrow account before title transfer.</w:p></w:document>`
  const packed = zipSync({ 'word/document.xml': strToU8(xml) })
  assert.match(docxToText(packed), /Escrow account before title transfer/)

  const store = memoryStore(FIXTURE)
  const denied = await handleAiToolJob(request(startBody()), {
    resolveUser: async () => ({ ok: true, userId: USER }),
    store: () => store,
    now: () => NOW,
  })
  assert.equal(denied.status, 403)
  assert.equal((await denied.json()).code, 'consent_required')
  assert.equal(store.jobs.size, 0)

  store.consents.set(JOB, consent('deal_readiness'))
  const ready = await handleAiToolJob(request(startBody()), {
    resolveUser: async () => ({ ok: true, userId: USER }),
    store: () => store,
    now: () => NOW,
  })
  assert.equal(ready.status, 200)
  const body = await ready.json()
  assert.equal(body.output.tool_key, 'deal_readiness')
  assert.equal(JSON.stringify(body.output).includes('Northwind'), false)
  assert.equal(body.output.checklist.length, 4)

  const blank = memoryStore('')
  blank.downloadFile = async () => null
  blank.consents.set(JOB, consent('deal_readiness'))
  const missed = await handleAiToolJob(request(startBody()), {
    resolveUser: async () => ({ ok: true, userId: USER }),
    store: () => blank,
    now: () => NOW,
  })
  assert.equal(missed.status, 400)
  const missedBody = await missed.json()
  assert.equal(missedBody.code, 'unreadable')
  assert.equal(missedBody.error, AI_TOOL_MESSAGES.unreadable)

  const csv = memoryStore(FIXTURE)
  csv.consents.set(JOB, consent('deal_readiness'))
  const wrong = await handleAiToolJob(
    request({ ...startBody(), mime_type: 'text/csv', storage_path: `${USER}/${JOB}/source.csv` }),
    {
      resolveUser: async () => ({ ok: true, userId: USER }),
      store: () => csv,
      now: () => NOW,
    },
  )
  assert.equal(wrong.status, 400)
  assert.equal(csv.jobs.size, 0)
})

test('the memo flag turns on in its migration and reuses the 30 day AI retention', () => {
  assert.equal(AI_TOOL_FLAG_DEFAULTS.deal_readiness, false)
  assert.equal(AI_TOOL_FLAG_DEFAULTS.cfo_check, false)
  const sql = read('supabase/migrations/20261125120000_re_ai_readiness.sql')
  assert.ok(sql.length > 0)
  assert.match(sql, /\('deal_readiness', true\)/)
  assert.equal(sql.includes("('cfo_check', true)"), false)
  assert.equal(sql.includes("('market_brief', true)"), false)
  assert.equal(sql.includes("('term_sheet_review', true)"), false)
  assert.equal(sql.includes("('pricing_sense_check', true)"), false)
  assert.match(sql, /deal_readiness/)
  assert.equal(/pg_cron/i.test(sql), false)
  assert.equal(sql.includes('\u2014') || sql.includes('\u2013'), false)
  const names = [
    '20261124120000_re_club_interest.sql',
    '20261125120000_re_ai_readiness.sql',
  ]
  assert.ok(names[1] > names[0])
  const sweep = read('supabase/migrations/20261120120000_aitools_frame.sql')
  const plan = sweep.slice(sweep.lastIndexOf('create or replace function public.retention_sweep_plan'))
  assert.match(plan, /from public\.ai_tool_jobs j/)
  assert.match(plan, /make_interval\(days => retention_days\)/)
  assert.equal(plan.includes('deal_readiness'), false)
  assert.deepEqual(visibleAiTools({ ...AI_TOOL_FLAG_DEFAULTS, deal_readiness: true }), ['deal_readiness'])
  const app = read('src/App.tsx')
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.equal(app.includes('deal-readiness'), false)
})

test('notice, will and will not, the tick gate, and the footer disclaimer render', async () => {
  const { createServer } = await import('vite')
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const desk = await vite.ssrLoadModule('/src/components/ai/AiToolDesk.tsx')
    const view = await vite.ssrLoadModule('/src/components/ai/DealReadinessView.tsx')
    const copy = renderToolCopy('deal_readiness', 'en', SLOTS)
    const output = dealReadinessOutput(input('example-teaser.txt', FIXTURE))
    const upload = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          desk.AiToolShell,
          { title: copy.title, notice: createElement(view.DealReadinessNotice, { text: copy.banner }) },
          createElement(view.DealReadinessForm, {
            copy,
            retentionDays: 30,
            consented: false,
            fileName: 'example-teaser.txt',
            busy: false,
            onConsent: () => {},
            onFile: () => {},
            onRun: () => {},
          }),
        ),
      ),
    )
    const noticeAt = upload.indexOf('data-ai-advice-notice')
    const titleAt = upload.indexOf('Deal readiness memo')
    assert.ok(titleAt >= 0 && noticeAt > titleAt)
    assert.match(upload, /This is not legal, financial or investment advice/)
    assert.match(upload, />Will</)
    assert.match(upload, />Will not</)
    assert.match(upload, /Invent a yield, a comparable, or a counterparty name/)
    assert.match(upload, /type="checkbox"/)
    assert.match(upload, /data-ai-run="off"/)
    assert.match(upload, /data-consent="off"/)
    assert.match(upload, /disabled=""/)
    assert.match(upload, /Saudi PDPL/)
    assert.match(upload, /data-re-pdpl/)
    assert.match(upload, /data-re-retention="30-day"/)
    assert.match(upload, /deleted automatically after 30 days/)
    assert.match(upload, /existing AI tools retention/)
    assert.equal(/[\u0600-\u06FF]/.test(upload), false)
    assert.equal(upload.includes('\u2014') || upload.includes('\u2013'), false)

    const ticked = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.DealReadinessForm, {
          copy,
          retentionDays: 30,
          consented: true,
          acknowledged: true,
          fileName: 'example-teaser.txt',
          busy: false,
          onConsent: () => {},
          onAcknowledge: () => {},
          onFile: () => {},
          onRun: () => {},
        }),
      ),
    )
    assert.match(ticked, /data-ai-run="on"/)
    assert.equal(ticked.includes('disabled=""'), false)

    const memo = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          desk.AiToolShell,
          { title: copy.title, notice: createElement(view.DealReadinessNotice, { text: copy.banner }) },
          createElement(desk.AiToolWillList, { will: copy.will, willNot: copy.willNot }),
          createElement(desk.AiToolReport, {
            output,
            heading: copy.title,
            footerLead: copy.footerLead,
            footerShared: copy.footerShared,
          }),
        ),
      ),
    )
    assert.match(memo, /This is not legal, financial or investment advice/)
    assert.match(memo, />Will not</)
    assert.match(memo, /data-ai-report-footer/)
    assert.match(memo, /It is not legal/)
    assert.match(memo, /tax or accounting advice/)
    assert.match(memo, /Title \/ escrow path/)
    assert.match(memo, /Foreign ownership notes/)
    assert.match(memo, /White Land flags/)
    assert.match(memo, /Known gaps/)
    assert.match(memo, /Not stated in the document/)
    assert.match(memo, />Example</)
    assert.equal(memo.includes('9.5'), false)
    assert.equal(memo.includes('Northwind'), false)
    assert.equal(/[\u0600-\u06FF]/.test(memo), false)
  } finally {
    await vite.close()
  }
})

test('deal readiness copy stays English and does not add a secret name', () => {
  const files = [
    'supabase/functions/ai-tool-job/tools/deal_readiness.ts',
    'supabase/functions/ai-tool-job/tools/deal_read.ts',
    'src/components/ai/DealReadinessMemo.tsx',
    'src/components/ai/DealReadinessView.tsx',
    'src/lib/aiToolCopy.ts',
    'supabase/migrations/20261125120000_re_ai_readiness.sql',
  ]
  for (const file of files) {
    const text = read(file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
    assert.equal(/[\u0600-\u06FF]/.test(text), false, file)
    assert.equal(/\bvaluation\b/i.test(text), false, file)
    assert.equal(/[A-Z0-9._%+-]+@(?!example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text), false, file)
  }
  const tool = read('supabase/functions/ai-tool-job/tools/deal_readiness.ts') + read('supabase/functions/ai-tool-job/tools/deal_read.ts')
  assert.equal(/BA_[A-Z0-9_]+/.test(tool), false)
  assert.equal(/api[_-]?key/i.test(tool), false)
})

function section(output: StubOutput, key: string) {
  const item = output.checklist?.find((row) => row.key === key)
  assert.ok(item, key)
  return item.detail
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
    tool_key: 'deal_readiness',
    job_id: JOB,
    storage_path: `${USER}/${JOB}/source.txt`,
    file_name: 'example-teaser.txt',
    mime_type: 'text/plain',
    byte_size: FIXTURE.length,
    lang: 'en',
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

function memoryStore(source: string): AiToolStore & {
  jobs: Map<string, JobRow>
  consents: Map<string, ConsentRow>
  downloadFile: (path: string) => Promise<Uint8Array | null>
} {
  const jobs = new Map<string, JobRow>()
  const outputs = new Map<string, OutputRow>()
  const consents = new Map<string, ConsentRow>()
  const store: AiToolStore & {
    jobs: Map<string, JobRow>
    consents: Map<string, ConsentRow>
    downloadFile: (path: string) => Promise<Uint8Array | null>
  } = {
    jobs,
    consents,
    memberLive: async () => true,
    isStaff: async () => false,
    toolEnabled: async () => true,
    consentByJob: async (jobId) => consents.get(jobId) ?? null,
    jobById: async (jobId) => jobs.get(jobId) ?? null,
    outputByJob: async (jobId) => outputs.get(jobId) ?? null,
    fileReady: async () => true,
    downloadFile: async () => new TextEncoder().encode(source),
    insertJob: async (row) => {
      if (jobs.has(row.id)) return 'conflict'
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
  return store
}

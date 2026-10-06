import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { AI_TOOL_FLAG_DEFAULTS, blockVersion, type AiToolKey, type ConsentRow } from '../supabase/functions/_shared/ai_tools.ts'
import {
  AI_TOOL_MESSAGES,
  handleAiToolJob,
  type AiToolStore,
  type JobRow,
  type OutputRow,
} from '../supabase/functions/ai-tool-job/handle.ts'
import {
  buildMarketBrief,
  isMarketSector,
  marketFileName,
  type MarketSearchHit,
} from '../supabase/functions/ai-tool-job/tools/market_brief.ts'
import { hitsFromSearchBody, searchMarketSector, sourceDateFromPageAge } from '../supabase/functions/ai-tool-job/tools/market_search.ts'
import { SHARED_WILL_NOT, renderToolCopy } from '../src/lib/aiToolCopy.ts'
import { aiReportOperatorFields } from '../src/lib/aiReportOperator.ts'
import { MARKET_SEARCH_FIXTURE } from './fixtures/market-brief-search.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const USER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-09-30T08:00:00.000Z')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

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

function memoryStore(toolOn = true) {
  const jobs = new Map<string, JobRow>()
  const outputs = new Map<string, OutputRow>()
  const notes = new Map<string, string>()
  const consents = new Map<string, ConsentRow>()
  const removed: string[] = []
  const store: AiToolStore & { jobs: Map<string, JobRow>; outputs: Map<string, OutputRow>; removed: string[] } = {
    jobs,
    outputs,
    removed,
    memberLive: async () => true,
    isStaff: async () => false,
    toolEnabled: async () => toolOn,
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
    saveNote: async (row) => {
      notes.set(row.job_id, row.title)
      return true
    },
    markJob: async (jobId, patch) => {
      const current = jobs.get(jobId)
      if (!current) return false
      jobs.set(jobId, { ...current, ...patch, error: patch.error ?? null, updated_at: NOW.toISOString() })
      return true
    },
    deleteOwned: async () => null,
    removeFile: async (filePath) => {
      removed.push(filePath)
      return true
    },
  }
  return { store, consents, notes }
}

function marketStart() {
  return {
    action: 'start',
    tool_key: 'market_brief',
    job_id: JOB,
    storage_path: `${USER}/${JOB}/source.txt`,
    file_name: marketFileName('Health'),
    mime_type: 'text/plain',
    byte_size: 24,
    sector: 'Health',
  }
}

const slots = {
  ...aiReportOperatorFields(),
  provider: 'Example AI',
  privacy: '/privacy',
  terms: '/terms',
  retentionDays: 30,
  date: '30 Sep 2026',
}

test('market brief flag stays off', () => {
  assert.equal(AI_TOOL_FLAG_DEFAULTS.market_brief, false)
  const sql = read('supabase/migrations/20261120120000_aitools_frame.sql')
  assert.match(sql, /\('market_brief', false\)/)
  assert.equal(sql.includes("('market_brief', true)"), false)
  assert.equal(isMarketSector('Health'), true)
  assert.equal(isMarketSector('Not a sector'), false)
})

test('market brief will lines are English only, including shared lines', () => {
  const english = renderToolCopy('market_brief', 'en', slots)
  assert.equal(
    english.will[0],
    'Outline common licences, foreign ownership and local partner points, Saudization (Nitaqat) and incentives for your sector.',
  )
  assert.equal(english.willNot.includes(SHARED_WILL_NOT[0]), true)
  assert.equal(/[\u0600-\u06FF]/.test(JSON.stringify(english)), false)
  const cfo = renderToolCopy('cfo_check', 'en', slots)
  assert.equal(cfo.willNot.includes(SHARED_WILL_NOT[0]), true)
  const source = read('src/lib/aiToolCopy.ts')
  assert.equal(source.includes('SHARED_WILL_NOT_AR'), false)
  assert.equal(/[\u0600-\u06FF]/.test(source), false)
})

test('a brief is built only from dated fixture hits', () => {
  const output = buildMarketBrief({ sector: 'Health', hits: MARKET_SEARCH_FIXTURE, generatedOn: '30 Sep 2026' })
  assert.equal(output.tool_key, 'market_brief')
  assert.deepEqual(
    output.sources.map((source) => source.url),
    MARKET_SEARCH_FIXTURE.map((hit) => hit.url),
  )
  assert.ok(output.sources.every((source) => source.dated.length > 0 && source.url.startsWith('https://example.com/')))
  assert.match(output.summary, /Health/)
  assert.match(output.findings.join(' '), /investment registration/)
  assert.equal(output.sources.some((source) => source.url === 'https://example.com/misa'), false)
  assert.equal(JSON.stringify(output).includes('Example public note on market entry'), false)
  const empty = buildMarketBrief({ sector: 'Health', hits: [], generatedOn: '30 Sep 2026' })
  assert.deepEqual(empty.sources, [])
  assert.equal(JSON.stringify(empty).includes('https://'), false)
  assert.match(empty.findings.join(' '), /No dated public source was returned/)
  const dirty: MarketSearchHit[] = [
    ...MARKET_SEARCH_FIXTURE,
    {
      topic: 'licences',
      title: 'Undated',
      url: 'https://example.com/misa/undated',
      dated: 'yesterday',
      snippet: 'This date is not a real page date.',
    },
    {
      topic: 'licences',
      title: 'Bad scheme',
      url: 'http://example.com/misa/plain',
      dated: '01 Jan 2026',
      snippet: 'This page is not an https source.',
    },
  ]
  const cleaned = buildMarketBrief({ sector: 'Health', hits: dirty, generatedOn: '30 Sep 2026' })
  assert.equal(cleaned.sources.some((source) => source.url.includes('undated') || source.url.startsWith('http://')), false)
})

test('search parsing keeps dated https hits and skips a missing key', async () => {
  assert.equal(sourceDateFromPageAge('2026-01-15T12:00:00'), '15 Jan 2026')
  assert.equal(sourceDateFromPageAge('2 days ago'), null)
  const parsed = hitsFromSearchBody(
    {
      web: {
        results: [
          {
            title: 'Example note',
            url: 'https://example.com/misa/note',
            description: 'A public note with a page date.',
            page_age: '2026-01-15T00:00:00',
          },
          {
            title: 'No date',
            url: 'https://example.com/misa/nodate',
            description: 'This result has no page date.',
          },
          {
            title: 'Insecure',
            url: 'http://example.com/misa/http',
            description: 'This result is not https.',
            page_age: '2026-01-15T00:00:00',
          },
        ],
      },
    },
    'licences',
  )
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0]?.url, 'https://example.com/misa/note')
  assert.equal(parsed[0]?.dated, '15 Jan 2026')

  let calls = 0
  const fetchImpl: typeof fetch = async (input, init) => {
    calls += 1
    const url = String(input)
    assert.match(url, /api\.search\.brave\.com/)
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('X-Subscription-Token'), 'test-search-key')
    if (url.includes('Nitaqat')) {
      return new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })
    }
    if (url.includes('incentives') || url.includes('ownership')) {
      return new Response('no', { status: 503 })
    }
    return new Response(
      JSON.stringify({
        web: {
          results: [
            {
              title: 'Example licence note',
              url: 'https://example.com/misa/investment-registration',
              description: 'A foreign company commonly files an investment registration before it operates.',
              page_age: '2026-01-15T00:00:00',
            },
          ],
        },
      }),
      { status: 200 },
    )
  }
  const blank = await searchMarketSector('Health', '  ', fetchImpl)
  assert.equal(blank, null)
  assert.equal(calls, 0)
  const hits = await searchMarketSector('Health', 'test-search-key', fetchImpl)
  assert.ok(hits)
  assert.equal(hits.length, 1)
  assert.equal(hits[0]?.dated, '15 Jan 2026')
  assert.equal(JSON.stringify(hits).includes('test-search-key'), false)
})

test('a missing search key does not write a market brief', async () => {
  const { store, consents } = memoryStore(true)
  consents.set(JOB, consent('market_brief'))
  let searched = 0
  const denied = await handleAiToolJob(request(marketStart()), {
    resolveUser: async () => ({ ok: true, userId: USER }),
    store: () => store,
    now: () => NOW,
    searchConfigured: () => false,
    searchMarket: async () => {
      searched += 1
      return { ok: true, hits: MARKET_SEARCH_FIXTURE }
    },
  })
  assert.equal(denied.status, 503)
  const body = await denied.json()
  assert.equal(body.code, 'search_not_configured')
  assert.equal(body.error, AI_TOOL_MESSAGES.searchOff)
  assert.equal(store.jobs.size, 0)
  assert.equal(store.outputs.size, 0)
  assert.deepEqual(store.removed, [`${USER}/${JOB}/source.txt`])
  assert.equal(searched, 0)
  assert.equal(JSON.stringify(body).includes('https://'), false)
})

test('fixture search writes only those sources and an off flag never searches', async () => {
  const { store, notes, consents } = memoryStore(true)
  consents.set(JOB, consent('market_brief'))
  const ok = await handleAiToolJob(request(marketStart()), {
    resolveUser: async () => ({ ok: true, userId: USER }),
    store: () => store,
    now: () => NOW,
    newId: () => '33333333-3333-4333-8333-333333333333',
    searchConfigured: () => true,
    searchMarket: async () => ({ ok: true, hits: MARKET_SEARCH_FIXTURE }),
  })
  assert.equal(ok.status, 200)
  const started = await ok.json()
  assert.deepEqual(
    started.output.sources.map((source: { url: string }) => source.url),
    MARKET_SEARCH_FIXTURE.map((hit) => hit.url),
  )
  assert.equal(notes.get(JOB), 'Health')
  assert.equal(JSON.stringify(started.output).includes('https://example.com/misa"'), false)

  const off = memoryStore(false)
  let called = 0
  const blocked = await handleAiToolJob(request(marketStart()), {
    resolveUser: async () => ({ ok: true, userId: USER }),
    store: () => off.store,
    now: () => NOW,
    searchConfigured: () => true,
    searchMarket: async () => {
      called += 1
      return { ok: true, hits: MARKET_SEARCH_FIXTURE }
    },
  })
  assert.equal(blocked.status, 403)
  assert.equal(called, 0)
  assert.equal(off.store.outputs.size, 0)
})

test('search status reports the key without returning it', async () => {
  const missing = await handleAiToolJob(request({ action: 'search_status' }), {
    resolveUser: async () => ({ ok: true, userId: USER }),
    store: () => null,
    now: () => NOW,
  })
  assert.equal(missing.status, 200)
  const missingBody = await missing.json()
  assert.equal(missingBody.search, 'not_configured')
  const ready = await handleAiToolJob(request({ action: 'search_status' }), {
    resolveUser: async () => ({ ok: true, userId: USER }),
    store: () => null,
    now: () => NOW,
    searchConfigured: () => true,
  })
  const readyBody = await ready.json()
  assert.equal(readyBody.search, 'ready')
  assert.equal(JSON.stringify(readyBody).includes('BA_DD_SEARCH_API_KEY'), false)
  const anon = await handleAiToolJob(request({ action: 'search_status' }), {
    resolveUser: async () => ({ ok: false, status: 401, error: 'Sign in to run this check.', code: 'unauthorized' }),
    store: () => null,
    now: () => NOW,
    searchConfigured: () => true,
  })
  assert.equal(anon.status, 401)
})

test('market uploads stay on the shared retention sweep', () => {
  const sql = read('supabase/migrations/20261120120000_aitools_frame.sql')
  const sweep = sql.slice(sql.lastIndexOf('create or replace function public.retention_sweep_plan'))
  assert.match(sweep, /from public\.ai_tool_jobs j/)
  assert.match(sweep, /delete from public\.ai_tool_outputs/)
  assert.match(sweep, /delete from public\.ai_tool_notes/)
  assert.match(sweep, /delete from public\.ai_tool_jobs/)
  assert.equal(sweep.includes("market_brief"), false)
  const edge = read('supabase/functions/retention-sweep/index.ts')
  assert.match(edge, /ai-tool-uploads/)
  assert.match(edge, /source\\\.\(pdf\|txt\|csv\|xlsx\|docx\)/)
  const handler = read('supabase/functions/ai-tool-job/handle.ts')
  assert.match(handler, /buildMarketBrief/)
  assert.equal(handler.includes('marketBriefOutput'), false)
  const index = read('supabase/functions/ai-tool-job/index.ts')
  assert.match(index, /BA_DD_SEARCH_API_KEY/)
  assert.equal(/BA_MARKET_[A-Z0-9_]+/.test(index), false)
  const env = read('.env.example')
  assert.match(env, /# BA_DD_SEARCH_API_KEY=/)
  assert.equal(/^\s*BA_DD_SEARCH_API_KEY=\S+/m.test(env), false)
})

test('market form, unavailable state, and staff search notice', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const formMod = await vite.ssrLoadModule('/src/components/ai/MarketBriefForm.tsx')
    const desk = await vite.ssrLoadModule('/src/components/ai/AiToolDesk.tsx')
    const settings = await vite.ssrLoadModule('/src/pages/admin/AiToolSettingsPanel.tsx')
    const copyMod = await vite.ssrLoadModule('/src/lib/aiToolCopy.ts')
    const brief = await vite.ssrLoadModule('/supabase/functions/ai-tool-job/tools/market_brief.ts')
    const copy = copyMod.renderToolCopy('market_brief', 'en', slots)
    const locked = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(formMod.MarketBriefForm, {
          copy,
          lang: 'en',
          sector: 'Health',
          consented: false,
          busy: false,
          onSector: () => {},
          onConsent: () => {},
          onRun: () => {},
        }),
      ),
    )
    assert.match(locked, /data-ai-run="off"/)
    assert.match(locked, /Health/)
    assert.match(locked, /not legal or tax advice/)
    const open = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(formMod.MarketBriefForm, {
          copy,
          lang: 'en',
          sector: 'Health',
          consented: true,
          busy: false,
          onSector: () => {},
          onConsent: () => {},
          onRun: () => {},
        }),
      ),
    )
    assert.match(open, /data-ai-run="on"/)
    const englishForm = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(formMod.MarketBriefForm, {
          copy,
          sector: '',
          consented: false,
          busy: false,
          onSector: () => {},
          onConsent: () => {},
          onRun: () => {},
        }),
      ),
    )
    assert.match(englishForm, /Outline common licences/)
    assert.match(englishForm, /Guarantee that its output is accurate, complete or current/)
    assert.equal(/[\u0600-\u06FF]/.test(englishForm), false)
    assert.equal(englishForm.includes('dir="rtl"'), false)
    assert.equal(englishForm.includes('search not configured'), false)
    const unavailable = renderToStaticMarkup(createElement(formMod.MarketUnavailable))
    assert.match(unavailable, /This brief is not available right now/)
    assert.match(unavailable, /Nothing was generated/)
    assert.equal(unavailable.includes('search not configured'), false)
    assert.equal(unavailable.includes('example.com'), false)
  const notice = renderToStaticMarkup(createElement(formMod.MarketSearchNotice))
  assert.match(notice, /Search is not set up yet\. Market brief needs the search key before it can run\./)
  assert.match(notice, /class="[^"]*w-full/)
  assert.equal(/[\u0600-\u06FF]/.test(notice), false)
  assert.equal(englishForm.includes('Search is not set up yet'), false)
  assert.equal(unavailable.includes('Search is not set up yet'), false)
    const output = brief.buildMarketBrief({
      sector: 'Health',
      hits: MARKET_SEARCH_FIXTURE,
      generatedOn: '30 Sep 2026',
    })
    const report = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(desk.AiToolReport, {
          output,
          lang: 'en',
          heading: copy.title,
          footerLead: copy.footerLead,
          footerShared: copy.footerShared,
        }),
      ),
    )
    assert.match(report, /https:\/\/example\.com\/misa\/investment-registration/)
    assert.match(report, /15 Jan 2026/)
    assert.match(report, /04 Apr 2026/)
    assert.equal(report.includes('Example public note on market entry'), false)
    const panel = renderToStaticMarkup(
      createElement(settings.AiToolSettingsPanel, {
        shot: { retentionDays: 30, flags: { ...AI_TOOL_FLAG_DEFAULTS }, searchConfigured: false },
      }),
    )
    assert.match(panel, /Market brief/)
    assert.match(panel, /Off for members/)
    assert.match(panel, /Search is not set up yet/)
    assert.match(panel, /w-full/)
    assert.equal(/\bvaluation\b/i.test(locked + englishForm + report + panel), false)
  } finally {
    await vite.close()
  }
})

test('an Arabic run writes Arabic findings, questions, and the disclaimer', async () => {
  const output = buildMarketBrief({
    sector: 'Health',
    hits: MARKET_SEARCH_FIXTURE,
    generatedOn: '30 Sep 2026',
    lang: 'ar',
  })
  const prose = [output.summary, output.limits, ...output.findings, ...output.questions].join('\n')
  let withoutTitles = prose
  for (const source of output.sources) withoutTitles = withoutTitles.split(source.title).join(' ')
  assert.equal(/[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})+/.test(withoutTitles), false)
  assert.match(output.summary, /الصحة/)
  assert.match(output.findings.join('\n'), /التراخيص/)
  assert.match(output.findings.join('\n'), /لم يُرجع مصدر|وُجد مصدر عام/)
  assert.match(output.questions.join('\n'), /وزارة الاستثمار/)
  assert.match(output.limits, /لا يؤكد هذا الموجز ما ينطبق على حالتك تحديداً/)
  assert.equal(output.limits.includes('does not confirm'), false)
  assert.equal(output.sources[0]?.title, MARKET_SEARCH_FIXTURE[0]?.title)
  assert.equal(output.sources[0]?.dated, '١٥ يناير ٢٠٢٦')
  assert.equal(output.generated_on, '٣٠ سبتمبر ٢٠٢٦')
  const footer = renderToolCopy('market_brief', 'en', { ...slots, date: '30 Sep 2026' })
  assert.match(footer.footerLead, /Saudi market entry brief\. Based on public sources as at 30 Sep 2026/)
  assert.match(footer.footer, /Generated by AI/)
  assert.equal(/[\u0600-\u06FF]/.test(footer.footer), false)

  const { store, consents } = memoryStore(true)
  consents.set(JOB, consent('market_brief'))
  const ran = await handleAiToolJob(request({ ...marketStart(), lang: 'ar' }), {
    resolveUser: async () => ({ ok: true, userId: USER }),
    store: () => store,
    now: () => NOW,
    newId: () => '33333333-3333-4333-8333-333333333333',
    searchConfigured: () => true,
    searchMarket: async () => ({ ok: true, hits: MARKET_SEARCH_FIXTURE }),
  })
  assert.equal(ran.status, 200)
  const body = await ran.json()
  assert.match(body.output.summary, /موجز عام/)
  assert.match(body.output.questions[0], /ترخيص/)
  assert.match(body.output.limits, /لا يؤكد هذا الموجز/)
  assert.equal(body.output.sources[0].title, 'Example note on investment registration')
  let live = [body.output.summary, body.output.limits, ...body.output.findings, ...body.output.questions].join('\n')
  for (const source of body.output.sources) live = live.split(source.title).join(' ')
  assert.equal(/[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})+/.test(live), false)
})

test('added market lines do not use em dashes', () => {
  const files = [
    'src/components/ai/MarketBriefForm.tsx',
    'src/pages/dashboard/AiToolPage.tsx',
    'src/pages/admin/AiToolSettingsPanel.tsx',
    'src/pages/admin/StaffAiToolsPage.tsx',
    'src/lib/aiToolCopy.ts',
    'src/lib/aiToolApi.ts',
    'supabase/functions/ai-tool-job/handle.ts',
    'supabase/functions/ai-tool-job/index.ts',
    'supabase/functions/ai-tool-job/tools/market_brief.ts',
    'supabase/functions/ai-tool-job/tools/market_search.ts',
    'scripts/fixtures/market-brief-search.ts',
  ]
  for (const file of files) {
    const text = read(file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
    assert.equal(/\bvaluation\b/i.test(text), false, file)
  }
})

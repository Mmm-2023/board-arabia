import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import {
  missingBannerLabels,
  numberDeckPages,
  parseDeckAnalysis,
  preferredAsk,
  preferredCompany,
  SCORE_KEYS,
  SCORE_LABEL,
} from '../supabase/functions/_shared/deck_analysis.ts'
import {
  DD_PROGRESS,
  JOB_DEADLINE_MS,
  MEMBER_MESSAGES,
  extractDeckFacts,
  isTerminalModelFailure,
  modelJobFields,
  NOT_STATED,
  shouldFailStaleJob,
  stageLabel,
  type BuiltReport,
} from '../supabase/functions/_shared/due_diligence.ts'
import { FALLBACK_MODEL_ID, analyzeDeckText, extractDeckFactsWithOptionalLlm } from '../supabase/functions/due-diligence-start/llm.ts'
import { deskProgressLine, DD_COPY } from '../src/lib/dueDiligenceCopy.ts'
import { partialDraftAnalysis, partialDraftRaw, partialDraftReport, fullDraftAnalysis, fullDraftReport, FIXTURE_DECK } from '../src/lib/dueDiligenceMemoFixture.ts'
import { REPORT_COPY } from '../src/lib/dueDiligenceCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function bannedPhrases(): string[] {
  const join = (parts: string[]) => parts.join('')
  return [
    join(['re', 'hal']),
    join(['hz-', 'rh', 'l', '1']),
    join(['5y-', 'lj', 'm']),
    join(['18', '.', '1']),
    join(['48', '0']),
    join(['57', '4']),
  ]
}

test('prompt files stay generic and do not carry a worked example', () => {
  const dir = path.join(root, 'supabase/functions/due-diligence-start/prompts')
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts'))
  assert.ok(files.includes('system_prompt.ts'))
  assert.ok(files.includes('repair_prompt.ts'))
  assert.ok(files.includes('schema_prompt.ts'))
  const banned = bannedPhrases()
  for (const name of files) {
    const text = readFileSync(path.join(dir, name), 'utf8').toLowerCase()
    for (const phrase of banned) {
      assert.equal(text.includes(phrase.toLowerCase()), false, `${name} contains a banned phrase`)
    }
    assert.equal(text.includes('\u2014'), false, name)
    assert.equal(text.includes('\u2013'), false, name)
  }
  const system = readFileSync(path.join(dir, 'system_prompt.ts'), 'utf8')
  assert.match(system, /evidence_required/)
  assert.match(system, /discuss_with_milestones/)
  assert.match(system, /Year-1 volume/)
  assert.match(system, /not a business deck/i)
})

test('page headers keep the source page index', () => {
  const numbered = numberDeckPages([
    'Northwind Freight sells a pilot lane to example.com customers in the region.',
    '',
    'The raise is 2 million dollars and the site is https://example.com/northwind.',
  ])
  assert.match(numbered, /^Page 1\nNorthwind Freight/)
  assert.match(numbered, /Page 3\nThe raise/)
  assert.equal(numbered.includes('Page 2'), false)
})

test('a full draft parses and a partial draft keeps the valid sections', () => {
  const full = fullDraftAnalysis()
  assert.equal(full.snapshot.posture, 'evidence_required')
  assert.equal(full.scores.overall, 2)
  assert.equal(full.math_checks.some((row) => row.result === 'breaks'), true)
  assert.equal(full.sections_missing.length, 0)
  assert.equal(full.meta.review_type, 'deck_only')
  assert.match(full.meta.disclaimer, /Not investment advice/)

  const partial = parseDeckAnalysis(partialDraftRaw())
  assert.ok(partial)
  assert.equal(partial?.scores.traction_evidence, null)
  assert.equal(partial?.scores.overall, 2)
  assert.equal(partial?.math_checks.length, 2)
  assert.equal(partial?.risks.length, 1)
  assert.equal(partial?.risks[0]?.severity, 'high')
  assert.equal(partial?.memo_markdown, '')
  assert.equal(partial?.unit_economics, null)
  assert.ok(partial?.sections_missing.includes('memo_markdown'))
  assert.ok(partial?.sections_missing.includes('unit_economics'))
  assert.equal(partialDraftAnalysis().meta.company, 'Northwind Freight')
})

test('company name comes from the model and the heuristic is only the fallback', async () => {
  assert.equal(preferredCompany(''), '')
  assert.equal(preferredCompany('not in deck'), '')
  assert.equal(preferredCompany('Northwind Freight'), 'Northwind Freight')
  assert.equal(preferredAsk({ amount: 2000000, equity_pct: 10, pre_money: null, post_money: null, currency: 'USD' }), 'Raise of 2000000 USD for 10% equity')
  const heuristic = extractDeckFacts(FIXTURE_DECK)
  assert.equal(heuristic.company, 'Northwind Freight')
  assert.notEqual(heuristic.company, NOT_STATED)

  const previousFetch = globalThis.fetch
  const previousDeno = (globalThis as { Deno?: unknown }).Deno
  ;(globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno = {
    env: {
      get: (key: string) =>
        ({
          BA_DD_LLM_PROVIDER: 'xai',
          BA_DD_LLM_API_KEY: 'dd-unit-test-token',
          BA_DD_LLM_MODEL: 'unit-model-id',
        })[key],
    },
  }
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...partialDraftRaw(),
                meta: { company: '', document: 'deck', as_of: '', review_type: 'deck_only', disclaimer: '' },
                memo_markdown: 'Verdict: the model left the company blank.',
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch
  try {
    const result = await extractDeckFactsWithOptionalLlm(FIXTURE_DECK, 'northwind-freight.pdf', `Page 1\n${FIXTURE_DECK}`)
    assert.equal(result.modelRan, true)
    assert.equal(result.facts.company, heuristic.company)
    assert.equal(result.analysis?.meta.company, '')
  } finally {
    globalThis.fetch = previousFetch
    ;(globalThis as { Deno?: unknown }).Deno = previousDeno
  }
})

test('a failed primary call is retried once and the reason is ready for the job row', async () => {
  const calls: { model?: string }[] = []
  const previousFetch = globalThis.fetch
  const previousDeno = (globalThis as { Deno?: unknown }).Deno
  ;(globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno = {
    env: {
      get: (key: string) =>
        ({
          BA_DD_LLM_PROVIDER: 'xai',
          BA_DD_LLM_API_KEY: 'dd-unit-test-token',
          BA_DD_LLM_MODEL: 'unit-model-id',
        })[key],
    },
  }
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as { model?: string }
    calls.push(body)
    if (calls.length === 1) return new Response('no', { status: 503 })
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fullDraftAnalysis()) } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const result = await extractDeckFactsWithOptionalLlm(FIXTURE_DECK, 'northwind-freight.pdf', `Page 1\n${FIXTURE_DECK}`)
    assert.equal(calls.length, 2)
    assert.equal(calls[0]?.model, 'unit-model-id')
    assert.equal(calls[1]?.model, FALLBACK_MODEL_ID)
    assert.equal(result.usedFallback, true)
    assert.equal(result.modelRan, true)
    assert.equal(result.modelId, FALLBACK_MODEL_ID)
    assert.match(result.skipReason || '', /primary_http_503/)
    assert.match(result.skipReason || '', /fallback/)
    const fields = modelJobFields({ modelId: result.modelId, skipReason: result.skipReason })
    assert.equal(fields.model_id, FALLBACK_MODEL_ID)
    assert.match(fields.model_skip_reason || '', /primary_http_503/)
    assert.equal((fields.model_skip_reason || '').length <= 160, true)
  } finally {
    globalThis.fetch = previousFetch
    ;(globalThis as { Deno?: unknown }).Deno = previousDeno
  }
})

test('the job row stores the model and a stale job is failed instead of restarted', () => {
  assert.equal(JOB_DEADLINE_MS < 400_000, true)
  assert.equal(JOB_DEADLINE_MS <= 240_000, true)
  assert.equal(JOB_DEADLINE_MS > 75_000, true)
  const steps = Object.values(DD_PROGRESS)
  for (let index = 1; index < steps.length; index += 1) {
    assert.equal(steps[index] > steps[index - 1], true)
  }
  const now = Date.parse('2026-09-29T12:00:00.000Z')
  const fresh = new Date(now - 1_000).toISOString()
  const old = new Date(now - JOB_DEADLINE_MS - 1_000).toISOString()
  assert.equal(shouldFailStaleJob({ status: 'checking', updatedAt: fresh, createdAt: fresh, nowMs: now }), false)
  assert.equal(shouldFailStaleJob({ status: 'checking', updatedAt: old, createdAt: fresh, nowMs: now }), true)
  assert.equal(shouldFailStaleJob({ status: 'writing', updatedAt: fresh, createdAt: old, nowMs: now }), true)
  assert.equal(shouldFailStaleJob({ status: 'queued', updatedAt: old, createdAt: old, nowMs: now }), true)
  assert.equal(shouldFailStaleJob({ status: 'ready', updatedAt: old, createdAt: old, nowMs: now }), false)
  assert.equal(shouldFailStaleJob({ status: 'failed', updatedAt: old, createdAt: old, nowMs: now }), false)
  assert.equal(stageLabel('checking', DD_PROGRESS.model), 'Asking the model')
  assert.equal(stageLabel('checking', DD_PROGRESS.repair), 'Repairing the draft')
  assert.equal(stageLabel('checking', DD_PROGRESS.fallback), 'Trying the backup model')
  assert.equal(stageLabel('writing', DD_PROGRESS.save), 'Saving the draft')
  assert.equal(deskProgressLine('Asking the model'), 'Asking the model')
  assert.equal(deskProgressLine('Reading the deck'), DD_COPY.statusReading)
  assert.equal(isTerminalModelFailure('primary_timeout', false), true)
  assert.equal(isTerminalModelFailure('missing_api_key', false), false)
  assert.equal(isTerminalModelFailure(null, true), false)
  const status = readFileSync(path.join(root, 'supabase/functions/due-diligence-status/index.ts'), 'utf8')
  const run = readFileSync(path.join(root, 'supabase/functions/due-diligence-start/run.ts'), 'utf8')
  const migration = readFileSync(path.join(root, 'supabase/migrations/20261011120000_due_diligence_grok_draft.sql'), 'utf8')
  assert.match(status, /shouldFailStaleJob/)
  assert.match(status, /stale_worker/)
  assert.match(status, /status: 'failed'/)
  assert.equal(status.includes("status: 'queued'"), false)
  assert.match(run, /modelJobFields/)
  assert.match(run, /numberDeckPages/)
  assert.match(run, /DD_PROGRESS/)
  assert.match(run, /isTerminalModelFailure/)
  assert.match(run, /analysis_status: 'draft'/)
  assert.match(migration, /model_skip_reason/)
  assert.match(migration, /analysis_status = 'draft'/)
  assert.match(migration, /Not applied by the authoring agent/)
  const blank = modelJobFields({ modelId: '', skipReason: 'missing_api_key' })
  assert.equal(blank.model_id, null)
  assert.equal(blank.model_skip_reason, 'missing_api_key')
  const timed = modelJobFields({ modelId: 'unit-model-id', skipReason: 'primary_timeout' })
  assert.equal(timed.model_id, 'unit-model-id')
  assert.equal(timed.model_skip_reason, 'primary_timeout')
  assert.equal(MEMBER_MESSAGES.timedOut.includes('\u2014'), false)
})

test('a model call that runs out of time fails with the model id stored', async () => {
  const stages: string[] = []
  const previousFetch = globalThis.fetch
  const previousDeno = (globalThis as { Deno?: unknown }).Deno
  ;(globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno = {
    env: {
      get: (key: string) =>
        ({
          BA_DD_LLM_PROVIDER: 'xai',
          BA_DD_LLM_API_KEY: 'dd-unit-test-token',
          BA_DD_LLM_MODEL: 'unit-model-id',
        })[key],
    },
  }
  globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) {
        reject(new Error('missing signal'))
        return
      }
      const abort = () => {
        const error = new Error('timed out')
        error.name = 'TimeoutError'
        reject(error)
      }
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    })) as typeof fetch
  try {
    const expired = await analyzeDeckText(`Page 1\n${FIXTURE_DECK}`, { deadlineAt: Date.now() - 1 })
    assert.equal(expired.modelRan, false)
    assert.match(expired.skipReason || '', /deadline/)
    assert.equal(expired.modelId, FALLBACK_MODEL_ID)

    const result = await analyzeDeckText(`Page 1\n${FIXTURE_DECK}`, {
      callTimeoutMs: 30,
      onStage: async (stage) => {
        stages.push(stage)
      },
    })
    assert.deepEqual(stages, ['model', 'fallback'])
    assert.equal(result.modelRan, false)
    assert.equal(result.modelId, FALLBACK_MODEL_ID)
    assert.match(result.skipReason || '', /primary_timeout/)
    assert.match(result.skipReason || '', /fallback_timeout/)
    const fields = modelJobFields({ modelId: result.modelId, skipReason: result.skipReason })
    assert.equal(fields.model_id, FALLBACK_MODEL_ID)
    assert.match(fields.model_skip_reason || '', /timeout/)
    assert.equal(isTerminalModelFailure(result.skipReason, result.modelRan), true)
  } finally {
    globalThis.fetch = previousFetch
    ;(globalThis as { Deno?: unknown }).Deno = previousDeno
  }
})

test('the draft memo renders at the hero, bars, math, risks, accordion, and footer', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const mod = (await vite.ssrLoadModule('/src/shell/renderDueReport.tsx')) as {
      renderDueReport: (value: BuiltReport, fileName: string, preparedAt: string) => string
    }
    const full = mod.renderDueReport(fullDraftReport(), 'northwind-freight.pdf', '2026-09-29T09:00:00.000Z')
    assert.ok(full.includes('data-dd-ai="draft"'))
    assert.ok(full.includes('data-dd-posture="evidence_required"'))
    assert.ok(full.includes('data-dd-overall="2"'))
    assert.ok(full.includes('Pre-money'))
    assert.ok(full.includes('20,000,000 USD'))
    assert.ok(full.includes('data-dd-score="unit_economics"'))
    assert.ok(full.includes('data-dd-math="cards"'))
    assert.ok(full.includes('data-dd-math="table"'))
    assert.ok(full.includes('data-dd-math-result="ties"'))
    assert.ok(full.includes('data-dd-math-result="breaks"'))
    assert.ok(full.includes('data-dd-risk="high"'))
    assert.ok(full.includes('data-dd-accordion="memo"'))
    assert.ok(full.includes('data-dd-disclaimer="true"'))
    assert.ok(full.includes('Not investment advice'))
    assert.ok(full.includes(REPORT_COPY.notRecommendation))
    assert.ok(full.includes('https://example.com/northwind'))
    assert.equal(full.includes('\u2014'), false)
    assert.equal(full.includes('\u2013'), false)

    const partialAnalysis = partialDraftAnalysis()
    const gaps = missingBannerLabels(partialAnalysis)
    for (const key of SCORE_KEYS) {
      if (key === 'overall') continue
      assert.equal(gaps.includes(SCORE_LABEL[key]), partialAnalysis.scores[key] == null, SCORE_LABEL[key])
    }
    assert.equal(partialAnalysis.scores.unit_economics, 2)
    assert.equal(partialAnalysis.scores.traction_evidence, null)
    assert.ok(partialAnalysis.sections_missing.includes('unit_economics'))
    assert.deepEqual(gaps, ['Traction', 'Memo'])

    const partial = mod.renderDueReport(partialDraftReport(), 'northwind-freight.pdf', '2026-09-29T09:00:00.000Z')
    assert.ok(partial.includes('data-dd-degraded="true"'))
    assert.ok(partial.includes('data-dd-partial="true"'))
    assert.ok(partial.includes('data-dd-missing="Traction|Memo"'))
    const unitBar = partial.slice(partial.indexOf('data-dd-score="unit_economics"'), partial.indexOf('data-dd-score="unit_economics"') + 700)
    const tractionBar = partial.slice(partial.indexOf('data-dd-score="traction_evidence"'), partial.indexOf('data-dd-score="traction_evidence"') + 700)
    assert.ok(unitBar.includes('2 of 5'))
    assert.equal(unitBar.includes('>Missing<'), false)
    assert.ok(tractionBar.includes('>Missing<'))
    assert.ok(partial.includes('data-dd-memo-text="missing"'))
    assert.ok(partial.includes('backup model'))
    assert.ok(partial.includes('marked missing'))
    assert.equal(partial.includes('\u2014'), false)
    assert.equal(partial.includes('\u2013'), false)
  } finally {
    await vite.close()
  }
})

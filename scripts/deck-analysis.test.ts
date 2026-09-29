import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import {
  compareRange,
  derivePosture,
  findRangeBreaches,
  fitNumberedDeck,
  mergeSectionDrafts,
  narrativeDeckExcerpt,
  missingBannerLabels,
  numberDeckPages,
  parseDeckAnalysis,
  preferredAsk,
  preferredCompany,
  rawHasHero,
  SCORE_KEYS,
  SCORE_LABEL,
} from '../supabase/functions/_shared/deck_analysis.ts'
import {
  afterModelAttempt,
  claimAllowed,
  classifyFallback,
  DD_PROGRESS,
  formatStepLog,
  EDGE_WALL_CLOCK_MS,
  FALLBACK_MS,
  JOB_STALE_MS,
  MEMBER_MESSAGES,
  PRIMARY_CAP_MS,
  STEP_ANALYSIS_CAP_MS,
  STEP_ANALYSIS_STALE_MS,
  STEP_ANALYSIS_TTFT_MS,
  STEP_COMPOSE_BUDGET_MS,
  STEP_COMPOSE_REPAIR_MS,
  STEP_COMPOSE_STALE_MS,
  STEP_EXTRACT_BUDGET_MS,
  STEP_EXTRACT_STALE_MS,
  STEP_HANDOFF_STALE_MS,
  STEP_NARRATIVE_CAP_MS,
  STEP_NARRATIVE_STALE_MS,
  STEP_NARRATIVE_TTFT_MS,
  STEP_SCORES_CAP_MS,
  STEP_SCORES_STALE_MS,
  STEP_SCORES_TTFT_MS,
  extractDeckFacts,
  isTerminalModelFailure,
  modelJobFields,
  NOT_STATED,
  shouldFailStaleJob,
  stageLabel,
  type BuiltReport,
} from '../supabase/functions/_shared/due_diligence.ts'
import { FALLBACK_MODEL_ID, PRIMARY_CALL_MS, PRIMARY_REASONING_EFFORT, analyzeDeckSection, analyzeDeckText, extractDeckFactsWithOptionalLlm } from '../supabase/functions/due-diligence-start/llm.ts'
import { deskProgressLine, DD_COPY } from '../src/lib/dueDiligenceCopy.ts'
import { partialDraftAnalysis, partialDraftRaw, partialDraftReport, fullDraftAnalysis, fullDraftRaw, fullDraftReport, FIXTURE_DECK } from '../src/lib/dueDiligenceMemoFixture.ts'
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

test('a failed primary call stays on that step and the backup is a later pass', async () => {
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
    if (body.model === 'unit-model-id') return new Response('no', { status: 503 })
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fullDraftAnalysis()) } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const primary = await analyzeDeckText(`Page 1\n${FIXTURE_DECK}`, { mode: 'primary' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.model, 'unit-model-id')
    assert.equal(primary.modelRan, false)
    assert.equal(primary.modelId, 'unit-model-id')
    assert.match(primary.skipReason || '', /primary_http_503/)
    assert.equal(afterModelAttempt('primary', false), 'fallback')
    const backup = await analyzeDeckText(`Page 1\n${FIXTURE_DECK}`, { mode: 'fallback' })
    assert.equal(calls.length, 2)
    assert.equal(calls[1]?.model, FALLBACK_MODEL_ID)
    assert.equal(backup.usedFallback, true)
    assert.equal(backup.modelRan, true)
    assert.equal(backup.modelId, FALLBACK_MODEL_ID)
    const fields = modelJobFields({ modelId: backup.modelId, skipReason: primary.skipReason })
    assert.equal(fields.model_id, FALLBACK_MODEL_ID)
    assert.match(fields.model_skip_reason || '', /primary_http_503/)
    assert.equal((fields.model_skip_reason || '').length <= 160, true)
    assert.equal(afterModelAttempt('fallback', false), 'fail')
  } finally {
    globalThis.fetch = previousFetch
    ;(globalThis as { Deno?: unknown }).Deno = previousDeno
  }
})

test('the job row stores the model and a stale job is failed instead of restarted', () => {
  assert.equal(EDGE_WALL_CLOCK_MS, 150_000)
  assert.equal(STEP_ANALYSIS_TTFT_MS < STEP_ANALYSIS_CAP_MS, true)
  assert.equal(STEP_ANALYSIS_CAP_MS < STEP_ANALYSIS_STALE_MS, true)
  assert.equal(STEP_ANALYSIS_STALE_MS < EDGE_WALL_CLOCK_MS, true)
  assert.equal(STEP_SCORES_TTFT_MS, 30_000)
  assert.equal(STEP_NARRATIVE_TTFT_MS, 30_000)
  assert.equal(STEP_SCORES_TTFT_MS < STEP_SCORES_CAP_MS, true)
  assert.equal(STEP_SCORES_CAP_MS < STEP_SCORES_STALE_MS, true)
  assert.equal(STEP_SCORES_STALE_MS < EDGE_WALL_CLOCK_MS, true)
  assert.equal(STEP_NARRATIVE_TTFT_MS < STEP_NARRATIVE_CAP_MS, true)
  assert.equal(STEP_NARRATIVE_CAP_MS < STEP_NARRATIVE_STALE_MS, true)
  assert.equal(STEP_NARRATIVE_STALE_MS < EDGE_WALL_CLOCK_MS, true)
  assert.equal(STEP_NARRATIVE_CAP_MS < STEP_SCORES_CAP_MS, true)
  assert.equal(STEP_EXTRACT_BUDGET_MS < STEP_EXTRACT_STALE_MS, true)
  assert.equal(STEP_EXTRACT_STALE_MS < EDGE_WALL_CLOCK_MS, true)
  assert.equal(STEP_COMPOSE_REPAIR_MS < STEP_COMPOSE_BUDGET_MS, true)
  assert.equal(STEP_COMPOSE_BUDGET_MS < STEP_COMPOSE_STALE_MS, true)
  assert.equal(STEP_COMPOSE_STALE_MS < EDGE_WALL_CLOCK_MS, true)
  assert.equal(STEP_HANDOFF_STALE_MS < EDGE_WALL_CLOCK_MS, true)
  assert.equal(STEP_ANALYSIS_CAP_MS + FALLBACK_MS > EDGE_WALL_CLOCK_MS, true)
  assert.equal(JOB_STALE_MS, STEP_ANALYSIS_STALE_MS)
  const steps = Object.values(DD_PROGRESS)
  for (let index = 1; index < steps.length; index += 1) {
    assert.equal(steps[index] > steps[index - 1], true)
  }
  const now = Date.parse('2026-09-29T12:00:00.000Z')
  const fresh = new Date(now - 1_000).toISOString()
  const old = new Date(now - JOB_STALE_MS - 1_000).toISOString()
  const ago = (ms: number) => new Date(now - ms).toISOString()
  assert.equal(shouldFailStaleJob({ status: 'checking', updatedAt: fresh, createdAt: fresh, nowMs: now }), false)
  assert.equal(shouldFailStaleJob({ status: 'checking', updatedAt: old, createdAt: fresh, nowMs: now }), true)
  assert.equal(shouldFailStaleJob({ status: 'writing', updatedAt: fresh, createdAt: old, nowMs: now }), false)
  assert.equal(shouldFailStaleJob({ status: 'queued', updatedAt: old, createdAt: old, nowMs: now }), true)
  assert.equal(shouldFailStaleJob({ status: 'ready', updatedAt: old, createdAt: old, nowMs: now }), false)
  assert.equal(shouldFailStaleJob({ status: 'failed', updatedAt: old, createdAt: old, nowMs: now }), false)
  assert.equal(
    shouldFailStaleJob({ status: 'checking', updatedAt: ago(STEP_SCORES_STALE_MS - 1_000), createdAt: ago(500_000), nowMs: now, pipelineStep: 'scores', stepClaim: 'claim-1' }),
    false,
  )
  assert.equal(
    shouldFailStaleJob({ status: 'checking', updatedAt: ago(STEP_SCORES_STALE_MS + 1_000), createdAt: ago(1_000), nowMs: now, pipelineStep: 'scores', stepClaim: 'claim-1' }),
    true,
  )
  assert.equal(
    shouldFailStaleJob({ status: 'checking', updatedAt: ago(STEP_NARRATIVE_STALE_MS - 1_000), createdAt: ago(400_000), nowMs: now, pipelineStep: 'narrative', stepClaim: 'claim-1' }),
    false,
  )
  assert.equal(
    shouldFailStaleJob({ status: 'checking', updatedAt: ago(STEP_NARRATIVE_STALE_MS + 1_000), createdAt: ago(1_000), nowMs: now, pipelineStep: 'narrative', stepClaim: 'claim-1' }),
    true,
  )
  assert.equal(
    shouldFailStaleJob({ status: 'reading', updatedAt: ago(69_000), createdAt: ago(1_000), nowMs: now, pipelineStep: 'extract', stepClaim: 'claim-1' }),
    false,
  )
  assert.equal(
    shouldFailStaleJob({ status: 'reading', updatedAt: ago(71_000), createdAt: ago(400_000), nowMs: now, pipelineStep: 'extract', stepClaim: 'claim-1' }),
    true,
  )
  assert.equal(
    shouldFailStaleJob({ status: 'checking', updatedAt: ago(89_000), createdAt: ago(1_000), nowMs: now, pipelineStep: 'narrative', stepClaim: null }),
    false,
  )
  assert.equal(
    shouldFailStaleJob({ status: 'checking', updatedAt: ago(91_000), createdAt: ago(1_000), nowMs: now, pipelineStep: 'narrative', stepClaim: null }),
    true,
  )
  assert.equal(claimAllowed({ status: 'checking', pipelineStep: 'scores', stepClaim: null }), true)
  assert.equal(claimAllowed({ status: 'checking', pipelineStep: 'scores', stepClaim: 'claim-1' }), false)
  assert.equal(claimAllowed({ status: 'ready', pipelineStep: 'compose', stepClaim: null }), false)
  assert.equal(afterModelAttempt('primary', true), 'advance')
  assert.equal(stageLabel('checking', DD_PROGRESS.model), 'Asking the model')
  assert.equal(stageLabel('checking', DD_PROGRESS.narrative), 'Writing the memo')
  assert.equal(stageLabel('checking', DD_PROGRESS.model, true), 'Trying the backup model')
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
  assert.match(run, /step_claim/)
  assert.match(run, /pipeline_step/)
  assert.match(run, /due-diligence-step/)
  assert.match(run, /BA_DD_STEP_SECRET/)
  assert.match(run, /x-dd-step/)
  assert.equal(run.includes('Authorization'), false)
  const stepFn = readFileSync(path.join(root, 'supabase/functions/due-diligence-step/index.ts'), 'utf8')
  assert.match(stepFn, /BA_DD_STEP_SECRET/)
  assert.match(stepFn, /x-dd-step/)
  assert.equal(stepFn.includes('require_user'), false)
  const toml = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
  assert.match(toml, /\[functions\.due-diligence-step\]\s+verify_jwt = false/)
  assert.match(status, /pipeline_step/)
  assert.match(status, /step_claim/)
  const pipeline = readFileSync(path.join(root, 'supabase/migrations/20261025120000_due_diligence_pipeline.sql'), 'utf8')
  assert.match(pipeline, /pipeline_step/)
  assert.match(pipeline, /step_claim/)
  assert.match(pipeline, /Not applied by the authoring agent/)
  assert.equal(pipeline.includes('\u2014'), false)
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

test('a slow primary fails over and the fallback finishes inside the budget', async () => {
  const stages: string[] = []
  const models: string[] = []
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
  let calls = 0
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    calls += 1
    const init = args[1]
    if (calls === 1) {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) {
          reject(new Error('missing signal'))
          return
        }
        const abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      })
    }
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fullDraftAnalysis()) } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }) as typeof fetch
  const started = Date.now()
  try {
    const result = await analyzeDeckText(`Page 1\n${FIXTURE_DECK}`, {
      ttftMs: 40,
      onStage: async (stage, modelId) => {
        stages.push(stage)
        models.push(modelId)
      },
    })
    const elapsed = Date.now() - started
    assert.deepEqual(stages, ['model'])
    assert.equal(models[0], 'unit-model-id')
    assert.equal(result.modelRan, false)
    assert.equal(result.modelId, 'unit-model-id')
    assert.match(result.skipReason || '', /ttft/)
    assert.equal(afterModelAttempt('primary', false), 'fallback')
    assert.ok(elapsed < 2_000)
    assert.ok(elapsed < STEP_ANALYSIS_CAP_MS)
  } finally {
    globalThis.fetch = previousFetch
    ;(globalThis as { Deno?: unknown }).Deno = previousDeno
  }
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
    assert.equal(expired.modelId, 'unit-model-id')

    const result = await analyzeDeckText(`Page 1\n${FIXTURE_DECK}`, {
      callTimeoutMs: 30,
      onStage: async (stage) => {
        stages.push(stage)
      },
    })
    assert.deepEqual(stages, ['model'])
    assert.equal(result.modelRan, false)
    assert.equal(result.modelId, 'unit-model-id')
    assert.match(result.skipReason || '', /primary_timeout/)
    assert.equal((result.skipReason || '').includes('fallback_timeout'), false)
    const fields = modelJobFields({ modelId: result.modelId, skipReason: result.skipReason })
    assert.equal(fields.model_id, 'unit-model-id')
    assert.notEqual(fields.model_id, null)
    assert.match(fields.model_skip_reason || '', /timeout/)
    assert.equal(isTerminalModelFailure(result.skipReason, result.modelRan), true)
  } finally {
    globalThis.fetch = previousFetch
    ;(globalThis as { Deno?: unknown }).Deno = previousDeno
  }
})

test('posture follows scores and red flags, and a missing hero is repaired', async () => {
  assert.equal(
    derivePosture({ posture: 'pass', overall: 1, risks: [{ severity: 'high' }], claims: [{ status: 'contradicted' }] }),
    'evidence_required',
  )
  assert.equal(
    derivePosture({ posture: 'pass', overall: 2, risks: [], claims: [] }),
    'evidence_required',
  )
  assert.equal(
    derivePosture({ posture: 'pass', overall: 4, risks: [{ severity: 'low' }], claims: [{ status: 'supported_in_deck' }] }),
    'pass',
  )
  assert.equal(
    derivePosture({ posture: '', overall: 4, risks: [], claims: [] }),
    'evidence_required',
  )
  const forced = parseDeckAnalysis({
    ...fullDraftRaw(),
    snapshot: { ...(fullDraftRaw().snapshot as object), posture: 'pass' },
    scores: { ...(fullDraftRaw().scores as object), overall: 1 },
  })
  assert.equal(forced?.hero.posture, 'evidence_required')
  assert.equal(forced?.snapshot.posture, 'evidence_required')
  assert.equal(forced?.hero.overall, 1)
  assert.notEqual(forced?.hero, null)
  const open = parseDeckAnalysis({
    hero: {
      company: 'Northwind Freight',
      one_liner: 'A shipped warehouse lane for example.com customers.',
      posture: 'pass',
      overall: 4,
      pre_money: 8000000,
      post_money: 10000000,
      currency: 'USD',
    },
    ...fullDraftRaw(),
    snapshot: {
      ...(fullDraftRaw().snapshot as object),
      posture: 'pass',
      one_liner: 'A shipped warehouse lane for example.com customers.',
    },
    scores: {
      ...(fullDraftRaw().scores as object),
      overall: 4,
      traction_evidence: 4,
      valuation_fit: 4,
    },
    claims: [{ claim: 'Northwind Freight serves 40 warehouses.', page: '2', status: 'supported_in_deck', note: 'Deck-stated.' }],
    risks: [{ title: 'Thin insurance note', severity: 'low', why: 'The deck names a carrier in one line.', evidence_that_would_retire_it: 'The policy number.' }],
  })
  assert.equal(open?.hero.posture, 'pass')
  assert.equal(rawHasHero({ hero: { company: 'Northwind Freight' } }), true)
  assert.equal(rawHasHero(fullDraftRaw()), false)

  const kept = fitNumberedDeck(`${'Page 1\nOpening table stays in the prompt.\n'.repeat(30)}Page 4\nOps page threshold table stays in the prompt.`, 400)
  assert.match(kept, /Page 1/)
  assert.match(kept, /Page 4/)
  assert.match(kept, /Later pages follow/)

  const calls: string[] = []
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
  const withHero = JSON.stringify(open)
  globalThis.fetch = (async () => {
    calls.push('call')
    const content = calls.length === 1 ? JSON.stringify(fullDraftRaw()) : withHero
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const repaired = await analyzeDeckText(`Page 1\n${FIXTURE_DECK}`)
    assert.equal(calls.length, 2)
    assert.equal(repaired.analysis?.hero.posture, 'pass')
    assert.match(repaired.skipReason || '', /repaired/)
  } finally {
    globalThis.fetch = previousFetch
    ;(globalThis as { Deno?: unknown }).Deno = previousDeno
  }
  assert.equal(PRIMARY_CALL_MS, PRIMARY_CAP_MS)
  assert.equal(compareRange(15, 10, 20, 'kg', 'kg'), 'inside')
  assert.equal(compareRange(25, 10, 20, 'kg', 'kg'), 'outside')
  assert.equal(compareRange(10, 10, 20, 'kg', 'kg'), 'boundary')
  assert.equal(compareRange(20, 10, 20, 'kg', 'kg'), 'boundary')
  assert.equal(compareRange(25, 10, 20, 'g', 'kg'), 'unit_mismatch')
  assert.equal(findRangeBreaches('The gauge reads 15 kg, which is inside the 10 to 20 kg band.').length, 0)
  assert.equal(findRangeBreaches('The gauge reads 10 kg, which is inside the 10 to 20 kg band.').length, 0)
  assert.equal(findRangeBreaches('The gauge reads 20 kg, which is inside the 10 to 20 kg band.').length, 0)
  assert.equal(findRangeBreaches('The gauge reads 25 g, which is inside the 10 to 20 kg band.').length, 0)
  assert.equal(findRangeBreaches('Overall is 2 of 5. Traction is 3 of 5.').length, 0)
  const outside = findRangeBreaches('The gauge reads 25 kg, which is inside the 10 to 20 kg band.')
  assert.equal(outside.length, 1)
  assert.equal(outside[0]?.value, 25)
  assert.equal(findRangeBreaches('The gauge reads 25 kg inside the 10-20 kg band.').length, 1)
  assert.equal(findRangeBreaches('The gauge reads 25 kg. The operating band is between 10 and 20 kg.').length, 1)
  const ranged = parseDeckAnalysis({
    ...fullDraftRaw(),
    hero: { company: 'Example Carrier', one_liner: 'A lane.', posture: 'pass', overall: 1, pre_money: null, post_money: null, currency: 'USD' },
    snapshot: {
      ...(fullDraftRaw().snapshot as object),
      posture: 'pass',
      one_liner: 'A shipped lane for example.com customers.',
    },
    scores: { ...(fullDraftRaw().scores as object), overall: 4 },
    risks: [{ title: 'Thin note', severity: 'low', why: 'One line names a carrier.', evidence_that_would_retire_it: 'The policy number.' }],
    claims: [{ claim: 'Example Carrier serves 40 sites.', page: '2', status: 'supported_in_deck', note: 'Deck-stated.' }],
    memo_markdown: 'The gauge reads 25 kg, which is inside the 10 to 20 kg band.',
  })
  assert.equal(ranged?.scores.overall, 4)
  assert.equal(ranged?.hero.overall, 4)
  assert.equal(ranged?.hero.posture, 'evidence_required')
  assert.match(ranged?.memo_markdown || '', /outside/)
  assert.equal((ranged?.memo_markdown || '').includes('inside'), false)
  assert.equal(ranged?.risks.some((risk) => risk.severity === 'high'), true)
  assert.equal(ranged?.claims.some((claim) => claim.status === 'contradicted'), true)
  const clean = parseDeckAnalysis({
    ...fullDraftRaw(),
    hero: { company: 'Example Carrier', one_liner: 'A lane.', posture: 'evidence_required', overall: 1, pre_money: null, post_money: null, currency: 'USD' },
    snapshot: {
      ...(fullDraftRaw().snapshot as object),
      posture: 'pass',
      one_liner: 'A shipped lane for example.com customers.',
      posture_reason: 'The first step is proved.',
    },
    scores: {
      story_clarity: 4,
      unit_economics: 4,
      model_integrity: 4,
      traction_evidence: 4,
      team_and_governance: 4,
      regulatory_and_operations: 4,
      market_and_competition: 4,
      use_of_funds: 4,
      valuation_fit: 4,
      overall: 4,
    },
    risks: [{ title: 'Thin note', severity: 'low', why: 'One line names a carrier.', evidence_that_would_retire_it: 'The policy number.' }],
    claims: [{ claim: 'Example Carrier serves 40 sites.', page: '2', status: 'supported_in_deck', note: 'Deck-stated.' }],
    memo_markdown: 'Verdict: the first step is proved and the price can be discussed.',
  })
  assert.equal(clean?.scores.overall, 4)
  assert.ok((clean?.scores.overall || 0) > 2)
  assert.equal(clean?.hero.overall, 4)
  assert.equal(clean?.hero.posture, 'pass')
  assert.equal(clean?.snapshot.posture, 'pass')
  assert.equal(clean?.posture, clean?.hero.posture)
  assert.equal(classifyFallback('primary_ttft').reason, 'ttft')
  assert.equal(classifyFallback('primary_timeout').reason, 'timeout')
  assert.equal(classifyFallback('fallback_deadline').reason, 'timeout')
  assert.deepEqual(classifyFallback('primary_http_503'), { reason: 'http', httpStatus: 503 })
  assert.equal(classifyFallback('unusable').reason, 'parse')
  assert.equal(classifyFallback('validation').reason, 'validation')
  assert.equal(
    formatStepLog({
      extract: { model_id: 'unit-model-id', called: false, pass: 'none', fallback_reason: null, http_status: null, elapsed_ms: 1200, primary_elapsed_ms: null },
      scores: { model_id: 'unit-model-id', called: true, pass: 'fallback', fallback_reason: 'ttft', http_status: null, elapsed_ms: 40000, primary_elapsed_ms: 130000 },
      narrative: { model_id: 'unit-model-id', called: true, pass: 'primary', fallback_reason: null, http_status: null, elapsed_ms: 22000, primary_elapsed_ms: null },
    }),
    'e:none:1200.s:fb:ttft:40000.n:primary:22000',
  )
  const longDeck = [
    'Page 1\nOpening page for the example lane.',
    'Page 2\nA cited operating note with no band.',
    'Page 3\nFiller page.\n'.repeat(40),
    'Page 4\nThe gauge reads 25 kg, which is inside the 10 to 20 kg band.',
    'Page 5\nClosing page.',
  ].join('\n\n')
  const excerpt = narrativeDeckExcerpt(longDeck, { claims: [{ page: '2', claim: 'A cited note.' }] }, 2_000)
  assert.match(excerpt, /Page 1/)
  assert.match(excerpt, /Page 2/)
  assert.match(excerpt, /Page 4/)
  assert.equal(excerpt.includes('Filler page'), false)
  assert.ok(excerpt.length < longDeck.length)
  const merged = parseDeckAnalysis(
    mergeSectionDrafts(
      { ...(clean || {}), scores: { ...(clean?.scores || {}), overall: 4 } },
      { scores: { overall: 1 }, memo_markdown: 'Verdict: the first step is proved.', snapshot: { posture: 'pass' } },
    ),
  )
  assert.equal(merged?.scores.overall, 4)
  assert.equal(merged?.hero.overall, 4)
  const llm = readFileSync(path.join(root, 'supabase/functions/due-diligence-start/llm.ts'), 'utf8')
  assert.match(llm, /PRIMARY_CAP_MS/)
  assert.match(llm, /TtftError/)
  assert.match(llm, /stream: true/)
  assert.match(llm, /narrativeDeckExcerpt/)
  assert.match(llm, /reasoning_effort/)
})

test('a reasoning chunk counts as life and a rejected effort is retried once', async () => {
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
  const encoder = new TextEncoder()
  try {
    globalThis.fetch = (async () => {
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"working"}}]}\n\n'))
          await new Promise((resolve) => setTimeout(resolve, 90))
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"{}"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }) as typeof fetch
    const lived = await analyzeDeckSection({
      system: 'Return JSON.',
      user: 'Page 1\nExample lane.',
      mode: 'primary',
      ttftMs: 40,
      reasoningEffort: PRIMARY_REASONING_EFFORT,
    })
    assert.equal(lived.ok, true)
    assert.equal(lived.content, '{}')
    assert.equal(lived.reasoningEffort, 'low')
    assert.ok((lived.firstChunkMs ?? 999) < 70)
    assert.ok((lived.firstContentMs ?? 0) >= 70)

    const bodies: { reasoning_effort?: string; model?: string }[] = []
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { reasoning_effort?: string; model?: string }
      bodies.push(body)
      if (bodies.length === 1) return new Response('no', { status: 400 })
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
    const retried = await analyzeDeckSection({
      system: 'Return JSON.',
      user: 'Page 1\nExample lane.',
      mode: 'primary',
      reasoningEffort: PRIMARY_REASONING_EFFORT,
    })
    assert.equal(bodies.length, 2)
    assert.equal(bodies[0]?.reasoning_effort, 'low')
    assert.equal(bodies[1]?.reasoning_effort, undefined)
    assert.equal(bodies[0]?.model, 'unit-model-id')
    assert.equal(bodies[1]?.model, 'unit-model-id')
    assert.equal(retried.ok, true)
    assert.equal(retried.reasoningEffort, null)
    assert.equal(retried.modelId, 'unit-model-id')
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

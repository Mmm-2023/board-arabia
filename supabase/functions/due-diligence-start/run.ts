import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { fitNumberedDeck, mergeSectionDrafts, narrativeDeckExcerpt, numberDeckPages, parseDeckAnalysis, parseModelJson, type DeckAnalysis } from '../_shared/deck_analysis.ts'
import {
  afterModelAttempt,
  analysisStatusFor,
  applyAnalysisFacts,
  assessmentLog,
  buildReport,
  claimAllowed,
  classifyFallback,
  DECK_BUCKET,
  DECK_MAX_BYTES,
  DD_PROGRESS,
  DEGRADED_NOTE_MODEL,
  DEGRADED_NOTE_MODEL_FALLBACK,
  DEGRADED_NOTE_MODEL_PARTIAL,
  DEGRADED_NOTE_SEARCH,
  DEGRADED_NOTE_SEARCH_FAILED,
  extractCompanyUrl,
  extractDeckFacts,
  independentSearchTerms,
  isTerminalModelFailure,
  MEMBER_MESSAGES,
  formatStepLog,
  modelJobFields,
  nextPipelineStep,
  packReportDisclaimer,
  parsePublicHttpsUrl,
  progressForStep,
  sniffDeck,
  statusForStep,
  STEP_COMPOSE_BUDGET_MS,
  STEP_EXTRACT_BUDGET_MS,
  STEP_NARRATIVE_CAP_MS,
  STEP_NARRATIVE_TTFT_MS,
  STEP_SCORES_CAP_MS,
  STEP_SCORES_TTFT_MS,
  type DeckExt,
  type FallbackReason,
  type ModelPass,
  type StepTiming,
} from '../_shared/due_diligence.ts'
import { readDeckSource } from './extract.ts'
import { analyzeDeckSection, narrativeUser, plannedModelId, PRIMARY_REASONING_EFFORT, scoresUser } from './llm.ts'
import { REPAIR_PROMPT } from './prompts/repair_prompt.ts'
import { SCHEMA_PROMPT } from './prompts/schema_prompt.ts'
import { SYSTEM_PROMPT } from './prompts/system_prompt.ts'
import { retrievePublicPages } from './sources.ts'

const ACTIVE = ['queued', 'reading', 'checking', 'writing']

type PipelineState = {
  deck_text: string
  file_name: string
  company_url: string | null
  scores_mode: ModelPass
  narrative_mode: ModelPass
  compose_mode: ModelPass
  scores_json: unknown
  narrative_json: unknown
  scores_ran: boolean
  narrative_ran: boolean
  used_fallback: boolean
  models: Record<string, string>
  steps: Record<string, StepTiming>
}

type HeldJob = {
  id: string
  deck_id: string
  member_id: string
  claimId: string
}

export async function runDueDiligenceStep(admin: SupabaseClient, jobId: string): Promise<void> {
  const loaded = await admin
    .from('due_diligence_jobs')
    .select('id, deck_id, member_id, status, progress, pipeline_step, step_claim, pipeline, model_id')
    .eq('id', jobId)
    .maybeSingle()
  if (loaded.error || !loaded.data) return
  const row = loaded.data as {
    id: string
    deck_id: string
    member_id: string
    status: string
    pipeline_step: string | null
    step_claim: string | null
    pipeline: unknown
    progress: number
  }
  const step = row.pipeline_step || 'extract'
  if (!claimAllowed({ status: row.status, pipelineStep: step, stepClaim: row.step_claim })) return
  const pipeline = readPipeline(row.pipeline)
  const claimId = globalThis.crypto.randomUUID()
  const modelId = knownModel(pipeline, step)
  const claimed = await admin
    .from('due_diligence_jobs')
    .update({
      step_claim: claimId,
      status: statusForStep(step),
      progress: Math.max(Number(row.progress) || 0, progressForStep(step)),
      error: null,
      model_id: modelId,
      pipeline: packPipeline(pipeline),
    })
    .eq('id', jobId)
    .eq('pipeline_step', step)
    .is('step_claim', null)
    .in('status', ACTIVE)
    .select('id')
    .maybeSingle()
  if (claimed.error || !claimed.data) return
  const held: HeldJob = { id: row.id, deck_id: row.deck_id, member_id: row.member_id, claimId }
  try {
    if (step === 'extract') await runExtract(admin, held, pipeline)
    else if (step === 'scores') await runAnalysis(admin, held, pipeline, 'scores')
    else if (step === 'narrative') await runAnalysis(admin, held, pipeline, 'narrative')
    else if (step === 'compose') await runCompose(admin, held, pipeline)
  } catch (err) {
    const reason = err instanceof Error && 'skipReason' in err ? String((err as { skipReason?: string }).skipReason || '') : ''
    const model = err instanceof Error && 'modelId' in err ? String((err as { modelId?: string }).modelId || '') : modelId
    await failHeld(admin, held, model || modelId, reason || 'job_failed', err, pipeline)
  }
}

export async function triggerDueDiligenceStep(jobId: string): Promise<boolean> {
  const supabaseUrl = edgeSetting('SUPABASE_URL').replace(/\/$/, '')
  const stepSecret = edgeSetting('BA_DD_STEP_SECRET')
  const anonKey = edgeSetting('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !stepSecret) {
    console.log(JSON.stringify({ event: 'dd_step_trigger', job_id: jobId, ok: false, status: 0 }))
    return false
  }
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/due-diligence-step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dd-step': stepSecret,
        ...(anonKey ? { apikey: anonKey } : {}),
      },
      body: JSON.stringify({ job_id: jobId }),
      signal: AbortSignal.timeout(8_000),
    })
    console.log(JSON.stringify({ event: 'dd_step_trigger', job_id: jobId, ok: response.ok, status: response.status }))
    return response.ok
  } catch {
    console.log(JSON.stringify({ event: 'dd_step_trigger', job_id: jobId, ok: false, status: 0 }))
    return false
  }
}

export function deferJob(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else void work
}

async function runExtract(admin: SupabaseClient, job: HeldJob, pipeline: PipelineState) {
  const started = Date.now()
  const deadlineAt = started + STEP_EXTRACT_BUDGET_MS
  const deck = await admin
    .from('due_diligence_decks')
    .select('storage_path, company_url, file_name, mime_type')
    .eq('id', job.deck_id)
    .eq('member_id', job.member_id)
    .maybeSingle()
  if (deck.error || !deck.data) throw failError(MEMBER_MESSAGES.finish, pipeline)
  const ext = extensionFor(deck.data.storage_path, deck.data.mime_type)
  const bytes = await downloadDeck(admin, deck.data.storage_path)
  if (sniffDeck(bytes) !== ext) throw failError(MEMBER_MESSAGES.notDeck, pipeline)
  const source = await readDeckSource(bytes, ext)
  if (Date.now() >= deadlineAt) throw failError(MEMBER_MESSAGES.timedOut, pipeline)
  await touch(admin, job, DD_PROGRESS.pages, knownModel(pipeline, 'extract'))
  const numbered = fitNumberedDeck(numberDeckPages(source.pages))
  const storedUrl = typeof deck.data.company_url === 'string' ? deck.data.company_url.trim() : ''
  let companyUrl: string | null = storedUrl || null
  if (!companyUrl) {
    const extracted = extractCompanyUrl(source.text)
    if (extracted && parsePublicHttpsUrl(extracted).ok) {
      companyUrl = extracted
      await admin.from('due_diligence_decks').update({ company_url: extracted }).eq('id', job.deck_id).eq('member_id', job.member_id)
    }
  }
  pipeline.deck_text = numbered
  pipeline.file_name = String(deck.data.file_name || '')
  pipeline.company_url = companyUrl
  // Local read only. No model call, so the step record stays called: false and pass: none.
  noteStep(pipeline, 'extract', {
    modelId: knownModel(pipeline, 'extract'),
    called: false,
    pass: 'none',
    elapsedMs: Date.now() - started,
    reason: null,
  })
  await advance(admin, job, pipeline, 'extract', DD_PROGRESS.model)
}

async function runAnalysis(
  admin: SupabaseClient,
  job: HeldJob,
  pipeline: PipelineState,
  step: 'scores' | 'narrative',
) {
  const started = Date.now()
  const mode = step === 'scores' ? pipeline.scores_mode : pipeline.narrative_mode
  const cap = step === 'scores' ? STEP_SCORES_CAP_MS : STEP_NARRATIVE_CAP_MS
  const ttft = step === 'scores' ? STEP_SCORES_TTFT_MS : STEP_NARRATIVE_TTFT_MS
  const deadlineAt = started + cap
  const floor = progressForStep(step)
  const ceiling = step === 'scores' ? DD_PROGRESS.narrative - 1 : DD_PROGRESS.fallback - 1
  let lastBeat = 0
  const heuristic = extractDeckFacts(pipeline.deck_text, pipeline.file_name)
  const call = await analyzeDeckSection({
    system: SYSTEM_PROMPT,
    user:
      step === 'scores'
        ? scoresUser(pipeline.deck_text, heuristic.company, heuristic.ask)
        : narrativeUser(pipeline.deck_text, pipeline.scores_json),
    mode,
    deadlineAt,
    callTimeoutMs: cap,
    ttftMs: ttft,
    reasoningEffort: mode === 'primary' ? PRIMARY_REASONING_EFFORT : null,
    onStage: async (_stage, called) => {
      pipeline.models[step] = called
      await touch(admin, job, floor, called)
    },
    onTick: async (elapsed, called) => {
      const now = Date.now()
      if (now - lastBeat < 4_000) return
      lastBeat = now
      const span = Math.max(1, ceiling - floor)
      const moved = Math.min(span, Math.max(1, Math.round((elapsed / cap) * span)))
      await touch(admin, job, floor + moved, called)
    },
  })
  pipeline.models[step] = call.modelId
  const elapsedMs = Date.now() - started
  if (!call.ok) {
    const bare = (call.reason || '').replace(/^(primary|fallback)_/, '')
    if (bare === 'missing_api_key' || bare === 'missing_model') delete pipeline.models[step]
    await settleModelMiss(admin, job, pipeline, step, mode, call.reason, elapsedMs, call)
    return
  }
  const parsed = parseModelJson(call.content)
  if (!parsed || typeof parsed !== 'object') {
    await settleModelMiss(admin, job, pipeline, step, mode, 'unusable', elapsedMs, call)
    return
  }
  if (step === 'scores') {
    pipeline.scores_json = parsed
    pipeline.scores_ran = true
  } else {
    pipeline.narrative_json = parsed
    pipeline.narrative_ran = true
  }
  if (mode === 'fallback') pipeline.used_fallback = true
  noteStep(pipeline, step, {
    modelId: call.modelId,
    called: true,
    pass: mode,
    elapsedMs,
    reason: null,
    firstChunkMs: call.firstChunkMs,
    firstContentMs: call.firstContentMs,
    reasoningEffort: call.reasoningEffort,
  })
  const next = nextPipelineStep(step)
  await advance(admin, job, pipeline, step, next ? progressForStep(next) : DD_PROGRESS.repair)
}

async function settleModelMiss(
  admin: SupabaseClient,
  job: HeldJob,
  pipeline: PipelineState,
  step: 'scores' | 'narrative',
  mode: ModelPass,
  reason: string | null,
  elapsedMs: number,
  call?: { firstChunkMs: number | null; firstContentMs: number | null; reasoningEffort: string | null },
) {
  const bare = (reason || '').replace(/^(primary|fallback)_/, '') || 'model_request_failed'
  noteStep(pipeline, step, {
    modelId: pipeline.models[step] || knownModel(pipeline, step),
    called: true,
    pass: mode,
    elapsedMs,
    reason: bare,
    firstChunkMs: call?.firstChunkMs ?? null,
    firstContentMs: call?.firstContentMs ?? null,
    reasoningEffort: call?.reasoningEffort ?? null,
  })
  if (!isTerminalModelFailure(bare, false)) {
    await advance(admin, job, pipeline, step, progressForStep(nextPipelineStep(step) || 'compose'))
    return
  }
  if (afterModelAttempt(mode, false) === 'fallback') {
    if (step === 'scores') pipeline.scores_mode = 'fallback'
    else pipeline.narrative_mode = 'fallback'
    pipeline.used_fallback = true
    await releaseForFallback(admin, job, pipeline, step, `${step}_${bare}`)
    return
  }
  const error = failError(bare.includes('timeout') || bare.includes('ttft') || bare.includes('deadline') ? MEMBER_MESSAGES.timedOut : MEMBER_MESSAGES.finish, pipeline)
  ;(error as { skipReason?: string; modelId?: string }).skipReason = `${step}_${bare}`
  ;(error as { modelId?: string }).modelId = pipeline.models[step] || knownModel(pipeline, step)
  throw error
}

async function runCompose(admin: SupabaseClient, job: HeldJob, pipeline: PipelineState) {
  const started = Date.now()
  const deadlineAt = started + STEP_COMPOSE_BUDGET_MS
  let analysis = parseDeckAnalysis(mergeSectionDrafts(pipeline.scores_json, pipeline.narrative_json))
  const locked = analysis?.scores.overall ?? null
  const needsRepair =
    !analysis || analysis.sections_missing.includes('memo_markdown') || analysis.sections_missing.includes('scores')
  let called = false
  let pass: ModelPass | 'none' = 'none'
  let miss: string | null = needsRepair ? 'validation' : null
  if (needsRepair && Date.now() < deadlineAt) {
    const mode = pipeline.compose_mode
    called = true
    pass = mode
    const repair = await analyzeDeckSection({
      system: REPAIR_PROMPT,
      user: `${SCHEMA_PROMPT}\n\nDeck text:\n${narrativeDeckExcerpt(pipeline.deck_text, pipeline.scores_json)}\n\nPrevious reply:\n${JSON.stringify(mergeSectionDrafts(pipeline.scores_json, pipeline.narrative_json)).slice(0, 8_000)}`,
      mode,
      repair: true,
      deadlineAt,
      onStage: async (_stage, calledModel) => {
        pipeline.models.compose = calledModel
        await touch(admin, job, DD_PROGRESS.repair, calledModel)
      },
    })
    pipeline.models.compose = repair.modelId
    if (!repair.ok) {
      const bare = (repair.reason || '').replace(/^(primary|fallback)_/, '')
      miss = bare
      noteStep(pipeline, 'compose', {
        modelId: repair.modelId,
        called: true,
        pass: mode,
        elapsedMs: Date.now() - started,
        reason: bare,
      })
      if (isTerminalModelFailure(bare, false) && afterModelAttempt(mode, false) === 'fallback') {
        pipeline.compose_mode = 'fallback'
        pipeline.used_fallback = true
        await releaseForFallback(admin, job, pipeline, 'compose', `compose_${bare}`)
        return
      }
    } else {
      const repaired = parseDeckAnalysis(parseModelJson(repair.content))
      if (repaired) {
        analysis = lockOverall(repaired, locked)
        miss = null
      } else {
        miss = 'unusable'
      }
    }
  }
  if (analysis && locked != null) analysis = lockOverall(analysis, locked)
  if (Date.now() >= deadlineAt && !analysis && (pipeline.scores_ran || pipeline.narrative_ran)) {
    throw failError(MEMBER_MESSAGES.timedOut, pipeline)
  }
  noteStep(pipeline, 'compose', {
    modelId: pipeline.models.compose || knownModel(pipeline, 'narrative'),
    called,
    pass,
    elapsedMs: Date.now() - started,
    reason: miss,
  })
  await finishReport(admin, job, pipeline, analysis)
}

function lockOverall(analysis: DeckAnalysis, overall: number | null): DeckAnalysis {
  if (overall == null) return analysis
  return parseDeckAnalysis({ ...analysis, scores: { ...analysis.scores, overall } }) || analysis
}

async function finishReport(
  admin: SupabaseClient,
  job: HeldJob,
  pipeline: PipelineState,
  analysis: DeckAnalysis | null,
) {
  await touch(admin, job, DD_PROGRESS.sources, knownModel(pipeline, 'compose'))
  const heuristic = applyAnalysisFacts(extractDeckFacts(pipeline.deck_text, pipeline.file_name), analysis)
  const retrieval = await retrievePublicPages({
    companyUrl: pipeline.company_url,
    searchTerms: independentSearchTerms(heuristic),
  })
  const modelRan = pipeline.scores_ran || pipeline.narrative_ran
  const degradedNotes: string[] = []
  if (!modelRan) degradedNotes.push(DEGRADED_NOTE_MODEL)
  else {
    if (pipeline.used_fallback) degradedNotes.push(DEGRADED_NOTE_MODEL_FALLBACK)
    if (analysis?.sections_missing.length) degradedNotes.push(DEGRADED_NOTE_MODEL_PARTIAL)
  }
  if (!retrieval.searchRan) degradedNotes.push(DEGRADED_NOTE_SEARCH)
  else if (retrieval.searchSkipReason) degradedNotes.push(DEGRADED_NOTE_SEARCH_FAILED)
  const report = buildReport(heuristic, retrieval.pages, { companyUrl: pipeline.company_url, degradedNotes })
  report.analysis = analysis
  const modelId = knownModel(pipeline, 'narrative')
  const fields = modelJobFields({ modelId, skipReason: stepReason(pipeline) })
  report.model_id = fields.model_id || modelId
  report.model_skip_reason = fields.model_skip_reason
  console.log(
    assessmentLog({
      jobId: job.id,
      modelRan,
      modelSkipReason: report.model_skip_reason,
      modelId: report.model_id,
      claimsReturned: analysis?.claims.length ?? 0,
      claimsKept: report.claims.length,
      sourcesFetched: retrieval.sourcesFetched,
      searchRan: retrieval.searchRan,
      searchSkipReason: retrieval.searchSkipReason,
    }),
  )
  const deckName = pipeline.file_name || 'deck.pdf'
  const inserted = await admin
    .from('due_diligence_reports')
    .insert({
      job_id: job.id,
      deck_id: job.deck_id,
      member_id: job.member_id,
      file_name: deckName,
      company_label: report.company_label,
      sector_label: report.sector_label,
      ask_label: report.ask_label,
      disclaimer: packReportDisclaimer(report.degraded_notes),
      publicly_consistent_pct: report.publicly_consistent_pct,
      not_publicly_verifiable_pct: report.not_publicly_verifiable_pct,
      claims: report.claims,
      sources: report.sources,
      next_steps: report.next_steps,
      analysis: report.analysis,
      analysis_status: analysisStatusFor(analysis),
      model_id: report.model_id,
      model_skip_reason: report.model_skip_reason,
    })
    .select('id')
    .maybeSingle()
  if (inserted.error || !inserted.data) {
    const existing = await admin.from('due_diligence_reports').select('id').eq('job_id', job.id).maybeSingle()
    if (existing.error || !existing.data) throw failError(MEMBER_MESSAGES.finish, pipeline)
  }
  const saved = await admin
    .from('due_diligence_jobs')
    .update({
      status: 'ready',
      progress: 100,
      error: null,
      pipeline_step: 'done',
      step_claim: null,
      pipeline: packPipeline(pipeline),
      ...modelJobFields({ modelId: report.model_id || modelId, skipReason: stepReason(pipeline) }),
    })
    .eq('id', job.id)
    .eq('step_claim', job.claimId)
    .select('id')
    .maybeSingle()
  if (saved.error || !saved.data) throw failError(MEMBER_MESSAGES.finish, pipeline)
}

async function advance(
  admin: SupabaseClient,
  job: HeldJob,
  pipeline: PipelineState,
  step: string,
  progress: number,
) {
  const next = nextPipelineStep(step)
  if (!next) return
  const modelId = knownModel(pipeline, step)
  const updated = await admin
    .from('due_diligence_jobs')
    .update({
      pipeline_step: next,
      step_claim: null,
      pipeline: packPipeline(pipeline),
      status: statusForStep(next),
      progress,
      error: null,
      ...modelJobFields({ modelId, skipReason: stepReason(pipeline) }),
    })
    .eq('id', job.id)
    .eq('step_claim', job.claimId)
    .select('id')
    .maybeSingle()
  if (updated.error || !updated.data) return
  if (next !== 'done') {
    const kicked = await triggerDueDiligenceStep(job.id)
    if (!kicked) deferJob(runDueDiligenceStep(admin, job.id))
  }
}

async function releaseForFallback(
  admin: SupabaseClient,
  job: HeldJob,
  pipeline: PipelineState,
  step: string,
  reason: string,
) {
  const modelId = knownModel(pipeline, step)
  const updated = await admin
    .from('due_diligence_jobs')
    .update({
      step_claim: null,
      pipeline: packPipeline(pipeline),
      status: statusForStep(step),
      ...modelJobFields({ modelId, skipReason: stepReason(pipeline, reason) }),
    })
    .eq('id', job.id)
    .eq('step_claim', job.claimId)
    .select('id')
    .maybeSingle()
  if (updated.error || !updated.data) return
  const kicked = await triggerDueDiligenceStep(job.id)
  if (!kicked) deferJob(runDueDiligenceStep(admin, job.id))
}

async function failHeld(
  admin: SupabaseClient,
  job: HeldJob,
  modelId: string,
  skip: string,
  err: unknown,
  pipeline: PipelineState,
) {
  const message = err instanceof Error ? err.message : ''
  const safe =
    message === MEMBER_MESSAGES.unreadable ||
    message === MEMBER_MESSAGES.scanned ||
    message === MEMBER_MESSAGES.notDeck ||
    message === MEMBER_MESSAGES.timedOut
      ? message
      : MEMBER_MESSAGES.finish
  console.log(
    assessmentLog({
      jobId: job.id,
      modelRan: pipeline.scores_ran || pipeline.narrative_ran,
      modelSkipReason: skip,
      modelId: modelId || knownModel(pipeline, 'scores'),
      claimsReturned: 0,
      claimsKept: 0,
      sourcesFetched: 0,
      searchRan: false,
      searchSkipReason: 'job_failed',
    }),
  )
  await admin
    .from('due_diligence_jobs')
    .update({
      status: 'failed',
      error: safe,
      step_claim: null,
      ...modelJobFields({ modelId: modelId || knownModel(pipeline, 'scores'), skipReason: skip }),
    })
    .eq('id', job.id)
    .eq('step_claim', job.claimId)
    .in('status', ACTIVE)
}

async function touch(admin: SupabaseClient, job: HeldJob, progress: number, modelId?: string) {
  const patch: { progress: number; model_id?: string } = { progress }
  if (modelId) patch.model_id = modelId
  await admin.from('due_diligence_jobs').update(patch).eq('id', job.id).eq('step_claim', job.claimId)
}

function failError(message: string, _pipeline: PipelineState): Error {
  const error = new Error(message)
  error.name = message === MEMBER_MESSAGES.timedOut ? 'JobDeadlineError' : 'ModelFailed'
  return error
}

function knownModel(pipeline: PipelineState, step: string): string {
  return pipeline.models[step] || pipeline.models.narrative || pipeline.models.scores || plannedModelId()
}

function stepReason(pipeline: PipelineState, extra = ''): string {
  const line = formatStepLog(pipeline.steps)
  if (!extra) return line
  return (line ? `${line}.${extra}` : extra).slice(0, 160)
}

function noteStep(
  pipeline: PipelineState,
  step: string,
  input: {
    modelId: string
    called: boolean
    pass: ModelPass | 'none'
    elapsedMs: number
    reason: string | null
    firstChunkMs?: number | null
    firstContentMs?: number | null
    reasoningEffort?: string | null
  },
) {
  const prev = pipeline.steps[step]
  const classified = input.reason ? classifyFallback(input.reason) : null
  const primaryMiss = input.pass === 'primary' && classified != null
  const reason: FallbackReason | null =
    input.pass === 'fallback' ? prev?.fallback_reason || classified?.reason || null : (classified?.reason ?? null)
  const keepPrimaryTimes = input.pass === 'fallback'
  pipeline.steps[step] = {
    model_id: input.modelId || prev?.model_id || '',
    called: input.called,
    pass: primaryMiss ? 'fallback' : input.pass,
    fallback_reason: reason,
    http_status:
      input.pass === 'fallback' ? (prev?.http_status ?? classified?.httpStatus ?? null) : (classified?.httpStatus ?? null),
    elapsed_ms: Math.max(0, Math.round(input.elapsedMs)),
    primary_elapsed_ms:
      input.pass === 'fallback' ? (prev?.primary_elapsed_ms ?? prev?.elapsed_ms ?? null) : primaryMiss ? Math.max(0, Math.round(input.elapsedMs)) : null,
    first_chunk_ms: keepPrimaryTimes && prev ? prev.first_chunk_ms : (input.firstChunkMs ?? null),
    first_content_ms: keepPrimaryTimes && prev ? prev.first_content_ms : (input.firstContentMs ?? null),
    reasoning_effort: input.reasoningEffort ?? prev?.reasoning_effort ?? null,
  }
}

function readPipeline(raw: unknown): PipelineState {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const modelsRaw = row.models && typeof row.models === 'object' && !Array.isArray(row.models) ? (row.models as Record<string, unknown>) : {}
  const models: Record<string, string> = {}
  for (const key of ['extract', 'scores', 'narrative', 'compose']) {
    const id = typeof modelsRaw[key] === 'string' ? modelsRaw[key].replace(/[^\w.-]+/g, '').slice(0, 80) : ''
    if (id) models[key] = id
  }
  const mode = (value: unknown): ModelPass => (value === 'fallback' ? 'fallback' : 'primary')
  return {
    deck_text: typeof row.deck_text === 'string' ? row.deck_text : '',
    file_name: typeof row.file_name === 'string' ? row.file_name : '',
    company_url: typeof row.company_url === 'string' ? row.company_url : null,
    scores_mode: mode(row.scores_mode),
    narrative_mode: mode(row.narrative_mode),
    compose_mode: mode(row.compose_mode),
    scores_json: row.scores_json ?? null,
    narrative_json: row.narrative_json ?? null,
    scores_ran: row.scores_ran === true,
    narrative_ran: row.narrative_ran === true,
    used_fallback: row.used_fallback === true,
    models,
    steps: readSteps(row.steps),
  }
}

function readSteps(raw: unknown): Record<string, StepTiming> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const allowed = new Set(['timeout', 'ttft', 'http', 'parse', 'validation'])
  const out: Record<string, StepTiming> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const row = value as Record<string, unknown>
    const reason = typeof row.fallback_reason === 'string' && allowed.has(row.fallback_reason) ? (row.fallback_reason as FallbackReason) : null
    const pass = row.pass === 'primary' || row.pass === 'fallback' ? row.pass : 'none'
    out[key] = {
      model_id: typeof row.model_id === 'string' ? row.model_id.replace(/[^\w.-]+/g, '').slice(0, 80) : '',
      called: row.called === true,
      pass,
      fallback_reason: reason,
      http_status: typeof row.http_status === 'number' && row.http_status >= 100 && row.http_status <= 599 ? row.http_status : null,
      elapsed_ms: typeof row.elapsed_ms === 'number' && row.elapsed_ms >= 0 ? Math.round(row.elapsed_ms) : 0,
      primary_elapsed_ms: typeof row.primary_elapsed_ms === 'number' && row.primary_elapsed_ms >= 0 ? Math.round(row.primary_elapsed_ms) : null,
      first_chunk_ms: msOrNull(row.first_chunk_ms),
      first_content_ms: msOrNull(row.first_content_ms),
      reasoning_effort: typeof row.reasoning_effort === 'string' ? row.reasoning_effort.slice(0, 16) : null,
    }
  }
  return out
}

function msOrNull(value: unknown): number | null {
  return typeof value === 'number' && value >= 0 ? Math.round(value) : null
}

function packPipeline(pipeline: PipelineState): PipelineState {
  let next = pipeline
  if (JSON.stringify(next).length > 380_000) next = { ...next, deck_text: next.deck_text.slice(0, 60_000) }
  if (JSON.stringify(next).length > 380_000) next = { ...next, scores_json: null, narrative_json: null }
  return next
}

function edgeSetting(name: string): string {
  const deno = (globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno
  return deno?.env?.get(name)?.trim() || ''
}

async function downloadDeck(admin: SupabaseClient, path: string): Promise<Uint8Array> {
  const downloaded = await admin.storage.from(DECK_BUCKET).download(path)
  if (downloaded.error || !downloaded.data) throw new Error(MEMBER_MESSAGES.finish)
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer())
  if (bytes.byteLength <= 0 || bytes.byteLength > DECK_MAX_BYTES) throw new Error(MEMBER_MESSAGES.file)
  return bytes
}

function extensionFor(path: string, mime: string): DeckExt {
  if (path.endsWith('.pdf') && mime === 'application/pdf') return 'pdf'
  if (path.endsWith('.pptx') && mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return 'pptx'
  }
  throw new Error(MEMBER_MESSAGES.notDeck)
}

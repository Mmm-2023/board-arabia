import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { fitNumberedDeck, mergeSectionDrafts, numberDeckPages, parseDeckAnalysis, parseModelJson, preferredAsk, preferredCompany, type DeckAnalysis } from '../_shared/deck_analysis.ts'
import {
  afterModelAttempt,
  assessmentLog,
  buildReport,
  claimAllowed,
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
  modelJobFields,
  nextPipelineStep,
  packReportDisclaimer,
  parsePublicHttpsUrl,
  progressForStep,
  sniffDeck,
  statusForStep,
  STEP_ANALYSIS_CAP_MS,
  STEP_COMPOSE_BUDGET_MS,
  STEP_EXTRACT_BUDGET_MS,
  type DeckExt,
  type ModelPass,
} from '../_shared/due_diligence.ts'
import { readDeckSource } from './extract.ts'
import { analyzeDeckSection, plannedModelId, scoresUser, narrativeUser } from './llm.ts'
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
  const serviceKey = edgeSetting('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return false
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/due-diligence-step`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ job_id: jobId }),
    })
    return response.ok
  } catch {
    return false
  }
}

export function deferJob(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else void work
}

async function runExtract(admin: SupabaseClient, job: HeldJob, pipeline: PipelineState) {
  const deadlineAt = Date.now() + STEP_EXTRACT_BUDGET_MS
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
  pipeline.models.extract = knownModel(pipeline, 'extract')
  await advance(admin, job, pipeline, 'extract', DD_PROGRESS.model)
}

async function runAnalysis(
  admin: SupabaseClient,
  job: HeldJob,
  pipeline: PipelineState,
  step: 'scores' | 'narrative',
) {
  const mode = step === 'scores' ? pipeline.scores_mode : pipeline.narrative_mode
  const deadlineAt = Date.now() + STEP_ANALYSIS_CAP_MS
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
    onStage: async (_stage, called) => {
      pipeline.models[step] = called
      await touch(admin, job, floor, called)
    },
    onTick: async (elapsed, called) => {
      const now = Date.now()
      if (now - lastBeat < 4_000) return
      lastBeat = now
      const span = Math.max(1, ceiling - floor)
      const moved = Math.min(span, Math.max(1, Math.round((elapsed / STEP_ANALYSIS_CAP_MS) * span)))
      await touch(admin, job, floor + moved, called)
    },
  })
  pipeline.models[step] = call.modelId
  if (!call.ok) {
    const bare = (call.reason || '').replace(/^(primary|fallback)_/, '')
    if (bare === 'missing_api_key' || bare === 'missing_model') delete pipeline.models[step]
    await settleModelMiss(admin, job, pipeline, step, mode, call.reason)
    return
  }
  const parsed = parseModelJson(call.content)
  if (!parsed || typeof parsed !== 'object') {
    await settleModelMiss(admin, job, pipeline, step, mode, 'unusable')
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
) {
  const bare = (reason || '').replace(/^(primary|fallback)_/, '') || 'model_request_failed'
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
  const deadlineAt = Date.now() + STEP_COMPOSE_BUDGET_MS
  let analysis = parseDeckAnalysis(mergeSectionDrafts(pipeline.scores_json, pipeline.narrative_json))
  const locked = analysis?.scores.overall ?? null
  const needsRepair =
    !analysis || analysis.sections_missing.includes('memo_markdown') || analysis.sections_missing.includes('scores')
  if (needsRepair && Date.now() < deadlineAt) {
    const mode = pipeline.compose_mode
    const repair = await analyzeDeckSection({
      system: REPAIR_PROMPT,
      user: `${SCHEMA_PROMPT}\n\nDeck text:\n${pipeline.deck_text.slice(0, 12_000)}\n\nPrevious reply:\n${JSON.stringify(mergeSectionDrafts(pipeline.scores_json, pipeline.narrative_json)).slice(0, 8_000)}`,
      mode,
      repair: true,
      deadlineAt,
      onStage: async (_stage, called) => {
        pipeline.models.compose = called
        await touch(admin, job, DD_PROGRESS.repair, called)
      },
    })
    pipeline.models.compose = repair.modelId
    if (!repair.ok) {
      const bare = (repair.reason || '').replace(/^(primary|fallback)_/, '')
      if (isTerminalModelFailure(bare, false) && afterModelAttempt(mode, false) === 'fallback') {
        pipeline.compose_mode = 'fallback'
        pipeline.used_fallback = true
        await releaseForFallback(admin, job, pipeline, 'compose', `compose_${bare}`)
        return
      }
    } else {
      const repaired = parseDeckAnalysis(parseModelJson(repair.content))
      if (repaired) analysis = lockOverall(repaired, locked)
    }
  }
  if (analysis && locked != null) analysis = lockOverall(analysis, locked)
  if (Date.now() >= deadlineAt && !analysis && (pipeline.scores_ran || pipeline.narrative_ran)) {
    throw failError(MEMBER_MESSAGES.timedOut, pipeline)
  }
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
  const heuristic = extractDeckFacts(pipeline.deck_text, pipeline.file_name)
  if (analysis) {
    const company = preferredCompany(analysis.meta.company)
    const ask = preferredAsk(analysis.snapshot.round)
    if (company) heuristic.company = company
    if (ask) heuristic.ask = ask
  }
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
      analysis_status: 'draft',
      model_id: report.model_id,
      model_skip_reason: report.model_skip_reason,
    })
    .select('id')
    .maybeSingle()
  if (inserted.error || !inserted.data) {
    const existing = await admin.from('due_diligence_reports').select('id').eq('job_id', job.id).maybeSingle()
    if (existing.error || !existing.data) throw failError(MEMBER_MESSAGES.finish, pipeline)
  }
  pipeline.models.compose = pipeline.models.compose || modelId
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
  const parts = ['scores', 'narrative', 'compose']
    .filter((key) => pipeline.models[key])
    .map((key) => `${key}:${pipeline.models[key]}`)
  if (extra) parts.push(extra)
  return parts.join(';').slice(0, 160)
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
  }
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

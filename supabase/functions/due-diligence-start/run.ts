import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { fitNumberedDeck, numberDeckPages } from '../_shared/deck_analysis.ts'
import {
  assessmentLog,
  buildReport,
  DECK_BUCKET,
  DD_PROGRESS,
  DECK_MAX_BYTES,
  DEGRADED_NOTE_MODEL,
  DEGRADED_NOTE_MODEL_FAILED,
  DEGRADED_NOTE_MODEL_FALLBACK,
  DEGRADED_NOTE_MODEL_PARTIAL,
  DEGRADED_NOTE_SEARCH,
  DEGRADED_NOTE_SEARCH_FAILED,
  extractCompanyUrl,
  independentSearchTerms,
  isTerminalModelFailure,
  PRIMARY_CAP_MS,
  WORKER_BUDGET_MS,
  MEMBER_MESSAGES,
  modelJobFields,
  packReportDisclaimer,
  parsePublicHttpsUrl,
  sniffDeck,
  type DeckExt,
} from '../_shared/due_diligence.ts'
import { readDeckSource } from './extract.ts'
import { extractDeckFactsWithOptionalLlm } from './llm.ts'
import { retrievePublicPages } from './sources.ts'

const ACTIVE = ['queued', 'reading', 'checking', 'writing']

export async function advanceDueDiligenceJob(admin: SupabaseClient, jobId: string): Promise<void> {
  const claimed = await admin
    .from('due_diligence_jobs')
    .update({ status: 'reading', progress: DD_PROGRESS.extract, error: null })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select('id, deck_id, member_id')
    .maybeSingle()
  if (claimed.error || !claimed.data) return

  const job = claimed.data
  let modelRan = false
  let modelSkipReason: string | null = 'not_started'
  let modelId: string | null = null
  let claimsReturned = 0
  let claimsKept = 0
  let sourcesFetched = 0
  let searchRan = false
  let searchSkipReason: string | null = 'not_started'
  const writeLog = () => {
    console.log(
      assessmentLog({
        jobId,
        modelRan,
        modelSkipReason,
        modelId,
        claimsReturned,
        claimsKept,
        sourcesFetched,
        searchRan,
        searchSkipReason,
      }),
    )
  }
  const deadlineAt = Date.now() + WORKER_BUDGET_MS
  const assertDeadline = () => {
    if (Date.now() >= deadlineAt) {
      const error = new Error(MEMBER_MESSAGES.timedOut)
      error.name = 'JobDeadlineError'
      throw error
    }
  }
  try {
    const deck = await admin
      .from('due_diligence_decks')
      .select('storage_path, company_url, file_name, mime_type')
      .eq('id', job.deck_id)
      .eq('member_id', job.member_id)
      .maybeSingle()
    if (deck.error || !deck.data) throw new Error(MEMBER_MESSAGES.finish)

    const ext = extensionFor(deck.data.storage_path, deck.data.mime_type)
    const bytes = await downloadDeck(admin, deck.data.storage_path)
    if (sniffDeck(bytes) !== ext) throw new Error(MEMBER_MESSAGES.notDeck)

    const source = await readDeckSource(bytes, ext)
    const text = source.text
    assertDeadline()
    await touch(admin, jobId, DD_PROGRESS.pages)
    const numbered = fitNumberedDeck(numberDeckPages(source.pages))
    assertDeadline()
    await mark(admin, jobId, 'checking', DD_PROGRESS.model)
    const storedUrl = typeof deck.data.company_url === 'string' ? deck.data.company_url.trim() : ''
    let companyUrl: string | null = storedUrl || null
    if (!companyUrl) {
      const extracted = extractCompanyUrl(text)
      if (extracted && parsePublicHttpsUrl(extracted).ok) {
        companyUrl = extracted
        await admin
          .from('due_diligence_decks')
          .update({ company_url: extracted })
          .eq('id', job.deck_id)
          .eq('member_id', job.member_id)
      }
    }
    let lastBeat = 0
    const extraction = await extractDeckFactsWithOptionalLlm(
      text,
      String(deck.data.file_name || ''),
      numbered,
      async (stage, calledModel) => {
        assertDeadline()
        const progress =
          stage === 'repair' ? DD_PROGRESS.repair : stage === 'fallback' ? DD_PROGRESS.fallback : DD_PROGRESS.model
        await touch(admin, jobId, progress, calledModel)
      },
      deadlineAt,
      async (elapsed, calledModel) => {
        const now = Date.now()
        if (now - lastBeat < 4_000) return
        lastBeat = now
        const room = DD_PROGRESS.fallback - DD_PROGRESS.model - 1
        const step = Math.min(room, Math.max(1, Math.round((elapsed / PRIMARY_CAP_MS) * room)))
        await touch(admin, jobId, DD_PROGRESS.model + step, calledModel)
      },
    )
    modelRan = extraction.modelRan
    modelSkipReason = extraction.skipReason
    modelId = extraction.modelId
    claimsReturned = extraction.claimsReturned
    claimsKept = extraction.claimsKept
    if (isTerminalModelFailure(extraction.skipReason, extraction.modelRan)) {
      const error = new Error(
        (extraction.skipReason || '').includes('timeout') ||
        (extraction.skipReason || '').includes('ttft') ||
        (extraction.skipReason || '').includes('deadline')
          ? MEMBER_MESSAGES.timedOut
          : MEMBER_MESSAGES.finish,
      )
      error.name = 'ModelFailed'
      throw error
    }
    assertDeadline()
    await touch(admin, jobId, DD_PROGRESS.sources)
    const facts = extraction.facts
    const retrieval = await retrievePublicPages({
      companyUrl,
      searchTerms: independentSearchTerms(facts),
    })
    sourcesFetched = retrieval.sourcesFetched
    searchRan = retrieval.searchRan
    searchSkipReason = retrieval.searchSkipReason
    assertDeadline()
    await mark(admin, jobId, 'writing', DD_PROGRESS.save)
    const degradedNotes: string[] = []
    if (!extraction.modelRan) {
      degradedNotes.push(extraction.skipReason === 'missing_api_key' ? DEGRADED_NOTE_MODEL : DEGRADED_NOTE_MODEL_FAILED)
    } else {
      if (extraction.usedFallback) degradedNotes.push(DEGRADED_NOTE_MODEL_FALLBACK)
      if (extraction.analysis?.sections_missing.length) degradedNotes.push(DEGRADED_NOTE_MODEL_PARTIAL)
    }
    if (!retrieval.searchRan) {
      degradedNotes.push(DEGRADED_NOTE_SEARCH)
    } else if (retrieval.searchSkipReason) {
      degradedNotes.push(DEGRADED_NOTE_SEARCH_FAILED)
    }
    const report = buildReport(facts, retrieval.pages, { companyUrl, degradedNotes })
    report.analysis = extraction.analysis
    const modelFields = modelJobFields({ modelId, skipReason: modelSkipReason })
    report.model_id = modelFields.model_id
    report.model_skip_reason = modelFields.model_skip_reason
    writeLog()
    const inserted = await admin
      .from('due_diligence_reports')
      .insert({
        job_id: jobId,
        deck_id: job.deck_id,
        member_id: job.member_id,
        file_name: deck.data.file_name,
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
      const existing = await admin
        .from('due_diligence_reports')
        .select('id')
        .eq('job_id', jobId)
        .maybeSingle()
      if (existing.error || !existing.data) throw new Error(MEMBER_MESSAGES.finish)
    }
    await admin
      .from('due_diligence_jobs')
      .update({ status: 'ready', progress: 100, error: null, ...modelJobFields({ modelId, skipReason: modelSkipReason }) })
      .eq('id', jobId)
      .in('status', ACTIVE)
  } catch (err) {
    const deadline = err instanceof Error && err.name === 'JobDeadlineError'
    if (deadline) {
      modelSkipReason =
        modelSkipReason && modelSkipReason !== 'not_started' ? `${modelSkipReason}:deadline_exceeded` : 'deadline_exceeded'
    } else if (modelSkipReason === 'not_started') {
      modelSkipReason = 'job_failed'
    }
    if (searchSkipReason === 'not_started') searchSkipReason = 'job_failed'
    writeLog()
    const message = err instanceof Error ? err.message : ''
    const safe =
      message === MEMBER_MESSAGES.unreadable ||
      message === MEMBER_MESSAGES.scanned ||
      message === MEMBER_MESSAGES.notDeck ||
      message === MEMBER_MESSAGES.timedOut
        ? message
        : MEMBER_MESSAGES.finish
    await admin
      .from('due_diligence_jobs')
      .update({ status: 'failed', error: safe, ...modelJobFields({ modelId, skipReason: modelSkipReason }) })
      .eq('id', jobId)
      .in('status', ACTIVE)
  }
}

export function deferJob(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else void work
}

async function touch(admin: SupabaseClient, jobId: string, progress: number, modelId?: string) {
  const patch: { progress: number; model_id?: string } = { progress }
  if (modelId) patch.model_id = modelId
  await admin.from('due_diligence_jobs').update(patch).eq('id', jobId).in('status', ACTIVE)
}

async function mark(admin: SupabaseClient, jobId: string, status: string, progress: number) {
  const updated = await admin
    .from('due_diligence_jobs')
    .update({ status, progress, error: null })
    .eq('id', jobId)
    .in('status', ACTIVE)
    .select('id')
    .maybeSingle()
  if (updated.error || !updated.data) throw new Error(MEMBER_MESSAGES.finish)
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
  if (
    path.endsWith('.pptx') &&
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return 'pptx'
  }
  throw new Error(MEMBER_MESSAGES.notDeck)
}

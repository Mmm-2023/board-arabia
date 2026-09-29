import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  assessmentLog,
  buildReport,
  DECK_BUCKET,
  DECK_MAX_BYTES,
  DEGRADED_NOTE_MODEL,
  DEGRADED_NOTE_MODEL_FAILED,
  DEGRADED_NOTE_SEARCH,
  DEGRADED_NOTE_SEARCH_FAILED,
  extractCompanyUrl,
  independentSearchTerms,
  MEMBER_MESSAGES,
  packReportDisclaimer,
  parsePublicHttpsUrl,
  sniffDeck,
  type DeckExt,
} from '../_shared/due_diligence.ts'
import { textFromDeck } from './extract.ts'
import { extractDeckFactsWithOptionalLlm } from './llm.ts'
import { retrievePublicPages } from './sources.ts'

const ACTIVE = ['queued', 'reading', 'checking', 'writing']

export async function advanceDueDiligenceJob(admin: SupabaseClient, jobId: string): Promise<void> {
  const claimed = await admin
    .from('due_diligence_jobs')
    .update({ status: 'reading', progress: 20, error: null })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select('id, deck_id, member_id')
    .maybeSingle()
  if (claimed.error || !claimed.data) return

  const job = claimed.data
  let modelRan = false
  let modelSkipReason: string | null = 'not_started'
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
        claimsReturned,
        claimsKept,
        sourcesFetched,
        searchRan,
        searchSkipReason,
      }),
    )
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

    const text = await textFromDeck(bytes, ext)
    await mark(admin, jobId, 'checking', 55)
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
    const extraction = await extractDeckFactsWithOptionalLlm(text)
    modelRan = extraction.modelRan
    modelSkipReason = extraction.skipReason
    claimsReturned = extraction.claimsReturned
    claimsKept = extraction.claimsKept
    const facts = extraction.facts
    const retrieval = await retrievePublicPages({
      companyUrl,
      searchTerms: independentSearchTerms(facts),
    })
    sourcesFetched = retrieval.sourcesFetched
    searchRan = retrieval.searchRan
    searchSkipReason = retrieval.searchSkipReason
    await mark(admin, jobId, 'writing', 85)
    const degradedNotes: string[] = []
    if (!extraction.modelRan) {
      degradedNotes.push(extraction.skipReason === 'missing_api_key' ? DEGRADED_NOTE_MODEL : DEGRADED_NOTE_MODEL_FAILED)
    }
    if (!retrieval.searchRan) {
      degradedNotes.push(DEGRADED_NOTE_SEARCH)
    } else if (retrieval.searchSkipReason) {
      degradedNotes.push(DEGRADED_NOTE_SEARCH_FAILED)
    }
    const report = buildReport(facts, retrieval.pages, { companyUrl, degradedNotes })
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
      .update({ status: 'ready', progress: 100, error: null })
      .eq('id', jobId)
      .in('status', ACTIVE)
  } catch (err) {
    if (modelSkipReason === 'not_started') modelSkipReason = 'job_failed'
    if (searchSkipReason === 'not_started') searchSkipReason = 'job_failed'
    writeLog()
    const message = err instanceof Error ? err.message : ''
    const safe =
      message === MEMBER_MESSAGES.unreadable ||
      message === MEMBER_MESSAGES.scanned ||
      message === MEMBER_MESSAGES.notDeck
        ? message
        : MEMBER_MESSAGES.finish
    await admin
      .from('due_diligence_jobs')
      .update({ status: 'failed', error: safe })
      .eq('id', jobId)
      .in('status', ACTIVE)
  }
}

export function deferJob(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else void work
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

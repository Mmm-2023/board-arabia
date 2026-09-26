import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  buildReport,
  DECK_BUCKET,
  DECK_MAX_BYTES,
  extractDeckFacts,
  MEMBER_MESSAGES,
  publicSearchTerms,
  sniffDeck,
  type DeckExt,
} from '../_shared/due_diligence.ts'
import { textFromDeck } from './extract.ts'
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
    const facts = extractDeckFacts(text)
    const pages = await retrievePublicPages({
      companyUrl: deck.data.company_url,
      searchTerms: publicSearchTerms(facts),
    })
    await mark(admin, jobId, 'writing', 85)
    const report = buildReport(facts, pages)
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
        disclaimer: report.disclaimer,
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

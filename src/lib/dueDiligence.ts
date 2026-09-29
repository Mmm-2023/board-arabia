import {
  deckStoragePath,
  MEMBER_MESSAGES,
  memberFacingMessage,
  readStoredReport,
  stageLabel,
  type BuiltReport,
  type DeckExt,
} from '../../supabase/functions/_shared/due_diligence.ts'
import { postDueDiligenceStart, postDueDiligenceStatus } from './dueDiligenceRequests'
import { supabase } from './supabase'

export type ReadFailure = 'denied' | 'unavailable' | 'error'

export type HistoryItem = {
  id: string
  created_at: string
  file_name: string
  company_label: string
  publicly_consistent_pct: number | null
  not_publicly_verifiable_pct: number | null
}

export type DeskLoad =
  | {
      ok: true
      reports: HistoryItem[]
      activeJobId: string | null
      progress: number
      stage: string
      failedMessage: string | null
    }
  | { ok: false; kind: ReadFailure }

export type StatusLoad =
  | {
      ok: true
      status: string
      progress: number
      stage: string
      error: string | null
      reportId: string | null
    }
  | { ok: false; kind: ReadFailure; error: string }

const ACTIVE = ['queued', 'reading', 'checking', 'writing'] as const

export function classifyReadError(error: { code?: string; message?: string }): ReadFailure {
  const code = error.code || ''
  const message = (error.message || '').toLowerCase()
  if (code === '42501' || code === 'PGRST301' || message.includes('permission')) return 'denied'
  if (
    code === 'PGRST205' ||
    code === '42P01' ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  ) {
    return 'unavailable'
  }
  return 'error'
}

export async function loadDueDiligenceDesk(userId: string): Promise<DeskLoad> {
  const [reportsRes, jobRes] = await Promise.all([
    supabase
      .from('due_diligence_reports')
      .select(
        'id, created_at, file_name, company_label, publicly_consistent_pct, not_publicly_verifiable_pct',
      )
      .eq('member_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('due_diligence_jobs')
      .select('id, status, progress, error')
      .eq('member_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (reportsRes.error) return { ok: false, kind: classifyReadError(reportsRes.error) }
  if (jobRes.error) return { ok: false, kind: classifyReadError(jobRes.error) }
  const job = jobRes.data
  const active = job && ACTIVE.includes(job.status as (typeof ACTIVE)[number])
  return {
    ok: true,
    reports: reportsRes.data ?? [],
    activeJobId: active ? job.id : null,
    progress: active ? job.progress : 0,
    stage: active ? stageLabel(job.status, job.progress) : '',
    failedMessage:
      job?.status === 'failed' ? memberFacingMessage(job.error, MEMBER_MESSAGES.finish) : null,
  }
}

const REPORT_COLUMNS =
  'file_name, created_at, company_label, sector_label, ask_label, disclaimer, publicly_consistent_pct, not_publicly_verifiable_pct, claims, sources, next_steps, analysis, model_id, model_skip_reason' as const
const REPORT_COLUMNS_LEGACY =
  'file_name, created_at, company_label, sector_label, ask_label, disclaimer, publicly_consistent_pct, not_publicly_verifiable_pct, claims, sources, next_steps' as const

export async function loadDueDiligenceReport(
  reportId: string,
): Promise<{ ok: true; report: BuiltReport; fileName: string; createdAt: string } | { ok: false; kind: ReadFailure | 'missing' }> {
  const first = await supabase.from('due_diligence_reports').select(REPORT_COLUMNS).eq('id', reportId).maybeSingle()
  const missingColumn =
    first.error &&
    /analysis|model_id|model_skip_reason|schema cache|does not exist/i.test(first.error.message || '')
  const loaded = missingColumn
    ? await supabase.from('due_diligence_reports').select(REPORT_COLUMNS_LEGACY).eq('id', reportId).maybeSingle()
    : first
  if (loaded.error) return { ok: false, kind: classifyReadError(loaded.error) }
  if (!loaded.data) return { ok: false, kind: 'missing' }
  const report = readStoredReport(loaded.data)
  if (!report) return { ok: false, kind: 'error' }
  return { ok: true, report, fileName: loaded.data.file_name, createdAt: loaded.data.created_at }
}

export async function startDueDiligence(input: {
  deckId: string
  storagePath: string
  fileName: string
  companyUrl: string | null
}): Promise<{ ok: true; jobId: string } | { ok: false; error: string; kind: ReadFailure }> {
  const headers = await memberHeaders()
  if (!headers) return { ok: false, error: MEMBER_MESSAGES.unauthorized, kind: 'denied' }
  return postDueDiligenceStart(
    {
      supabaseUrl: String(import.meta.env.VITE_SUPABASE_URL || ''),
      deckId: input.deckId,
      storagePath: input.storagePath,
      fileName: input.fileName,
      companyUrl: input.companyUrl,
    },
    { headers },
  )
}

export async function fetchDueDiligenceStatus(jobId: string): Promise<StatusLoad> {
  const headers = await memberHeaders()
  if (!headers) return { ok: false, error: MEMBER_MESSAGES.unauthorized, kind: 'denied' }
  return postDueDiligenceStatus(
    { supabaseUrl: String(import.meta.env.VITE_SUPABASE_URL || ''), jobId },
    { headers },
  )
}

export function uploadPath(userId: string, deckId: string, ext: DeckExt): string | null {
  return deckStoragePath(userId, deckId, ext)
}

async function memberHeaders(): Promise<HeadersInit | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!token || !anonKey) return null
  return {
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
  }
}

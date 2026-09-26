import {
  deckStoragePath,
  MEMBER_MESSAGES,
  memberFacingMessage,
  readStoredReport,
  stageLabel,
  type BuiltReport,
  type DeckExt,
} from '../../supabase/functions/_shared/due_diligence.ts'
import { DD_COPY } from './dueDiligenceCopy'
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
    stage: active ? stageLabel(job.status) : '',
    failedMessage:
      job?.status === 'failed' ? memberFacingMessage(job.error, MEMBER_MESSAGES.finish) : null,
  }
}

export async function loadDueDiligenceReport(
  reportId: string,
): Promise<{ ok: true; report: BuiltReport; fileName: string; createdAt: string } | { ok: false; kind: ReadFailure | 'missing' }> {
  const { data, error } = await supabase
    .from('due_diligence_reports')
    .select(
      'file_name, created_at, company_label, sector_label, ask_label, disclaimer, publicly_consistent_pct, not_publicly_verifiable_pct, claims, sources, next_steps',
    )
    .eq('id', reportId)
    .maybeSingle()
  if (error) return { ok: false, kind: classifyReadError(error) }
  if (!data) return { ok: false, kind: 'missing' }
  const report = readStoredReport(data)
  if (!report) return { ok: false, kind: 'error' }
  return { ok: true, report, fileName: data.file_name, createdAt: data.created_at }
}

export async function startDueDiligence(input: {
  deckId: string
  storagePath: string
  fileName: string
  companyUrl: string | null
}): Promise<{ ok: true; jobId: string } | { ok: false; error: string; kind: ReadFailure }> {
  const headers = await memberHeaders()
  if (!headers) return { ok: false, error: MEMBER_MESSAGES.unauthorized, kind: 'denied' }
  try {
    const res = await fetch(`${functionsBase()}/due-diligence-start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deck_id: input.deckId,
        storage_path: input.storagePath,
        file_name: input.fileName,
        company_url: input.companyUrl,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string; job_id?: string }
    if (!res.ok || !body.job_id) {
      return {
        ok: false,
        error: memberFacingMessage(body.error, MEMBER_MESSAGES.start),
        kind: res.status === 403 ? 'denied' : res.status === 404 ? 'unavailable' : 'error',
      }
    }
    return { ok: true, jobId: body.job_id }
  } catch {
    return { ok: false, error: DD_COPY.errorNetwork, kind: 'error' }
  }
}

export async function fetchDueDiligenceStatus(jobId: string): Promise<StatusLoad> {
  const headers = await memberHeaders()
  if (!headers) return { ok: false, error: MEMBER_MESSAGES.unauthorized, kind: 'denied' }
  try {
    const res = await fetch(`${functionsBase()}/due-diligence-status`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ job_id: jobId }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      job?: {
        status?: string
        progress?: number
        stage?: string
        error?: string | null
        report_id?: string | null
      }
    }
    if (!res.ok || !body.job?.status) {
      return {
        ok: false,
        error: memberFacingMessage(body.error, MEMBER_MESSAGES.finish),
        kind: res.status === 403 ? 'denied' : res.status === 404 ? 'unavailable' : 'error',
      }
    }
    const progress = typeof body.job.progress === 'number' ? Math.min(100, Math.max(0, body.job.progress)) : 0
    return {
      ok: true,
      status: body.job.status,
      progress,
      stage: body.job.stage || stageLabel(body.job.status),
      error: body.job.error ? memberFacingMessage(body.job.error, MEMBER_MESSAGES.finish) : null,
      reportId: body.job.report_id ?? null,
    }
  } catch {
    return { ok: false, error: MEMBER_MESSAGES.finish, kind: 'error' }
  }
}

export function uploadPath(userId: string, deckId: string, ext: DeckExt): string | null {
  return deckStoragePath(userId, deckId, ext)
}

function functionsBase() {
  return `${String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1`
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

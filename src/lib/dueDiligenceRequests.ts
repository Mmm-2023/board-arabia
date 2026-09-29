import {
  MEMBER_MESSAGES,
  memberFacingMessage,
  stageLabel,
} from '../../supabase/functions/_shared/due_diligence.ts'
import { DD_COPY } from './dueDiligenceCopy.ts'
import { DD_FETCH_TIMEOUT_MS, fetchWithTimeout, isAbortError } from './fetchTimeout.ts'

type ReadFailure = 'denied' | 'unavailable' | 'error'

type StartResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string; kind: ReadFailure }

type StatusResult =
  | {
      ok: true
      status: string
      progress: number
      stage: string
      error: string | null
      reportId: string | null
    }
  | { ok: false; kind: ReadFailure; error: string }

type RequestOptions = {
  headers: HeadersInit
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export async function postDueDiligenceStart(
  input: {
    supabaseUrl: string
    deckId: string
    storagePath: string
    fileName: string
    companyUrl: string | null
  },
  options: RequestOptions,
): Promise<StartResult> {
  try {
    const res = await fetchWithTimeout(
      options.fetchImpl ?? fetch,
      `${functionsBase(input.supabaseUrl)}/due-diligence-start`,
      {
        method: 'POST',
        headers: options.headers,
        body: JSON.stringify({
          deck_id: input.deckId,
          storage_path: input.storagePath,
          file_name: input.fileName,
          company_url: input.companyUrl,
        }),
      },
      options.timeoutMs ?? DD_FETCH_TIMEOUT_MS,
    )
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; job_id?: string }
    if (body.code === 'auth_unavailable' || res.status === 503) {
      return { ok: false, error: DD_COPY.errorAuth, kind: 'error' }
    }
    if (!res.ok || !body.job_id) {
      return {
        ok: false,
        error: memberFacingMessage(body.error, MEMBER_MESSAGES.start),
        kind: res.status === 403 ? 'denied' : res.status === 404 ? 'unavailable' : 'error',
      }
    }
    return { ok: true, jobId: body.job_id }
  } catch (error) {
    return {
      ok: false,
      error: isAbortError(error) ? DD_COPY.errorTimeout : DD_COPY.errorNetwork,
      kind: 'error',
    }
  }
}

export async function postDueDiligenceStatus(
  input: { supabaseUrl: string; jobId: string },
  options: RequestOptions,
): Promise<StatusResult> {
  try {
    const res = await fetchWithTimeout(
      options.fetchImpl ?? fetch,
      `${functionsBase(input.supabaseUrl)}/due-diligence-status`,
      {
        method: 'POST',
        headers: options.headers,
        body: JSON.stringify({ job_id: input.jobId }),
      },
      options.timeoutMs ?? DD_FETCH_TIMEOUT_MS,
    )
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
  } catch (error) {
    return {
      ok: false,
      error: isAbortError(error) ? DD_COPY.errorTimeout : MEMBER_MESSAGES.finish,
      kind: 'error',
    }
  }
}

function functionsBase(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1`
}

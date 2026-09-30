import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { aiProviderNote, completeAiToolPrompt } from '../_shared/ai_tool_provider.ts'
import {
  AI_TOOL_FLAG_DEFAULTS,
  consentMatches,
  extensionForMime,
  formatReportDate,
  isAiToolKey,
  isUuid,
  ownedAiToolPath,
  safeFileName,
  type AiToolKey,
  type ConsentRow,
} from '../_shared/ai_tools.ts'
import { appendCfoModelQuestions, CFO_MODEL_SYSTEM, cfoModelUser } from './tools/cfo_check.ts'
import { readCfoUpload } from './tools/cfo_read.ts'
import { guardStubOutput } from './tools/legal_guard.ts'
import { runToolStub } from './tools/index.ts'
import type { StubOutput } from './tools/types.ts'

export const AI_TOOL_MESSAGES = {
  consent: 'Consent is required before a run.',
  off: 'This tool is off.',
  start: 'Could not start the check. Retry.',
  missing: 'That check is not on your account.',
  delete: 'Could not delete that check. Retry.',
  file: 'Choose a file you are allowed to share.',
  unauthorized: 'Sign in to run this check.',
} as const

export type JobRow = {
  id: string
  member_id: string
  tool_key: string
  status: string
  step: string
  storage_path: string
  file_name: string
  mime_type: string
  byte_size: number
  error: string | null
  created_at: string
  updated_at: string
}

export type OutputRow = {
  id: string
  job_id: string
  body: StubOutput
  created_at: string
}

export type AiToolStore = {
  memberLive: (userId: string) => Promise<boolean>
  isStaff: (userId: string) => Promise<boolean>
  toolEnabled: (tool: AiToolKey) => Promise<boolean | null>
  consentByJob: (jobId: string) => Promise<ConsentRow | null>
  jobById: (jobId: string) => Promise<JobRow | null>
  outputByJob: (jobId: string) => Promise<OutputRow | null>
  fileReady: (path: string) => Promise<boolean>
  downloadFile: (path: string) => Promise<Uint8Array | null>
  insertJob: (row: {
    id: string
    member_id: string
    tool_key: AiToolKey
    status: 'queued'
    step: 'intake'
    storage_path: string
    file_name: string
    mime_type: string
    byte_size: number
  }) => Promise<'ok' | 'conflict' | 'error'>
  saveOutput: (row: { id: string; job_id: string; member_id: string; tool_key: AiToolKey; body: StubOutput }) => Promise<boolean>
  saveNote: (row: { id: string; member_id: string; tool_key: AiToolKey; job_id: string; title: string; body: string }) => Promise<boolean>
  markJob: (jobId: string, patch: { status: string; step: string; error?: string | null }) => Promise<boolean>
  deleteOwned: (jobId: string, userId: string) => Promise<{ storagePath: string } | null>
  removeFile: (path: string) => Promise<boolean>
  readSource?: (path: string) => Promise<string>
}

export type AiAuth =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string; code: string }

export type AiToolDeps = {
  resolveUser: () => Promise<AiAuth>
  store: () => AiToolStore | null
  now: () => Date
  newId?: () => string
}

function newUuid(deps: AiToolDeps): string {
  return deps.newId ? deps.newId() : crypto.randomUUID()
}

export async function handleAiToolJob(req: Request, deps: AiToolDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed', code: 'method_not_allowed' }, 405)

  const auth = await deps.resolveUser()
  if (!auth.ok) return jsonResponse(req, { error: auth.error, code: auth.code }, auth.status)

  const store = deps.store()
  if (!store) return jsonResponse(req, { error: AI_TOOL_MESSAGES.start, code: 'not_configured' }, 503)

  let body: Record<string, unknown>
  try {
    const parsed = await req.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonResponse(req, { error: AI_TOOL_MESSAGES.start, code: 'bad_request' }, 400)
    }
    body = parsed as Record<string, unknown>
  } catch {
    return jsonResponse(req, { error: AI_TOOL_MESSAGES.start, code: 'bad_request' }, 400)
  }

  const action = String(body.action || '')
  if (action === 'start') return startJob(req, store, auth.userId, body, deps)
  if (action === 'status') return jobStatus(req, store, auth.userId, body)
  if (action === 'step') return stepJob(req, store, auth.userId, body, deps)
  if (action === 'delete') return deleteJob(req, store, auth.userId, body)
  return jsonResponse(req, { error: AI_TOOL_MESSAGES.start, code: 'bad_request' }, 400)
}

async function startJob(
  req: Request,
  store: AiToolStore,
  userId: string,
  body: Record<string, unknown>,
  deps: AiToolDeps,
): Promise<Response> {
  const tool = String(body.tool_key || '')
  const jobId = String(body.job_id || '')
  const storagePath = String(body.storage_path || '')
  const mime = String(body.mime_type || '')
  const fileName = safeFileName(String(body.file_name || ''))
  const byteSize = Number(body.byte_size)
  const ext = extensionForMime(mime)
  if (!isAiToolKey(tool) || !isUuid(jobId) || !fileName || !ext || !ownedAiToolPath(userId, jobId, storagePath)) {
    return jsonResponse(req, { error: AI_TOOL_MESSAGES.file, code: 'bad_request' }, 400)
  }
  if (tool === 'cfo_check' && ext !== 'pdf' && ext !== 'csv' && ext !== 'xlsx') {
    return jsonResponse(req, { error: AI_TOOL_MESSAGES.file, code: 'bad_request' }, 400)
  }
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > 15_728_640) {
    return jsonResponse(req, { error: AI_TOOL_MESSAGES.file, code: 'bad_request' }, 400)
  }
  if (!(await store.memberLive(userId))) {
    return jsonResponse(req, { error: AI_TOOL_MESSAGES.unauthorized, code: 'forbidden' }, 403)
  }
  const enabled = await store.toolEnabled(tool)
  const on = enabled === null ? AI_TOOL_FLAG_DEFAULTS[tool] : enabled
  if (!on) return jsonResponse(req, { error: AI_TOOL_MESSAGES.off, code: 'tool_off' }, 403)

  const consent = await store.consentByJob(jobId)
  if (!consentMatches(consent, userId, tool, jobId)) {
    return jsonResponse(req, { error: AI_TOOL_MESSAGES.consent, code: 'consent_required' }, 403)
  }
  if (!(await store.fileReady(storagePath))) {
    return jsonResponse(req, { error: AI_TOOL_MESSAGES.file, code: 'file_missing' }, 400)
  }

  const existing = await store.jobById(jobId)
  if (existing && existing.member_id !== userId) {
    return jsonResponse(req, { error: AI_TOOL_MESSAGES.missing, code: 'not_found' }, 404)
  }
  if (!existing) {
    const inserted = await store.insertJob({
      id: jobId,
      member_id: userId,
      tool_key: tool,
      status: 'queued',
      step: 'intake',
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mime,
      byte_size: byteSize,
    })
    if (inserted === 'error') return jsonResponse(req, { error: AI_TOOL_MESSAGES.start, code: 'start_failed' }, 500)
  }

  const stepped = await runStep(store, userId, jobId, deps, reportLang(body))
  if (!stepped.ok) return jsonResponse(req, { error: stepped.error, code: stepped.code }, stepped.status)
  return jsonResponse(req, { ok: true, job_id: jobId, status: 'ready', output: stepped.output })
}

async function jobStatus(req: Request, store: AiToolStore, userId: string, body: Record<string, unknown>): Promise<Response> {
  const jobId = String(body.job_id || '')
  if (!isUuid(jobId)) return jsonResponse(req, { error: AI_TOOL_MESSAGES.missing, code: 'not_found' }, 404)
  const job = await store.jobById(jobId)
  if (!job) return jsonResponse(req, { error: AI_TOOL_MESSAGES.missing, code: 'not_found' }, 404)
  const staff = await store.isStaff(userId)
  if (job.member_id !== userId && !staff) {
    return jsonResponse(req, { error: AI_TOOL_MESSAGES.missing, code: 'not_found' }, 404)
  }
  const output = await store.outputByJob(jobId)
  return jsonResponse(req, { ok: true, job: publicJob(job), output: output?.body ?? null })
}

async function stepJob(
  req: Request,
  store: AiToolStore,
  userId: string,
  body: Record<string, unknown>,
  deps: AiToolDeps,
): Promise<Response> {
  const jobId = String(body.job_id || '')
  if (!isUuid(jobId)) return jsonResponse(req, { error: AI_TOOL_MESSAGES.missing, code: 'not_found' }, 404)
  const stepped = await runStep(store, userId, jobId, deps, reportLang(body))
  if (!stepped.ok) return jsonResponse(req, { error: stepped.error, code: stepped.code }, stepped.status)
  return jsonResponse(req, { ok: true, job_id: jobId, status: 'ready', output: stepped.output })
}

async function deleteJob(req: Request, store: AiToolStore, userId: string, body: Record<string, unknown>): Promise<Response> {
  const jobId = String(body.job_id || '')
  if (!isUuid(jobId)) return jsonResponse(req, { error: AI_TOOL_MESSAGES.missing, code: 'not_found' }, 404)
  const job = await store.jobById(jobId)
  if (!job || job.member_id !== userId) {
    return jsonResponse(req, { error: AI_TOOL_MESSAGES.missing, code: 'not_found' }, 404)
  }
  const removedFile = await store.removeFile(job.storage_path)
  if (!removedFile) return jsonResponse(req, { error: AI_TOOL_MESSAGES.delete, code: 'file_left' }, 500)
  const purged = await store.deleteOwned(jobId, userId)
  if (!purged) return jsonResponse(req, { error: AI_TOOL_MESSAGES.delete, code: 'delete_failed' }, 500)
  return jsonResponse(req, { ok: true, storage_path: purged.storagePath })
}

type StepResult =
  | { ok: true; output: StubOutput }
  | { ok: false; status: number; error: string; code: string }

async function runStep(
  store: AiToolStore,
  userId: string,
  jobId: string,
  deps: AiToolDeps,
  lang: 'en' | 'ar',
): Promise<StepResult> {
  const job = await store.jobById(jobId)
  if (!job || job.member_id !== userId) {
    return { ok: false, status: 404, error: AI_TOOL_MESSAGES.missing, code: 'not_found' }
  }
  if (!isAiToolKey(job.tool_key)) {
    return { ok: false, status: 500, error: AI_TOOL_MESSAGES.start, code: 'start_failed' }
  }
  const existing = await store.outputByJob(jobId)
  if (existing && job.status === 'ready') return { ok: true, output: existing.body }
  const provider = aiProviderNote()
  const sourceText = await readJobSource(store, job)
  let output = runToolStub(job.tool_key, {
    fileName: job.file_name,
    generatedOn: formatReportDate(deps.now()),
    modelId: provider.modelId,
    modelSkipReason: provider.skipReason,
    sourceText,
    lang,
    mimeType: job.mime_type,
  })
  if (job.tool_key === 'cfo_check' && output.metrics && output.metrics.length > 0 && !provider.skipReason) {
    const completion = await completeAiToolPrompt(CFO_MODEL_SYSTEM, cfoModelUser(output))
    output = appendCfoModelQuestions(output, completion.text)
    output = {
      ...output,
      model_id: completion.modelId ?? output.model_id,
      model_skip_reason: completion.skipReason,
    }
  }
  output = guardStubOutput(output)
  const saved = await store.saveOutput({
    id: newUuid(deps),
    job_id: jobId,
    member_id: userId,
    tool_key: job.tool_key,
    body: output,
  })
  if (!saved) return { ok: false, status: 500, error: AI_TOOL_MESSAGES.start, code: 'start_failed' }
  const noted = await store.saveNote({
    id: newUuid(deps),
    member_id: userId,
    tool_key: job.tool_key,
    job_id: jobId,
    title: job.file_name,
    body: output.summary,
  })
  if (!noted) return { ok: false, status: 500, error: AI_TOOL_MESSAGES.start, code: 'start_failed' }
  const marked = await store.markJob(jobId, { status: 'ready', step: 'done', error: null })
  if (!marked) return { ok: false, status: 500, error: AI_TOOL_MESSAGES.start, code: 'start_failed' }
  return { ok: true, output }
}

function reportLang(body: Record<string, unknown>): 'en' | 'ar' {
  return body.lang === 'ar' ? 'ar' : 'en'
}

async function readJobSource(store: AiToolStore, job: JobRow): Promise<string> {
  if (job.tool_key === 'cfo_check') {
    try {
      const bytes = await store.downloadFile(job.storage_path)
      if (!bytes || bytes.byteLength < 1) return ''
      return await readCfoUpload(job.mime_type, bytes)
    } catch {
      return ''
    }
  }
  if (job.mime_type !== 'text/plain' && job.mime_type !== 'text/csv') return ''
  if (!store.readSource) return ''
  const text = await store.readSource(job.storage_path)
  return typeof text === 'string' ? text.slice(0, 80_000) : ''
}

function publicJob(job: JobRow) {
  return {
    id: job.id,
    tool_key: job.tool_key,
    status: job.status,
    step: job.step,
    file_name: job.file_name,
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
  }
}

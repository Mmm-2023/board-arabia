import {
  AI_TOOL_BUCKET,
  AI_TOOL_FLAG_DEFAULTS,
  AI_TOOL_MAX_BYTES,
  blockVersion,
  extensionForMime,
  isAiToolKey,
  retentionDaysOrDefault,
  type AiToolKey,
} from '../../supabase/functions/_shared/ai_tools.ts'
import { fetchWithTimeout } from './fetchTimeout'
import { supabase } from './supabase'

export type AiToolFlags = Record<AiToolKey, boolean>

export type AiToolFrame = {
  retentionDays: number
  flags: AiToolFlags
}

export type AiToolNote = {
  id: string
  tool_key: string
  status: string
  step: string
  file_name: string
  title: string
  created_at: string
}

export function parseAiToolFrame(data: unknown): AiToolFrame | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const row = data as { retention_days?: unknown; tools?: unknown }
  if (!Array.isArray(row.tools)) return null
  const flags: AiToolFlags = { ...AI_TOOL_FLAG_DEFAULTS }
  for (const item of row.tools) {
    if (!item || typeof item !== 'object') continue
    const tool = (item as { tool_key?: unknown }).tool_key
    const enabled = (item as { enabled?: unknown }).enabled
    if (isAiToolKey(tool) && typeof enabled === 'boolean') flags[tool] = enabled
  }
  return { retentionDays: retentionDaysOrDefault(row.retention_days), flags }
}

export function parseAiToolNotes(data: unknown): AiToolNote[] {
  if (!Array.isArray(data)) return []
  const notes: AiToolNote[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.title !== 'string') continue
    notes.push({
      id: row.id,
      tool_key: typeof row.tool_key === 'string' ? row.tool_key : '',
      status: typeof row.status === 'string' ? row.status : '',
      step: typeof row.step === 'string' ? row.step : '',
      file_name: typeof row.file_name === 'string' ? row.file_name : '',
      title: row.title,
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
    })
  }
  return notes
}

export async function readAiToolFrame(): Promise<AiToolFrame | null> {
  const { data, error } = await supabase.rpc('read_ai_tool_frame')
  if (error) return null
  return parseAiToolFrame(data)
}

export async function recordAiToolConsent(tool: AiToolKey, jobId: string): Promise<boolean> {
  const { error } = await supabase.rpc('record_ai_tool_consent', {
    p_tool: tool,
    p_job_id: jobId,
    p_copy_version: blockVersion('consent', tool),
  })
  return !error
}

export async function listAiToolJobs(tool: AiToolKey): Promise<AiToolNote[] | null> {
  const { data, error } = await supabase.rpc('list_own_ai_tool_jobs', { p_tool: tool })
  if (error) return null
  return parseAiToolNotes(data)
}

export async function saveAiToolRetention(days: number): Promise<boolean> {
  const { error } = await supabase.rpc('set_ai_tool_retention', { p_days: days })
  return !error
}

export async function saveAiToolFlag(tool: AiToolKey, enabled: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('set_ai_tool_flag', { p_tool: tool, p_enabled: enabled })
  return !error
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

export function acceptAiToolFile(file: File): string | null {
  if (file.size < 1 || file.size > AI_TOOL_MAX_BYTES) return 'That file is too large. The limit is 15 MB.'
  const mime = file.type || mimeFromName(file.name)
  if (!extensionForMime(mime)) return 'Use a PDF, text file, CSV, spreadsheet, or document.'
  return null
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.txt')) return 'text/plain'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return ''
}

export async function uploadAiToolFile(path: string, file: File): Promise<boolean> {
  const mime = file.type || mimeFromName(file.name)
  const { error } = await supabase.storage.from(AI_TOOL_BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  })
  return !error
}

export async function postAiTool(
  body: Record<string, unknown>,
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; status: number; error: string; code: string }> {
  const headers = await memberHeaders()
  const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  if (!headers || !base) return { ok: false, status: 401, error: 'Sign in to run this check.', code: 'unauthorized' }
  try {
    const res = await fetchWithTimeout(fetch, `${base}/functions/v1/ai-tool-job`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: typeof payload.error === 'string' ? payload.error : 'Could not finish that request. Retry.',
        code: typeof payload.code === 'string' ? payload.code : 'error',
      }
    }
    return { ok: true, payload }
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the check. Retry.', code: 'network' }
  }
}

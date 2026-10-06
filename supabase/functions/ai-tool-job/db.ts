import {
  AI_TOOL_BUCKET,
  isAiToolKey,
  type AiToolKey,
  type ConsentRow,
} from '../_shared/ai_tools.ts'
import type { AiToolStore, JobRow, OutputRow } from './handle.ts'
import type { StubOutput } from './tools/types.ts'

type Err = { message?: string; code?: string } | null

type Query = {
  eq: (column: string, value: string) => Query
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: Err }>
  then?: unknown
}

type Writer = {
  eq: (column: string, value: string) => Writer & Promise<{ error: Err }>
}

export type AiToolAdmin = {
  from: (table: string) => {
    select: (columns: string) => Query
    insert: (row: Record<string, unknown>) => Promise<{ error: Err }>
    update: (row: Record<string, unknown>) => Writer
    delete: () => Writer
  }
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: unknown; error: Err }>
      remove: (paths: string[]) => Promise<{ error: Err }>
    }
  }
}

function asJob(row: Record<string, unknown> | null): JobRow | null {
  if (!row || typeof row.id !== 'string') return null
  return {
    id: String(row.id),
    member_id: String(row.member_id),
    tool_key: String(row.tool_key),
    status: String(row.status),
    step: String(row.step),
    storage_path: String(row.storage_path),
    file_name: String(row.file_name),
    mime_type: String(row.mime_type),
    byte_size: Number(row.byte_size),
    error: row.error == null ? null : String(row.error),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    shared_with_admin_at: row.shared_with_admin_at == null ? null : String(row.shared_with_admin_at),
  }
}

export function createAiToolStore(admin: AiToolAdmin): AiToolStore {
  return {
    async memberLive(userId) {
      const { data, error } = await admin.from('members').select('status').eq('user_id', userId).maybeSingle()
      if (error || !data) return false
      return data.status === 'invited' || data.status === 'active'
    },
    async isStaff(userId) {
      const { data, error } = await admin.from('staff_users').select('role').eq('user_id', userId).maybeSingle()
      return !error && !!data?.role
    },
    async toolEnabled(tool) {
      const { data, error } = await admin.from('ai_tool_flags').select('enabled').eq('tool_key', tool).maybeSingle()
      if (error || !data || typeof data.enabled !== 'boolean') return null
      return data.enabled
    },
    async consentByJob(jobId) {
      const { data, error } = await admin
        .from('ai_tool_consents')
        .select('id, member_id, tool_key, copy_version, accepted_at, job_id')
        .eq('job_id', jobId)
        .maybeSingle()
      if (error || !data) return null
      return data as unknown as ConsentRow
    },
    async jobById(jobId) {
      const columns = 'id, member_id, tool_key, status, step, storage_path, file_name, mime_type, byte_size, error, created_at, updated_at'
      const full = await admin
        .from('ai_tool_jobs')
        .select(`${columns}, shared_with_admin_at`)
        .eq('id', jobId)
        .maybeSingle()
      const missingShare = full.error && /shared_with_admin_at|does not exist|schema cache/i.test(full.error.message || '')
      const loaded = missingShare
        ? await admin.from('ai_tool_jobs').select(columns).eq('id', jobId).maybeSingle()
        : full
      if (loaded.error) return null
      return asJob(loaded.data)
    },
    async outputByJob(jobId) {
      const { data, error } = await admin
        .from('ai_tool_outputs')
        .select('id, job_id, body, created_at')
        .eq('job_id', jobId)
        .maybeSingle()
      if (error || !data || typeof data.id !== 'string') return null
      return {
        id: data.id,
        job_id: String(data.job_id),
        body: data.body as StubOutput,
        created_at: String(data.created_at),
      } satisfies OutputRow
    },
    async fileReady(path) {
      const { data, error } = await admin.storage.from(AI_TOOL_BUCKET).download(path)
      return !error && data != null
    },
    async downloadFile(path) {
      const { data, error } = await admin.storage.from(AI_TOOL_BUCKET).download(path)
      if (error || data == null) return null
      if (data instanceof Uint8Array) return data
      if (data instanceof ArrayBuffer) return new Uint8Array(data)
      const blob = data as { arrayBuffer?: () => Promise<ArrayBuffer> }
      if (typeof blob.arrayBuffer !== 'function') return null
      return new Uint8Array(await blob.arrayBuffer())
    },
    async insertJob(row) {
      const { error } = await admin.from('ai_tool_jobs').insert({ ...row, error: null })
      if (!error) return 'ok'
      if (error.code === '23505' || /duplicate/i.test(error.message || '')) return 'conflict'
      return 'error'
    },
    async saveOutput(row) {
      const { error } = await admin.from('ai_tool_outputs').insert(row)
      return !error
    },
    async saveNote(row) {
      if (!isAiToolKey(row.tool_key)) return false
      const { error } = await admin.from('ai_tool_notes').insert(row)
      return !error
    },
    async markJob(jobId, patch) {
      const { error } = await admin.from('ai_tool_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', jobId)
      return !error
    },
    async deleteOwned(jobId, userId) {
      const job = await this.jobById(jobId)
      if (!job || job.member_id !== userId) return null
      const path = job.storage_path
      const outputs = await admin.from('ai_tool_outputs').delete().eq('job_id', jobId)
      const notes = await admin.from('ai_tool_notes').delete().eq('job_id', jobId)
      const consents = await admin.from('ai_tool_consents').delete().eq('job_id', jobId)
      const jobs = await admin.from('ai_tool_jobs').delete().eq('id', jobId)
      if (outputs.error || notes.error || consents.error || jobs.error) return null
      return { storagePath: path }
    },
    async removeFile(path) {
      const { error } = await admin.storage.from(AI_TOOL_BUCKET).remove([path])
      return !error
    },
    async readSource(path) {
      const { data, error } = await admin.storage.from(AI_TOOL_BUCKET).download(path)
      if (error || data == null) return ''
      const text = await textFromDownload(data)
      return text.slice(0, 80_000)
    },
  }
}

async function textFromDownload(data: unknown): Promise<string> {
  if (typeof data === 'string') return data
  if (data instanceof Uint8Array) return new TextDecoder().decode(data)
  if (typeof data === 'object' && data && typeof (data as Blob).text === 'function') {
    return (data as Blob).text()
  }
  return ''
}

export function toolKeyOrNull(value: string): AiToolKey | null {
  return isAiToolKey(value) ? value : null
}

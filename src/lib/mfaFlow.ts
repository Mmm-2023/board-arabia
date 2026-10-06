/** Pure two-step sign-in decisions. No network, no secrets. */

export type MfaHold = 'clear' | 'challenge' | 'enrol'

export function routeHold(input: {
  area: 'staff' | 'member'
  currentLevel: string | null
  verifiedFactor: boolean
}): MfaHold {
  if (input.verifiedFactor && input.currentLevel !== 'aal2') return 'challenge'
  if (input.area === 'staff' && input.currentLevel !== 'aal2') return 'enrol'
  return 'clear'
}

export function showMemberPrompt(input: {
  verifiedFactor: boolean
  dismissed: boolean
}): boolean {
  return !input.verifiedFactor && !input.dismissed
}

const PROMPT_KEY = 'ba-mfa-prompt-dismissed'

export function promptWasDismissed(userId: string, raw: string | null, metadataFlag: boolean): boolean {
  if (metadataFlag) return true
  if (!userId || !raw) return false
  try {
    const parsed = JSON.parse(raw) as { ids?: unknown }
    return Array.isArray(parsed.ids) && parsed.ids.includes(userId)
  } catch {
    return false
  }
}

export function rememberPromptDismissed(userId: string, raw: string | null): string {
  const ids = new Set<string>()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { ids?: unknown }
      if (Array.isArray(parsed.ids)) {
        for (const id of parsed.ids) {
          if (typeof id === 'string' && id.length > 0 && id.length < 80) ids.add(id)
        }
      }
    } catch {
      // Keep the new id only.
    }
  }
  if (userId) ids.add(userId)
  const kept = [...ids].slice(-20)
  return JSON.stringify({ ids: kept })
}

export function promptStorageKey(): string {
  return PROMPT_KEY
}

export type ShareKind = 'due_diligence_report' | 'ai_tool_job'

export function shareButtonLabel(shared: boolean): 'Share with admin' | 'Stop sharing' {
  return shared ? 'Stop sharing' : 'Share with admin'
}

export function deckShareButtonLabel(shared: boolean): string {
  return shared ? 'Stop sharing the deck file' : 'Share the deck file with admin'
}

export type PrivateWorkCounts = {
  due_diligence_decks: number
  due_diligence_jobs: Record<string, number>
  due_diligence_reports: number
  due_diligence_reports_shared: number
  ai_tool_jobs: Record<string, number>
  ai_tool_outputs: number
  ai_tool_outputs_shared: number
  ai_tool_notes: number
}

const JOB_STATUSES = ['queued', 'reading', 'checking', 'writing', 'ready', 'failed'] as const

export function parsePrivateWorkCounts(data: unknown): PrivateWorkCounts | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const row = data as Record<string, unknown>
  const jobs = statusMap(row.due_diligence_jobs)
  const ai = statusMap(row.ai_tool_jobs)
  if (!jobs || !ai) return null
  const decks = count(row.due_diligence_decks)
  const reports = count(row.due_diligence_reports)
  const reportsShared = count(row.due_diligence_reports_shared)
  const outputs = count(row.ai_tool_outputs)
  const outputsShared = count(row.ai_tool_outputs_shared)
  const notes = count(row.ai_tool_notes)
  if (
    decks == null ||
    reports == null ||
    reportsShared == null ||
    outputs == null ||
    outputsShared == null ||
    notes == null
  ) {
    return null
  }
  return {
    due_diligence_decks: decks,
    due_diligence_jobs: jobs,
    due_diligence_reports: reports,
    due_diligence_reports_shared: reportsShared,
    ai_tool_jobs: ai,
    ai_tool_outputs: outputs,
    ai_tool_outputs_shared: outputsShared,
    ai_tool_notes: notes,
  }
}

function count(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

function statusMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, number> = {}
  for (const status of JOB_STATUSES) {
    const raw = (value as Record<string, unknown>)[status]
    if (raw == null) continue
    const n = count(raw)
    if (n == null) return null
    out[status] = n
  }
  return out
}

export function countsLeakContent(data: unknown): boolean {
  const text = JSON.stringify(data)
  return /file_name|member_id|storage_path|@[a-z]|otpauth|secret/i.test(text)
}

/**
 * Shared frame for the member AI tools.
 * The first four stay off until a later tool PR turns one on.
 * Deal readiness is turned on for members in 20261125120000_re_ai_readiness.sql.
 * No new secret names live here.
 */

export const AI_TOOL_KEYS = [
  'cfo_check',
  'market_brief',
  'term_sheet_review',
  'pricing_sense_check',
  'deal_readiness',
] as const

export type AiToolKey = (typeof AI_TOOL_KEYS)[number]

export const AI_TOOL_ORDER: readonly AiToolKey[] = AI_TOOL_KEYS

/** Code fallback is off. The deal readiness migration inserts that flag as on. */
export const AI_TOOL_FLAG_DEFAULTS: Record<AiToolKey, boolean> = {
  cfo_check: false,
  market_brief: false,
  term_sheet_review: false,
  pricing_sense_check: false,
  deal_readiness: false,
}

export const AI_TOOL_RETENTION_DAYS_DEFAULT = 30
export const AI_TOOL_RETENTION_DAYS_MAX = 3650

export const AI_TOOL_BUCKET = 'ai-tool-uploads'
export const AI_TOOL_MAX_BYTES = 15_728_640

export const AI_TOOL_STATUSES = ['queued', 'reading', 'checking', 'writing', 'ready', 'failed'] as const
export type AiToolStatus = (typeof AI_TOOL_STATUSES)[number]

export const AI_TOOL_STEPS = ['intake', 'draft', 'done'] as const
export type AiToolStep = (typeof AI_TOOL_STEPS)[number]

export const AI_COPY_BLOCKS = ['banner', 'will', 'consent', 'footer'] as const
export type AiCopyBlock = (typeof AI_COPY_BLOCKS)[number]

/** One version constant per legal block, dated to the 2026-09-30 copy. */
export const AI_COPY_BLOCK_VERSION: Record<AiCopyBlock, string> = {
  banner: '2026-09-30.banner',
  will: '2026-09-30.will',
  consent: '2026-09-30.consent',
  footer: '2026-09-30.footer',
}

export const AI_TOOL_SLUGS: Record<AiToolKey, string> = {
  cfo_check: 'cfo-check',
  market_brief: 'market-brief',
  term_sheet_review: 'term-sheet-review',
  pricing_sense_check: 'pricing-sense-check',
  deal_readiness: 'deal-readiness',
}

export const AI_TOOL_NAMES: Record<AiToolKey, string> = {
  cfo_check: 'CFO check',
  market_brief: 'Market brief',
  term_sheet_review: 'Term sheet reviewer',
  pricing_sense_check: 'Pricing sense-check',
  deal_readiness: 'Deal readiness memo',
}

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isAiToolKey(value: unknown): value is AiToolKey {
  return typeof value === 'string' && (AI_TOOL_KEYS as readonly string[]).includes(value)
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function blockVersion(block: AiCopyBlock, tool: AiToolKey): string {
  return `${AI_COPY_BLOCK_VERSION[block]}.${tool}`
}

export function toolFromSlug(slug: string | undefined): AiToolKey | null {
  if (!slug) return null
  const hit = AI_TOOL_ORDER.find((key) => AI_TOOL_SLUGS[key] === slug)
  return hit ?? null
}

export function toolPath(tool: AiToolKey, jobId?: string): string {
  const base = `/dashboard/ai/${AI_TOOL_SLUGS[tool]}`
  return jobId ? `${base}/${jobId}` : base
}

export function extensionForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null
}

export function aiToolStoragePath(userId: string, jobId: string, ext: string): string {
  return `${userId}/${jobId}/source.${ext}`
}

export function ownedAiToolPath(userId: string, jobId: string, storagePath: string): boolean {
  if (!isUuid(userId) || !isUuid(jobId)) return false
  return Object.values(EXT_BY_MIME).some((ext) => storagePath === aiToolStoragePath(userId, jobId, ext))
}

export function safeStoragePath(path: string): boolean {
  if (!path || path.length > 300 || path.includes('..') || path.startsWith('/')) return false
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/source\.(pdf|txt|csv|xlsx|docx)$/i.test(path)
}

export function safeFileName(name: string): string | null {
  const trimmed = name.trim().slice(0, 180)
  if (!trimmed || /[\u0000-\u001f]/.test(trimmed)) return null
  return trimmed
}

export function retentionDaysOrDefault(value: unknown): number {
  const days = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(days) || days < 1 || days > AI_TOOL_RETENTION_DAYS_MAX) {
    return AI_TOOL_RETENTION_DAYS_DEFAULT
  }
  return days
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export function formatReportDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = MONTHS[date.getUTCMonth()] ?? 'Jan'
  return `${day} ${month} ${date.getUTCFullYear()}`
}

/** Members only see tools whose flag is on. */
export function visibleAiTools(flags: Record<AiToolKey, boolean>): AiToolKey[] {
  return AI_TOOL_ORDER.filter((key) => flags[key])
}

export type ConsentRow = {
  id: string
  member_id: string
  tool_key: string
  copy_version: string
  accepted_at: string
  job_id: string
}

export function consentMatches(row: ConsentRow | null, userId: string, tool: AiToolKey, jobId: string): boolean {
  if (!row) return false
  return (
    row.member_id === userId &&
    row.tool_key === tool &&
    row.job_id === jobId &&
    row.copy_version === blockVersion('consent', tool) &&
    typeof row.accepted_at === 'string' &&
    row.accepted_at.length > 0
  )
}

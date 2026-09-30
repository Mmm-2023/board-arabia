import { BANNER_VERSIONS, NOTICE_VERSIONS } from '../_shared/consent_versions.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const CONSENT_ID_HOURLY_MAX = 8
const GLOBAL_PER_MINUTE_MAX = 120
const MEMORY_WINDOW_MS = 10 * 60 * 1000
const MEMORY_MAX = 20

export type ConsentInsert = {
  consent_id: string
  choice: 'accept' | 'reject'
  banner_version: string
  notice_version: string
  language: 'en' | 'ar'
  user_id: string | null
}

export type ConsentDeps = {
  now: () => number
  bucket: string
  userId: string | null
  countForConsent: (consentId: string, sinceIso: string) => Promise<number>
  countGlobal: (sinceIso: string) => Promise<number>
  insert: (row: ConsentInsert) => Promise<boolean>
}

type Hit = { start: number; count: number }
const memoryHits = new Map<string, Hit>()

export function resetConsentRateMemory() {
  memoryHits.clear()
}

export function memoryLimited(bucket: string, now: number): boolean {
  const row = memoryHits.get(bucket)
  if (!row || now - row.start > MEMORY_WINDOW_MS) {
    memoryHits.set(bucket, { start: now, count: 1 })
    return false
  }
  if (row.count >= MEMORY_MAX) return true
  row.count += 1
  return false
}

export async function hashClientBucket(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`consent-rate:${ip || 'unknown'}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

export async function acceptConsent(
  rawBody: unknown,
  deps: ConsentDeps,
): Promise<{ status: number; body: { ok: true } | { error: string } }> {
  const parsed = parseConsentBody(rawBody)
  if (!parsed) return { status: 400, body: { error: 'Choice could not be saved.' } }
  const now = deps.now()
  if (memoryLimited(deps.bucket, now)) {
    return { status: 429, body: { error: 'Too many choices from this browser. Try again later.' } }
  }
  const hourlySince = new Date(now - HOUR_MS).toISOString()
  const minuteSince = new Date(now - MINUTE_MS).toISOString()
  const [forId, globalCount] = await Promise.all([
    deps.countForConsent(parsed.consent_id, hourlySince),
    deps.countGlobal(minuteSince),
  ])
  if (forId >= CONSENT_ID_HOURLY_MAX || globalCount >= GLOBAL_PER_MINUTE_MAX) {
    return { status: 429, body: { error: 'Too many choices from this browser. Try again later.' } }
  }
  const row: ConsentInsert = {
    consent_id: parsed.consent_id,
    choice: parsed.choice,
    banner_version: parsed.banner_version,
    notice_version: parsed.notice_version,
    language: parsed.language,
    user_id: deps.userId,
  }
  const saved = await deps.insert(row)
  if (!saved) return { status: 400, body: { error: 'Choice could not be saved.' } }
  return { status: 200, body: { ok: true } }
}

function parseConsentBody(raw: unknown): Omit<ConsentInsert, 'user_id'> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  const consentId = typeof body.consent_id === 'string' ? body.consent_id.trim().toLowerCase() : ''
  if (!UUID_RE.test(consentId)) return null
  if (body.choice !== 'accept' && body.choice !== 'reject') return null
  if (typeof body.banner_version !== 'string' || !BANNER_VERSIONS.includes(body.banner_version as (typeof BANNER_VERSIONS)[number])) {
    return null
  }
  if (typeof body.notice_version !== 'string' || !NOTICE_VERSIONS.includes(body.notice_version as (typeof NOTICE_VERSIONS)[number])) {
    return null
  }
  if (body.language !== 'en' && body.language !== 'ar') return null
  return {
    consent_id: consentId,
    choice: body.choice,
    banner_version: body.banner_version,
    notice_version: body.notice_version,
    language: body.language,
  }
}

/**
 * Due diligence start auth. Decode the gateway-verified JWT and check sub, exp,
 * and role locally. Call auth/v1/user only when the token cannot be decoded,
 * with a 5 second timeout and one retry. require_user.ts is unchanged.
 */
import { isUuid, MEMBER_MESSAGES } from './due_diligence.ts'

export const AUTH_TIMEOUT_MS = 5_000
const CLOCK_SKEW_MS = 30_000
const MAX_TOKEN_CHARS = 8_192

export type LocalJwtResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'unauthorized'; userId: string | null }
  | { ok: false; reason: 'not_feasible' }

export type AuthLookup =
  | { ok: true; userId: string }
  | { ok: false; status: number; retryable: boolean }

export type ResolvedDueDiligenceUser =
  | { ok: true; userId: string }
  | {
      ok: false
      status: 401 | 503
      error: string
      code: 'unauthorized' | 'auth_unavailable'
      userId: string | null
    }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export async function verifyLocalUserJwt(
  token: string,
  options: { nowMs: number; jwtSecret?: string | null },
): Promise<LocalJwtResult> {
  if (!token || token.length > MAX_TOKEN_CHARS) {
    return { ok: false, reason: 'unauthorized', userId: null }
  }
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return { ok: false, reason: 'not_feasible' }
  }

  let header: unknown
  let payload: unknown
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])))
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])))
  } catch {
    return { ok: false, reason: 'not_feasible' }
  }
  if (!isRecord(header) || !isRecord(payload)) return { ok: false, reason: 'not_feasible' }

  const alg = header.alg
  if (typeof alg !== 'string' || alg.length === 0 || alg.toLowerCase() === 'none') {
    return { ok: false, reason: 'unauthorized', userId: null }
  }

  const secret = options.jwtSecret?.trim() ?? ''
  let signatureOk = false
  if (secret && alg === 'HS256') {
    signatureOk = await verifyHs256(`${parts[0]}.${parts[1]}`, parts[2], secret)
    if (!signatureOk) return { ok: false, reason: 'unauthorized', userId: null }
  }

  const userId = typeof payload.sub === 'string' && isUuid(payload.sub) ? payload.sub.toLowerCase() : null
  const expOk =
    typeof payload.exp === 'number' &&
    Number.isFinite(payload.exp) &&
    payload.exp * 1000 + CLOCK_SKEW_MS > options.nowMs
  const roleOk = payload.role === 'authenticated'
  if (!userId || !expOk || !roleOk) {
    return { ok: false, reason: 'unauthorized', userId: signatureOk ? userId : null }
  }
  return { ok: true, userId }
}

export async function lookupAuthUser(input: {
  supabaseUrl: string
  anonKey: string
  token: string
  fetchImpl: FetchLike
  timeoutMs?: number
}): Promise<AuthLookup> {
  const timeoutMs = input.timeoutMs ?? AUTH_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await input.fetchImpl(`${input.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.token}`,
        apikey: input.anonKey,
      },
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, status: res.status, retryable: retryableStatus(res.status) }
    const body = (await res.json().catch(() => null)) as { id?: unknown } | null
    if (!body || typeof body.id !== 'string' || !isUuid(body.id)) {
      return { ok: false, status: 401, retryable: false }
    }
    return { ok: true, userId: body.id.toLowerCase() }
  } catch {
    return { ok: false, status: 0, retryable: true }
  } finally {
    clearTimeout(timer)
  }
}

export async function lookupAuthUserWithRetry(input: {
  supabaseUrl: string
  anonKey: string
  token: string
  fetchImpl: FetchLike
  timeoutMs?: number
}): Promise<AuthLookup> {
  const first = await lookupAuthUser(input)
  if (first.ok || !first.retryable) return first
  return lookupAuthUser(input)
}

export async function resolveDueDiligenceUser(input: {
  authorization: string | null
  nowMs: number
  jwtSecret?: string | null
  supabaseUrl: string
  anonKey: string
  fetchImpl: FetchLike
  timeoutMs?: number
}): Promise<ResolvedDueDiligenceUser> {
  const token = (input.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return unauthorized(null)

  const local = await verifyLocalUserJwt(token, { nowMs: input.nowMs, jwtSecret: input.jwtSecret })
  if (local.ok) return { ok: true, userId: local.userId }
  if (local.reason === 'unauthorized') return unauthorized(local.userId)
  if (!input.supabaseUrl || !input.anonKey) return unavailable()

  const remote = await lookupAuthUserWithRetry({
    supabaseUrl: input.supabaseUrl,
    anonKey: input.anonKey,
    token,
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
  })
  if (remote.ok) return { ok: true, userId: remote.userId }
  if (!remote.retryable) return unauthorized(null)
  return unavailable()
}

function unauthorized(userId: string | null): ResolvedDueDiligenceUser {
  return {
    ok: false,
    status: 401,
    error: MEMBER_MESSAGES.unauthorized,
    code: 'unauthorized',
    userId,
  }
}

function unavailable(): ResolvedDueDiligenceUser {
  return {
    ok: false,
    status: 503,
    error: MEMBER_MESSAGES.authUnavailable,
    code: 'auth_unavailable',
    userId: null,
  }
}

function retryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function verifyHs256(signingInput: string, signaturePart: string, secret: string): Promise<boolean> {
  let signature: Uint8Array
  try {
    signature = base64UrlToBytes(signaturePart)
  } catch {
    return false
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const data = new TextEncoder().encode(signingInput)
  try {
    return await crypto.subtle.verify('HMAC', key, signature, data)
  } catch {
    return false
  }
}

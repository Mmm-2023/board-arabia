import { FROM_NAME, ONE_CLICK_BODY, renderBulkLetter } from './bulk_mail_copy.ts'

export const BULK_BATCH_URL = 'https://api.resend.com/emails/batch'
const MAX_BATCH = 100
const MAX_BACKOFF_MS = 30_000
const DEFAULT_ATTEMPTS = 4

export type OutboundHeaders = {
  'List-Unsubscribe': string
  'List-Unsubscribe-Post': string
}

export type OutboundMessage = {
  from: string
  to: string[]
  subject: string
  text: string
  html: string
  reply_to: string
  headers: OutboundHeaders
}

export type PreparedSend = {
  sendId: string
  userId: string
  hash: string
  message: OutboundMessage
}

export function cleanMailbox(value: string): string {
  const trimmed = value.trim()
  const wrapped = trimmed.match(/<([^<>]+)>/)
  const mailbox = (wrapped?.[1] || trimmed).trim()
  if (!mailbox || /[\r\n<>]/.test(mailbox)) return ''
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(mailbox)) return ''
  return mailbox
}

export function httpsOrigin(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return ''
    if (url.username || url.password) return ''
    return url.origin
  } catch {
    return ''
  }
}

export function headerValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Same bytes as private.email_address_hash: lower-case trimmed address. */
export async function addressHash(email: string): Promise<string> {
  return sha256Hex(email.trim().toLowerCase())
}

export function listUnsubscribeValue(pageUrl: string): string {
  return `<${pageUrl}>`
}

/** Mode plus a hash of the send ids actually posted, so a test and a later live send do not share a key. */
export async function batchIdempotencyKey(mode: 'test' | 'live', sendIds: string[]): Promise<string> {
  const digest = await sha256Hex([...sendIds].sort().join(','))
  return `${mode}:${digest}`
}

export function buildOutbound(input: {
  fromMailbox: string
  contactEmail: string
  to: string
  subject: string
  preheader: string
  bodyText: string
  bodyHtml: string
  unsubscribeUrl: string
  preferencesUrl: string
  oneClickUrl: string
  test: boolean
}): OutboundMessage {
  const letter = renderBulkLetter({
    subject: headerValue(input.subject),
    preheader: input.preheader,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesUrl: input.preferencesUrl,
    test: input.test,
  })
  return {
    from: `"${FROM_NAME}" <${input.fromMailbox}>`,
    to: [input.to],
    subject: headerValue(letter.subject),
    text: letter.text,
    html: letter.html,
    reply_to: input.contactEmail,
    headers: {
      'List-Unsubscribe': listUnsubscribeValue(input.oneClickUrl),
      'List-Unsubscribe-Post': ONE_CLICK_BODY,
    },
  }
}

export function memberLinks(input: {
  siteOrigin: string
  functionsOrigin: string
  token: string
}): { unsubscribeUrl: string; preferencesUrl: string; oneClickUrl: string } {
  const token = encodeURIComponent(input.token)
  return {
    unsubscribeUrl: `${input.siteOrigin}/email/unsubscribe?t=${token}`,
    preferencesUrl: `${input.siteOrigin}/dashboard/privacy`,
    oneClickUrl: `${input.functionsOrigin}/functions/v1/email-unsubscribe?t=${token}`,
  }
}

export function retryAfterMs(headers: { get(name: string): string | null }, nowMs: number): number {
  const retry = headers.get('retry-after')
  if (retry) {
    const seconds = Number(retry)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS)
    const dated = Date.parse(retry)
    if (Number.isFinite(dated)) return Math.min(Math.max(0, dated - nowMs), MAX_BACKOFF_MS)
  }
  const reset = headers.get('x-ratelimit-reset') || headers.get('ratelimit-reset')
  if (reset) {
    const value = Number(reset)
    if (Number.isFinite(value) && value >= 0) {
      const ms = value > 10_000_000 ? value * 1000 - nowMs : value * 1000
      return Math.min(Math.max(0, ms), MAX_BACKOFF_MS)
    }
  }
  return 1000
}

export type BatchPost = {
  batchNo: number
  idempotencyKey: string
  messages: OutboundMessage[]
  sendIds: string[]
}

export type BatchResult = {
  batchNo: number
  idempotencyKey: string
  ok: boolean
  status: number
  rows: { sendId: string; providerId: string }[]
}

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  status: number
  headers: { get(name: string): string | null }
  json: () => Promise<unknown>
}>

function messageIds(body: unknown, count: number): string[] {
  const rows = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: unknown[] }).data
      : []
  const ids = rows.map((row) => {
    if (!row || typeof row !== 'object') return ''
    const id = (row as { id?: unknown }).id
    return typeof id === 'string' ? id : ''
  })
  while (ids.length < count) ids.push('')
  return ids.slice(0, count)
}

export async function deliverBatches(input: {
  campaignId: string
  mode: 'test' | 'live'
  prepared: PreparedSend[]
  batchSize: number
  pauseMs: number
  apiKey: string
  now: () => number
  sleep: (ms: number) => Promise<void>
  fetchImpl: FetchLike
  keep?: (item: PreparedSend) => Promise<boolean>
  maxAttempts?: number
}): Promise<BatchResult[]> {
  const size = Math.min(MAX_BATCH, Math.max(1, Math.floor(input.batchSize) || 1))
  const attempts = input.maxAttempts ?? DEFAULT_ATTEMPTS
  const results: BatchResult[] = []
  let posted = 0
  for (let index = 0; index < input.prepared.length; index += size) {
    const chunk = input.prepared.slice(index, index + size)
    const batchNo = Math.floor(index / size) + 1
    if (posted > 0 && input.pauseMs > 0) await input.sleep(input.pauseMs)
    const kept: PreparedSend[] = []
    for (const item of chunk) {
      if (input.keep && !(await input.keep(item))) continue
      kept.push(item)
    }
    if (kept.length === 0) continue
    const idempotencyKey = await batchIdempotencyKey(input.mode, kept.map((item) => item.sendId))
    let status = 0
    let ids = kept.map(() => '')
    let ok = false
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const response = await input.fetchImpl(BULK_BATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(kept.map((item) => item.message)),
      })
      status = response.status
      if (status === 429 && attempt < attempts) {
        await input.sleep(retryAfterMs(response.headers, input.now()))
        continue
      }
      if (status >= 200 && status < 300) {
        ids = messageIds(await response.json(), kept.length)
        ok = true
      }
      break
    }
    posted += 1
    results.push({
      batchNo,
      idempotencyKey,
      ok,
      status,
      rows: kept.map((item, row) => ({ sendId: item.sendId, providerId: ok ? ids[row] || '' : '' })),
    })
  }
  return results
}

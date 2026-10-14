import { emailDomain } from './email_domains.ts'
import { FROM_NAME, ONE_CLICK_BODY, renderBulkLetter } from './bulk_mail_copy.ts'

export const BULK_BATCH_URL = 'https://api.resend.com/emails/batch'

/** Newsletter uses news. Transactional and security use mail. Names come from config. */
export type MailStream = 'news' | 'mail'

export type StreamEnv = {
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  RESEND_API_KEY_NEWS?: string
  EMAIL_FROM_NEWS?: string
  RESEND_API_KEY_MAIL?: string
  EMAIL_FROM_MAIL?: string
  RESEND_API_KEY_NEWS_TRACKED?: string
  EMAIL_FROM_NEWS_TRACKED?: string
  EMAIL_SENDING_PARENT?: string
}

/** Empty when EMAIL_SENDING_PARENT is unset. The guard then refuses every From. */
export function sendingParent(value: string | undefined): string {
  const parent = (value || '').trim().toLowerCase().replace(/\.$/, '')
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(parent)) return ''
  if (parent.includes('..')) return ''
  return parent
}

/** Tracked news only when the member opted in and both tracked env values are set. Otherwise the untracked news sender. */
export function resolveNewsCopy(env: StreamEnv, measure: boolean): { apiKey: string; fromMailbox: string; tracked: boolean } {
  const plain = resolveMailStream('news', env)
  if (!measure) return { ...plain, tracked: false }
  const apiKey = (env.RESEND_API_KEY_NEWS_TRACKED || '').trim()
  const fromMailbox = guardedMailbox(env.EMAIL_FROM_NEWS_TRACKED || '', sendingParent(env.EMAIL_SENDING_PARENT))
  if (!apiKey || !fromMailbox) return { ...plain, tracked: false }
  return { apiKey, fromMailbox, tracked: true }
}

export function applyNewsTracking(message: OutboundMessage, tracked: boolean): OutboundMessage {
  if (tracked) return message
  return { ...message, open_tracking: false, click_tracking: false }
}

/** News may fall back to the original names. Mail does not. A root, foreign, or unconfigured parent blanks the From. */
export function resolveMailStream(stream: MailStream, env: StreamEnv): { apiKey: string; fromMailbox: string } {
  const parent = sendingParent(env.EMAIL_SENDING_PARENT)
  if (stream === 'mail') {
    return {
      apiKey: (env.RESEND_API_KEY_MAIL || '').trim(),
      fromMailbox: guardedMailbox(env.EMAIL_FROM_MAIL || '', parent),
    }
  }
  return {
    apiKey: (env.RESEND_API_KEY_NEWS || env.RESEND_API_KEY || '').trim(),
    fromMailbox: guardedMailbox(env.EMAIL_FROM_NEWS || env.EMAIL_FROM || '', parent),
  }
}

export function sendingFromAllowed(mailbox: string, parentValue: string | undefined): boolean {
  const parent = sendingParent(parentValue)
  const domain = emailDomain(cleanMailbox(mailbox))
  if (!domain || !parent || domain === parent) return false
  return domain.endsWith(`.${parent}`)
}

/** Reply-To may be the root inbox. It is not a From address, so the subdomain guard does not apply. */
export function replyMailbox(value: string): string {
  return cleanMailbox(value)
}

function guardedMailbox(value: string, parent: string): string {
  const mailbox = cleanMailbox(value)
  return sendingFromAllowed(mailbox, parent) ? mailbox : ''
}

export type PauseRates = {
  delivered: number
  complaints: number
  bounces: number
}

/** 0.1% complaints or 4% bounces, and only once at least 100 messages are delivered. */
export function pauseDecision(rates: PauseRates): { pause: boolean; reason: '' | 'complaint_rate' | 'bounce_rate' } {
  const delivered = Math.floor(rates.delivered)
  const complaints = Math.floor(rates.complaints)
  const bounces = Math.floor(rates.bounces)
  if (!Number.isFinite(delivered) || delivered < 100) return { pause: false, reason: '' }
  if (complaints * 1000 >= delivered) return { pause: true, reason: 'complaint_rate' }
  if (bounces * 25 >= delivered) return { pause: true, reason: 'bounce_rate' }
  return { pause: false, reason: '' }
}
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
  headers?: OutboundHeaders
  open_tracking?: false
  click_tracking?: false
}

export type PreparedSend = {
  sendId: string
  userId: string
  hash: string
  message: OutboundMessage
  apiKey?: string
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

/** https token URL, plus a mailto only when one is configured. */
export function listUnsubscribeValue(pageUrl: string, mailto = ''): string {
  const https = `<${pageUrl}>`
  const box = cleanMailbox(mailto)
  if (!box) return https
  return `${https}, <mailto:${box}>`
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
  unsubMailto?: string
  test: boolean
}): OutboundMessage {
  const letter = renderBulkLetter({
    subject: headerValue(input.subject),
    preheader: input.preheader,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesUrl: input.preferencesUrl,
    contact: input.contactEmail,
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
      'List-Unsubscribe': listUnsubscribeValue(input.oneClickUrl, input.unsubMailto),
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

function postedMessage(message: OutboundMessage, stream: MailStream): OutboundMessage {
  if (stream !== 'mail') return message
  return {
    from: message.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    reply_to: message.reply_to,
    open_tracking: false,
    click_tracking: false,
  }
}

export async function deliverBatches(input: {
  campaignId: string
  mode: 'test' | 'live'
  prepared: PreparedSend[]
  batchSize: number
  pauseMs: number
  apiKey: string
  stream?: MailStream
  now: () => number
  sleep: (ms: number) => Promise<void>
  fetchImpl: FetchLike
  keep?: (item: PreparedSend) => Promise<boolean>
  maxAttempts?: number
  rateCheck?: () => Promise<PauseRates | null>
  onPause?: (reason: 'complaint_rate' | 'bounce_rate') => Promise<void>
  sendingParent?: string
}): Promise<BatchResult[]> {
  const stream = input.stream ?? 'news'
  const size = Math.min(MAX_BATCH, Math.max(1, Math.floor(input.batchSize) || 1))
  const attempts = input.maxAttempts ?? DEFAULT_ATTEMPTS
  const results: BatchResult[] = []
  let posted = 0
  let stopped = false
  const honourRates = async (): Promise<'ok' | 'pause' | 'error'> => {
    if (!input.rateCheck) return 'ok'
    const rates = await input.rateCheck()
    if (!rates) return 'error'
    const decision = pauseDecision(rates)
    if (!decision.pause) return 'ok'
    if (input.onPause) await input.onPause(decision.reason)
    return 'pause'
  }
  const failRemainder = (fromIndex: number, batchNo: number) => {
    const rest = input.prepared.slice(fromIndex)
    if (rest.length === 0) return
    results.push({
      batchNo,
      idempotencyKey: 'rate_check',
      ok: false,
      status: 503,
      rows: rest.map((item) => ({ sendId: item.sendId, providerId: '' })),
    })
  }
  for (let index = 0; index < input.prepared.length; index += size) {
    const chunk = input.prepared.slice(index, index + size)
    const batchNo = Math.floor(index / size) + 1
    const rate = await honourRates()
    if (rate === 'error') {
      failRemainder(index, batchNo)
      stopped = true
      break
    }
    if (rate === 'pause') {
      stopped = true
      break
    }
    if (posted > 0 && input.pauseMs > 0) await input.sleep(input.pauseMs)
    const kept: PreparedSend[] = []
    for (const item of chunk) {
      if (input.keep && !(await input.keep(item))) continue
      kept.push(item)
    }
    if (kept.length === 0) continue
    if (kept.some((item) => !sendingFromAllowed(cleanMailbox(item.message.from), input.sendingParent) || !replyMailbox(item.message.reply_to))) {
      results.push({
        batchNo,
        idempotencyKey: 'refused',
        ok: false,
        status: 503,
        rows: kept.map((item) => ({ sendId: item.sendId, providerId: '' })),
      })
      stopped = true
      break
    }
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
        body: JSON.stringify(kept.map((item) => postedMessage(item.message, stream))),
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
  if (!stopped && posted > 0) {
    const rate = await honourRates()
    if (rate === 'error') stopped = true
  }
  return results
}

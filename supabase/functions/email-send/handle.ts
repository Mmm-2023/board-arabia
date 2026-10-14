import { digestIssueSendable } from '../_shared/weekly_digest_copy.ts'
import {
  addressHash,
  applyNewsTracking,
  buildOutbound,
  cleanMailbox,
  deliverBatches,
  httpsOrigin,
  memberLinks,
  resolveMailStream,
  resolveNewsCopy,
  type BatchResult,
  type PauseRates,
  type PreparedSend,
  type StreamEnv,
} from '../_shared/bulk_mail.ts'

export type SendMode = 'test' | 'live'

export type SendGate = {
  found: boolean
  status: string
  kind: string
  category: string
  subject: string
  preheader: string
  body_text: string
  body_html: string
  master_enabled: boolean
  batch_size: number
  batch_pause_ms: number
  issue_status: string | null
  issue_mail_ready: boolean
  issue_send_enabled: boolean
  content_hash: string | null
  test_content_hash: string | null
  test_sent_by: string | null
}

export type SendRecipient = {
  userId: string
  address: string
  unsubscribeToken: string
  measure?: boolean
}

export type LogSendInput = {
  campaignId: string
  userId: string | null
  emailHash: string
  isTest: boolean
  status: 'queued' | 'skipped' | 'sent' | 'failed'
  skipReason: string | null
  providerMessageId: string | null
  sendId: string | null
}

export type LogSendResult = {
  ok: boolean
  id?: string
  status?: string
  send?: boolean
}

export type SendDeps = {
  role: 'staff' | 'master'
  userId: string
  staffAddress: string
  apiKey: string
  fromAddress: string
  newsApiKey?: string
  newsFrom?: string
  trackedApiKey?: string
  trackedFrom?: string
  contactEmail: string
  siteOrigin: string
  functionsOrigin: string
  streamEnv?: StreamEnv
  unsubMailto?: string
  rateCheck?: (campaignId: string) => Promise<PauseRates | null>
  applyPause?: (campaignId: string, reason: 'complaint_rate' | 'bounce_rate') => Promise<void>
  now: () => number
  sleep: (ms: number) => Promise<void>
  fetchImpl: Parameters<typeof deliverBatches>[0]['fetchImpl']
  loadGate: (campaignId: string) => Promise<SendGate | null>
  loadRecipients: (campaignId: string) => Promise<SendRecipient[]>
  isSuppressed: (emailHash: string) => Promise<boolean>
  logSend: (row: LogSendInput) => Promise<LogSendResult>
  setProgress: (campaignId: string, status: 'sending' | 'sent') => Promise<boolean>
  markTest?: (campaignId: string) => Promise<boolean>
  setMeasure?: (sendId: string, measure: boolean) => Promise<void>
}

export type SendResult = {
  status: number
  body: { ok: boolean; error?: string; mode?: SendMode; sent?: number; skipped?: number; failed?: number }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function newsEnv(deps: SendDeps): StreamEnv {
  const stream = deps.streamEnv
  return {
    RESEND_API_KEY: stream?.RESEND_API_KEY || deps.apiKey,
    EMAIL_FROM: stream?.EMAIL_FROM || deps.fromAddress,
    RESEND_API_KEY_NEWS: deps.newsApiKey || stream?.RESEND_API_KEY_NEWS,
    EMAIL_FROM_NEWS: deps.newsFrom || stream?.EMAIL_FROM_NEWS,
    RESEND_API_KEY_NEWS_TRACKED: deps.trackedApiKey || stream?.RESEND_API_KEY_NEWS_TRACKED,
    EMAIL_FROM_NEWS_TRACKED: deps.trackedFrom || stream?.EMAIL_FROM_NEWS_TRACKED,
    RESEND_API_KEY_MAIL: stream?.RESEND_API_KEY_MAIL,
    EMAIL_FROM_MAIL: stream?.EMAIL_FROM_MAIL,
  }
}

function fail(status: number, error: string): SendResult {
  return { status, body: { ok: false, error } }
}

export function parseSendBody(raw: unknown): { campaignId: string; mode: SendMode } | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as { campaign_id?: unknown; mode?: unknown }
  if (typeof body.campaign_id !== 'string' || !UUID.test(body.campaign_id)) return null
  if (body.mode !== 'test' && body.mode !== 'live') return null
  return { campaignId: body.campaign_id, mode: body.mode }
}

function configured(deps: SendDeps): {
  fromMailbox: string
  apiKey: string
  contact: string
  site: string
  functions: string
  unsubMailto: string
} | null {
  const resolved = resolveMailStream('news', deps.streamEnv ?? {
    RESEND_API_KEY: deps.apiKey,
    EMAIL_FROM: deps.fromAddress,
  })
  const fromMailbox = resolved.fromMailbox
  const apiKey = resolved.apiKey
  const contact = cleanMailbox(deps.contactEmail)
  const site = httpsOrigin(deps.siteOrigin)
  const functions = httpsOrigin(deps.functionsOrigin)
  const unsubMailto = cleanMailbox(deps.unsubMailto || '')
  if (!apiKey || !fromMailbox || !contact || !site || !functions) return null
  return { fromMailbox, apiKey, contact, site, functions, unsubMailto }
}

export async function handleEmailSend(raw: unknown, deps: SendDeps): Promise<SendResult> {
  const parsed = parseSendBody(raw)
  if (!parsed) return fail(400, 'invalid_body')
  if (parsed.mode === 'live' && deps.role !== 'master') return fail(403, 'not_allowed')

  const gate = await deps.loadGate(parsed.campaignId)
  if (!gate || !gate.found) return fail(404, 'not_found')
  if (parsed.mode === 'live') {
    const release = liveReleaseAllowed(gate, deps.userId)
    if (release !== 'ok') return fail(409, release)
  }
  if (parsed.mode === 'live' && gate.kind === 'digest') {
    const sendable = digestIssueSendable({
      status: gate.issue_status || '',
      sendEnabled: gate.issue_send_enabled === true,
      mailReady: gate.issue_mail_ready === true,
    })
    if (!sendable) return fail(409, 'not_sendable')
  }

  const settings = configured(deps)
  if (!settings) return fail(503, 'not_configured')

  if (parsed.mode === 'live') {
    const started = await deps.setProgress(parsed.campaignId, 'sending')
    if (!started) return fail(409, 'not_tested')
  }

  const staff = cleanMailbox(deps.staffAddress)
  if (parsed.mode === 'test' && !staff) return fail(503, 'not_configured')

  const recipients = parsed.mode === 'test'
    ? [{ userId: deps.userId, address: staff, unsubscribeToken: '' }]
    : await deps.loadRecipients(parsed.campaignId)

  const queued: PreparedSend[] = []
  let skipped = 0
  let failed = 0
  const hashes = new Map<string, string>()

  for (const recipient of recipients) {
    const address = cleanMailbox(recipient.address)
    if (!address) {
      skipped += 1
      continue
    }
    const hash = await addressHash(address)
    const token = parsed.mode === 'test' ? recipient.unsubscribeToken || 'preview' : recipient.unsubscribeToken
    if (parsed.mode === 'live' && !token) {
      skipped += 1
      continue
    }
    const links = memberLinks({
      siteOrigin: settings.site,
      functionsOrigin: settings.functions,
      token,
    })
    const opened = await deps.logSend({
      campaignId: parsed.campaignId,
      userId: recipient.userId,
      emailHash: hash,
      isTest: parsed.mode === 'test',
      status: 'queued',
      skipReason: null,
      providerMessageId: null,
      sendId: null,
    })
    if (!opened.ok || !opened.id) {
      failed += 1
      continue
    }
    if (opened.send === false) {
      skipped += 1
      continue
    }
    hashes.set(opened.id, hash)
    const sender = resolveNewsCopy(newsEnv(deps), parsed.mode === 'live' && recipient.measure === true)
    if (deps.setMeasure && parsed.mode === 'live') await deps.setMeasure(opened.id, sender.tracked)
    queued.push({
      sendId: opened.id,
      userId: recipient.userId,
      hash,
      apiKey: sender.apiKey,
      message: applyNewsTracking(buildOutbound({
        fromMailbox: sender.fromMailbox,
        contactEmail: settings.contact,
        to: address,
        subject: gate.subject,
        preheader: gate.preheader,
        bodyText: gate.body_text,
        bodyHtml: gate.body_html,
        unsubscribeUrl: links.unsubscribeUrl,
        preferencesUrl: links.preferencesUrl,
        oneClickUrl: links.oneClickUrl,
        unsubMailto: settings.unsubMailto,
        test: parsed.mode === 'test',
      }), sender.tracked),
    })
  }

  let paused = false
  const results: BatchResult[] = []
  const groups = new Map<string, PreparedSend[]>()
  for (const item of queued) {
    const key = item.apiKey || settings.apiKey
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }
  for (const [apiKey, prepared] of groups) {
    results.push(...await deliverBatches({
      campaignId: parsed.campaignId,
      mode: parsed.mode,
      stream: 'news',
      prepared,
      batchSize: parsed.mode === 'test' ? 1 : gate.batch_size,
      pauseMs: parsed.mode === 'test' ? 0 : gate.batch_pause_ms,
      apiKey,
      now: deps.now,
      sleep: deps.sleep,
      fetchImpl: deps.fetchImpl,
      rateCheck: parsed.mode === 'live' && deps.rateCheck
        ? () => deps.rateCheck!(parsed.campaignId)
        : undefined,
      onPause: async (reason) => {
        paused = true
        if (deps.applyPause) await deps.applyPause(parsed.campaignId, reason)
      },
      keep: async (item) => {
        if (parsed.mode !== 'live') return true
        if (!(await deps.isSuppressed(item.hash))) return true
        await deps.logSend({
          campaignId: parsed.campaignId,
          userId: item.userId,
          emailHash: item.hash,
          isTest: false,
          status: 'skipped',
          skipReason: 'suppressed',
          providerMessageId: null,
          sendId: item.sendId,
        })
        skipped += 1
        return false
      },
    }))
  }

  let sent = 0
  for (const result of results) {
    for (const row of result.rows) {
      const hash = hashes.get(row.sendId) || ''
      const userId = queued.find((item) => item.sendId === row.sendId)?.userId || null
      if (result.ok && row.providerId) {
        await deps.logSend({
          campaignId: parsed.campaignId,
          userId,
          emailHash: hash,
          isTest: parsed.mode === 'test',
          status: 'sent',
          skipReason: null,
          providerMessageId: row.providerId,
          sendId: row.sendId,
        })
        sent += 1
      } else {
        await deps.logSend({
          campaignId: parsed.campaignId,
          userId,
          emailHash: hash,
          isTest: parsed.mode === 'test',
          status: 'failed',
          skipReason: result.status === 429 ? 'rate_limited' : 'provider_error',
          providerMessageId: null,
          sendId: row.sendId,
        })
        failed += 1
      }
    }
  }

  if (parsed.mode === 'live' && !paused) {
    await deps.setProgress(parsed.campaignId, failed > 0 ? 'sending' : 'sent')
  }
  if (parsed.mode === 'test' && deps.role === 'master' && sent > 0 && failed === 0 && deps.markTest) {
    const stamped = await deps.markTest(parsed.campaignId)
    if (!stamped) return fail(500, 'test_not_recorded')
  }

  return { status: 200, body: { ok: true, mode: parsed.mode, sent, skipped, failed } }
}

/** Single release rule. The owner is the caller user id, matched to test_sent_by. */
export function liveReleaseAllowed(gate: SendGate, ownerId: string): 'ok' | 'master_off' | 'not_tested' | 'paused' {
  if (gate.status === 'paused') return 'paused'
  if (gate.master_enabled !== true) return 'master_off'
  if (gate.status !== 'test_sent' && gate.status !== 'sending') return 'not_tested'
  if (!ownerId || gate.test_sent_by !== ownerId) return 'not_tested'
  if (!gate.content_hash || gate.content_hash !== gate.test_content_hash) return 'not_tested'
  return 'ok'
}

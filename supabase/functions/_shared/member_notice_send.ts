import {
  deliverBatches,
  type MailStream,
  type OutboundMessage,
  type PreparedSend,
  resolveMailStream,
  type StreamEnv,
} from './bulk_mail.ts'
import { FROM_NAME } from './bulk_mail_copy.ts'

export const MEMBER_NOTICE_STREAM: MailStream = 'mail'

export type NoticeToSend = {
  outboxId: string
  typeKey: string
  userId: string
  refId: string
  address: string
  subject: string
  text: string
  html: string
  essential: boolean
  unsubscribeUrl: string | null
}

export type NoticeSendResult = {
  sent: number
  skipped: number
  failed: number
  calls: number
  blocked: '' | 'master_off' | 'not_configured'
  outcomes: Array<{ outboxId: string; status: 'sent' | 'failed' | 'skipped'; reason: string; providerMessageId: string }>
}

export function noticeStreamConfig(env: StreamEnv) {
  return resolveMailStream(MEMBER_NOTICE_STREAM, env)
}

function noticeMessage(notice: NoticeToSend, fromMailbox: string, replyTo: string): OutboundMessage {
  return {
    from: `"${FROM_NAME}" <${fromMailbox}>`,
    to: [notice.address],
    reply_to: replyTo,
    subject: notice.subject,
    text: notice.text,
    html: notice.html,
  }
}

/** Drain one explicit batch through the shared sender. The mail stream has tracking off. */
export async function deliverMemberNotices(input: {
  notices: NoticeToSend[]
  masterEnabled: boolean
  batchSize: number
  pauseMs: number
  apiKey: string
  fromMailbox: string
  replyTo: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}): Promise<NoticeSendResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const outcomes: NoticeSendResult['outcomes'] = []
  if (!input.masterEnabled) {
    for (const notice of input.notices) {
      outcomes.push({ outboxId: notice.outboxId, status: 'skipped', reason: 'master_off', providerMessageId: '' })
    }
    return { sent: 0, skipped: input.notices.length, failed: 0, calls: 0, blocked: 'master_off', outcomes }
  }
  if (!input.apiKey.trim() || !input.fromMailbox.trim() || !input.replyTo.trim()) {
    return { sent: 0, skipped: 0, failed: 0, calls: 0, blocked: 'not_configured', outcomes }
  }
  const prepared: PreparedSend[] = []
  let skipped = 0
  for (const notice of input.notices) {
    if (!notice.address.trim()) {
      skipped += 1
      outcomes.push({ outboxId: notice.outboxId, status: 'skipped', reason: 'no_address', providerMessageId: '' })
      continue
    }
    prepared.push({
      sendId: `${notice.typeKey}:${notice.refId}:${notice.userId}`,
      userId: notice.userId,
      hash: notice.outboxId,
      message: noticeMessage(notice, input.fromMailbox, input.replyTo),
    })
  }
  let calls = 0
  const results = await deliverBatches({
    campaignId: 'member-notices',
    mode: 'live',
    prepared,
    batchSize: input.batchSize,
    pauseMs: input.pauseMs,
    apiKey: input.apiKey,
    stream: MEMBER_NOTICE_STREAM,
    now: () => Date.now(),
    sleep,
    fetchImpl: async (url, init) => {
      calls += 1
      const response = await fetchImpl(url, init)
      return {
        status: response.status,
        headers: { get: (name) => response.headers.get(name) },
        json: () => response.json(),
      }
    },
  })
  const bySend = new Map(prepared.map((item) => [item.sendId, item]))
  let sent = 0
  let failed = 0
  for (const batch of results) {
    for (const row of batch.rows) {
      const item = bySend.get(row.sendId)
      const outboxId = item?.hash || ''
      if (batch.ok) {
        sent += 1
        outcomes.push({ outboxId, status: 'sent', reason: '', providerMessageId: row.providerId })
      } else {
        failed += 1
        outcomes.push({ outboxId, status: 'failed', reason: `provider_${batch.status}`, providerMessageId: '' })
      }
    }
  }
  return { sent, skipped, failed, calls, blocked: '', outcomes }
}

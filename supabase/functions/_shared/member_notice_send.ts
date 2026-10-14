export const MEMBER_NOTICE_PROVIDER_URL = 'https://api.resend.com/emails'

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

function pauseOf(header: string | null, fallbackMs: number): number {
  const raw = header?.trim() || ''
  if (!raw) return fallbackMs
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.round(seconds * 1000), 10_000)
  const stamp = Date.parse(raw)
  if (Number.isFinite(stamp)) return Math.min(Math.max(stamp - Date.now(), 0), 10_000)
  return fallbackMs
}

function listHeaders(notice: NoticeToSend, replyTo: string): Record<string, string> | undefined {
  if (notice.essential || !notice.unsubscribeUrl) return undefined
  return {
    'List-Unsubscribe': `<${notice.unsubscribeUrl}>, <mailto:${replyTo}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

async function postOne(
  notice: NoticeToSend,
  input: {
    apiKey: string
    fromMailbox: string
    replyTo: string
    fetchImpl: typeof fetch
    sleep: (ms: number) => Promise<void>
  },
  calls: { n: number },
): Promise<{ status: 'sent' | 'failed'; reason: string; providerMessageId: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.apiKey}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': `${notice.typeKey}:${notice.refId}:${notice.userId}`,
  }
  const body = JSON.stringify({
    from: `Board Arabia <${input.fromMailbox}>`,
    to: [notice.address],
    reply_to: input.replyTo,
    subject: notice.subject,
    text: notice.text,
    html: notice.html,
    headers: listHeaders(notice, input.replyTo),
  })
  let attempt = 0
  while (attempt < 3) {
    attempt += 1
    calls.n += 1
    const response = await input.fetchImpl(MEMBER_NOTICE_PROVIDER_URL, { method: 'POST', headers, body })
    if (response.status === 429) {
      const wait = pauseOf(response.headers.get('retry-after') || response.headers.get('x-ratelimit-reset'), 1000)
      await input.sleep(wait)
      continue
    }
    if (response.ok) {
      let providerMessageId = ''
      try {
        const payload = (await response.json()) as { id?: string }
        providerMessageId = typeof payload.id === 'string' ? payload.id : ''
      } catch {
        providerMessageId = ''
      }
      return { status: 'sent', reason: '', providerMessageId }
    }
    return { status: 'failed', reason: `provider_${response.status}`, providerMessageId: '' }
  }
  return { status: 'failed', reason: 'provider_429', providerMessageId: '' }
}

/** Drain one explicit batch. Master off and a missing key do not call the provider. */
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
  const batchSize = Math.min(100, Math.max(1, input.batchSize || 50))
  const pauseMs = Math.max(0, input.pauseMs)
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
  const calls = { n: 0 }
  let sent = 0
  let skipped = 0
  let failed = 0
  for (let index = 0; index < input.notices.length; index += batchSize) {
    const batch = input.notices.slice(index, index + batchSize)
    for (const notice of batch) {
      if (!notice.address.trim()) {
        skipped += 1
        outcomes.push({ outboxId: notice.outboxId, status: 'skipped', reason: 'no_address', providerMessageId: '' })
        continue
      }
      const result = await postOne(notice, { ...input, fetchImpl, sleep }, calls)
      if (result.status === 'sent') sent += 1
      else failed += 1
      outcomes.push({ outboxId: notice.outboxId, ...result })
    }
    if (index + batchSize < input.notices.length) await sleep(pauseMs)
  }
  return { sent, skipped, failed, calls: calls.n, blocked: '', outcomes }
}

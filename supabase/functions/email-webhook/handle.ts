import { addressHash } from '../_shared/bulk_mail.ts'
import { verifySvix, type SvixHeaders } from './verify.ts'

export type ProviderCall = {
  messageId: string
  type: string
  emailHash: string
  url: string | null
  occurredAt: string | null
}

function recordOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function clickUrl(value: string): string | null {
  if (!value || value.length > 2000) return null
  if (!/^https?:\/\//i.test(value)) return null
  if (/[\s\u0000-\u001f]/.test(value)) return null
  return value
}

export function eventTime(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

function addresses(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : []
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

export type ParsedProviderEvent = {
  messageId: string
  type: string
  addresses: string[]
  url: string | null
  occurredAt: string | null
}

export function parseProviderBody(raw: string): ParsedProviderEvent[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  const body = recordOf(parsed)
  const data = recordOf(body.data)
  const messageId = text(data.email_id)
  const to = addresses(data.to)
  const created = eventTime(body.created_at) || eventTime(data.created_at)
  const kind = text(body.type)
  if (!messageId || !kind) return []

  if (kind === 'email.bounced') {
    const bounce = recordOf(data.bounce)
    const bounceType = text(bounce.type)
    const type = /permanent|hard/i.test(bounceType) ? 'hard_bounce' : 'soft_bounce'
    return [{ messageId, type, addresses: to, url: null, occurredAt: created }]
  }
  if (kind === 'email.clicked') {
    const click = recordOf(data.click)
    return [{
      messageId,
      type: 'clicked',
      addresses: to,
      url: clickUrl(text(click.link) || text(click.url)),
      occurredAt: eventTime(click.timestamp) || created,
    }]
  }
  if (kind === 'email.opened') {
    const open = recordOf(data.open)
    return [{
      messageId,
      type: 'opened',
      addresses: to,
      url: null,
      occurredAt: eventTime(open.timestamp) || created,
    }]
  }
  const mapped: Record<string, string> = {
    'email.delivered': 'delivered',
    'email.complained': 'complaint',
    'email.delivery_delayed': 'delivery_delayed',
  }
  const type = mapped[kind]
  if (!type) return []
  return [{ messageId, type, addresses: to, url: null, occurredAt: created }]
}

export async function handleWebhook(input: {
  secret: string
  headers: SvixHeaders
  body: string
  nowMs: number
  record: (event: ProviderCall) => Promise<void>
}): Promise<{ status: number; wrote: number }> {
  const valid = await verifySvix({
    secret: input.secret,
    headers: input.headers,
    body: input.body,
    nowMs: input.nowMs,
  })
  if (!valid) return { status: 401, wrote: 0 }

  const events = parseProviderBody(input.body)
  let wrote = 0
  for (const event of events) {
    if (event.addresses.length === 0) continue
    for (const address of event.addresses) {
      await input.record({
        messageId: event.messageId,
        type: event.type,
        emailHash: await addressHash(address),
        url: event.type === 'clicked' ? event.url : null,
        occurredAt: event.occurredAt,
      })
      wrote += 1
    }
  }
  return { status: 204, wrote }
}

/**
 * Admin queue alerts from GMAIL_FROM to ADMIN_NOTIFY_EMAIL.
 *
 * One helper, called from each request path that lands work for staff.
 * A database trigger is a worse fit: this repo does not use pg_net, and a
 * trigger that calls the network can slow or fail the member's transaction.
 * deliverAdminAlert does not wait, and notifyAdmin never throws.
 * If ADMIN_NOTIFY_EMAIL or any of GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and
 * GMAIL_REFRESH_TOKEN is unset, nothing is sent and a warning is logged.
 */

import { adminNotifyEmail, boardMail, publicSite, sendEmail } from './mail.ts'

export const ADMIN_ALERT_TIMEOUT_MS = 2000

const OAUTH_SECRETS = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'] as const

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type AdminAlertKind = 'member' | 'sponsor' | 'applicant'

export type AdminAlertInput = {
  requesterName: string
  requesterKind: AdminAlertKind
  requested: string
  item: string
  approvePath: string
  occurredAt?: Date
}

export type AdminAlertOutcome = {
  status: 'sent' | 'skipped' | 'error'
  detail: string
}

type AlertSource = AdminAlertInput | (() => Promise<AdminAlertInput>)

let tail: Promise<void> = Promise.resolve()

function readEnv(name: string): string {
  const runtime = globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }
  const fromDeno = runtime.Deno?.env?.get?.(name)
  if (fromDeno && fromDeno.trim()) return fromDeno.trim()
  const fromNode = typeof process !== 'undefined' ? process.env?.[name] : undefined
  return fromNode?.trim() || ''
}

/** Secret names that are missing. Values are never returned. */
export function missingAdminAlertSecrets(): string[] {
  const missing: string[] = []
  if (!adminNotifyEmail()) missing.push('ADMIN_NOTIFY_EMAIL')
  for (const name of OAUTH_SECRETS) {
    if (!readEnv(name)) missing.push(name)
  }
  return missing
}

export function formatRiyadhStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || ''
  const month = MONTHS[Number(pick('month')) - 1] || pick('month')
  return `${pick('day')} ${month} ${pick('year')}, ${pick('hour')}:${pick('minute')} AST (UTC+3)`
}

function clip(value: string, max = 180): string {
  const clean = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 3)}...`
}

function requesterKindLabel(kind: AdminAlertKind): string {
  if (kind === 'sponsor') return 'partner'
  return kind
}

function requesterLabel(input: AdminAlertInput): string {
  const name = clip(input.requesterName, 200)
  if (name) return name
  if (input.requesterKind === 'sponsor') return 'Partner'
  if (input.requesterKind === 'applicant') return 'Applicant'
  return 'Member'
}

function approveUrl(path: string): string {
  const safe = path.startsWith('/admin') && !path.startsWith('//') ? path : '/admin'
  return `${publicSite()}${safe}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function formatAdminAlert(input: AdminAlertInput, now = input.occurredAt ?? new Date()): {
  subject: string
  text: string
  html: string
} {
  const name = requesterLabel(input)
  const kind = requesterKindLabel(input.requesterKind)
  const requested = clip(input.requested, 120) || 'an admin action'
  const item = clip(input.item, 180) || 'Item'
  const when = formatRiyadhStamp(now)
  const href = approveUrl(input.approvePath)
  const subject = clip(`Board Arabia: ${name} requested ${requested}`, 140)
  const letter = boardMail(
    [
      `${name} (${kind}) requested ${requested}.`,
      '',
      `Item: ${item}`,
      `Time: ${when}`,
      `Review: ${href}`,
    ].join('\n'),
    [
      `<p>${escapeHtml(name)} (${escapeHtml(kind)}) requested ${escapeHtml(requested)}.</p>`,
      `<p>Item: ${escapeHtml(item)}</p>`,
      `<p>Time: ${escapeHtml(when)}</p>`,
      `<p><a href="${escapeHtml(href)}">Open the admin page</a></p>`,
    ].join('\n'),
  )
  return { subject, text: letter.text, html: letter.html }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('admin alert timed out')), timeoutMs)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export async function notifyAdmin(
  input: AdminAlertInput,
  options?: { timeoutMs?: number; log?: (line: string) => void },
): Promise<AdminAlertOutcome> {
  const log = options?.log ?? ((line: string) => {
    console.warn(line)
  })
  try {
    const missing = missingAdminAlertSecrets()
    if (missing.length > 0) {
      const detail = `${missing.join(', ')} unset`
      log(`admin_alert warning: ${detail}`)
      return { status: 'skipped', detail }
    }
    const message = formatAdminAlert(input)
    const result = await withTimeout(
      sendEmail({
        to: adminNotifyEmail(),
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      options?.timeoutMs ?? ADMIN_ALERT_TIMEOUT_MS,
    )
    if (result.status !== 'sent') {
      const detail = quietDetail(result.detail || 'Admin alert was not sent.')
      log(`admin_alert warning: ${detail}`)
      return { status: 'error', detail }
    }
    return { status: 'sent', detail: '' }
  } catch (err) {
    const detail = quietDetail(err instanceof Error ? err.message : 'Admin alert failed.')
    log(`admin_alert warning: ${detail}`)
    return { status: 'error', detail }
  }
}

function quietDetail(detail: string): string {
  return detail.replace(/[\w.+-]+@[\w.-]+/g, '[redacted]').slice(0, 200)
}

/** Fire and forget. The returned value is the request result, unchanged. */
export function deliverAdminAlert<T>(
  result: T,
  source: AlertSource,
  notify: (input: AdminAlertInput) => Promise<AdminAlertOutcome> = notifyAdmin,
): T {
  const task = Promise.resolve()
    .then(async () => {
      const input = typeof source === 'function' ? await source() : source
      await notify(input)
    })
    .then(
      () => undefined,
      (err: unknown) => {
        const detail = err instanceof Error ? err.message : 'Admin alert failed.'
        console.warn(`admin_alert warning: ${detail}`)
      },
    )
  const current = tail
  tail = current.then(() => task).then(
    () => undefined,
    () => undefined,
  )
  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void }
  }).EdgeRuntime
  try {
    runtime?.waitUntil?.(task)
  } catch {
    // The task still runs. The request result is already decided.
  }
  return result
}

export function adminAlertSettled(): Promise<void> {
  return tail
}

/** Admitted-member LinkedIn share letter. Copy locked 29 Sep 2026.
 * The member publishes. We never post. Flags default off unless the exact string true.
 */

const NIGHT = '#1C1343'
const PORCELAIN = '#F6F5FB'
const INDIGO = '#4B3F9A'
const COPPER = '#B8896A'

export const ADMIT_LI_SHARE_EMAIL_FLAG = 'ADMIT_LI_SHARE_EMAIL_ENABLED'
export const ADMIT_LI_SHARE_HOME_CARD_FLAG = 'ADMIT_LI_SHARE_HOME_CARD_ENABLED'
export const ADMIT_LI_SHARE_REMINDER_FLAG = 'ADMIT_LI_SHARE_REMINDER_ENABLED'
export const ADMIT_LI_SHARE_DRYRUN_TO = 'ADMIT_LI_SHARE_DRYRUN_TO'
export const ADMIT_LI_SHARE_DRYRUN_FALLBACK = 'ADMIT_ALERT_TO'
export const ADMIT_LI_SHARE_REMINDER_SECRET = 'ADMIT_LI_SHARE_REMINDER_SECRET'

export const ADMIT_LI_SHARE_SUBJECT_TAIL = ', your Board Arabia seat is live'
export const ADMIT_LI_SHARE_PREHEADER = 'A short LinkedIn draft, written for you. Share it only if you want to.'
export const ADMIT_LI_SHARE_HEADING = 'Welcome to Board Arabia'
export const ADMIT_LI_SHARE_PREVIEW_LABEL = 'Your draft post'
export const ADMIT_LI_SHARE_BUTTON = 'Share on LinkedIn'
export const ADMIT_LI_SHARE_DASHBOARD_LABEL = 'Go to your dashboard'
export const ADMIT_LI_SHARE_SOFT =
  'Sharing is optional. If you prefer to keep your membership private, simply ignore this email.'
export const ADMIT_LI_SHARE_SIGN_OFF = 'The Board Arabia team'
export const ADMIT_LI_SHARE_FOOTER = 'Board Arabia. Private founding membership by review.'
export const ADMIT_LI_SHARE_FOOTER_LINE =
  'You received this because your seat was admitted. We never post to LinkedIn without you.'

export const ADMIT_LI_REMINDER_SUBJECT = 'Still useful: your Board Arabia LinkedIn draft'
export const ADMIT_LI_REMINDER_PREHEADER = 'One quiet reminder. Share only if you want to.'
export const ADMIT_LI_REMINDER_HEADING = 'Your draft is still here'
export const ADMIT_LI_SHARE_REMINDER_AFTER_MS = 3 * 24 * 60 * 60 * 1000

const FOUNDING_OPEN = 'I am honoured to be admitted as a Founding Member of Board Arabia.'
const NETWORK =
  'Board Arabia connects Saudi boardrooms with international counterparts. It brings together Chairpersons, Board members and C-suite executives around access to capital, business relationships and opening doors.'
const CLOSE = 'Membership is by review. Grateful for the trust.'
const SITE_LINE = 'boardarabia.com'
const BODY_TWO =
  'If you would like to mark the moment on LinkedIn, we have drafted a short post for you. Edit it freely. You publish it yourself; we never post on your behalf.'

const BLOCKED = /calendar\.app\.google|calendar\.google\.com|calendly\.com|nammco|sme marketer/i

export type EnvGet = (name: string) => string | undefined

type EnvSource = {
  get?: (key: string) => string | undefined
}

function readEnv(name: string): string | undefined {
  const runtime = globalThis as { Deno?: { env?: EnvSource } }
  const fromDeno = runtime.Deno?.env?.get?.(name)
  if (fromDeno) return fromDeno
  const fromNode = typeof process !== 'undefined' ? process.env?.[name] : undefined
  return fromNode || undefined
}

/** Only the exact string true turns a flag on. Unset, empty, and false stay off. */
export function envFlagOn(value: string | undefined | null): boolean {
  return value?.trim() === 'true'
}

export function admitLiShareEmailEnabled(env: EnvGet = readEnv): boolean {
  return envFlagOn(env(ADMIT_LI_SHARE_EMAIL_FLAG))
}

export function admitLiShareHomeCardEnabled(env: EnvGet = readEnv): boolean {
  return envFlagOn(env(ADMIT_LI_SHARE_HOME_CARD_FLAG))
}

export function admitLiShareReminderEnabled(env: EnvGet = readEnv): boolean {
  return envFlagOn(env(ADMIT_LI_SHARE_REMINDER_FLAG))
}

/** Staff dry-run mailbox. The request body is never a recipient. */
export function admitLiShareDryRunTo(env: EnvGet = readEnv): string | null {
  const dedicated = (env(ADMIT_LI_SHARE_DRYRUN_TO) || '').trim()
  const fallback = (env(ADMIT_LI_SHARE_DRYRUN_FALLBACK) || '').trim()
  const to = dedicated || fallback
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 320) return null
  return to
}

export function firstName(fullName: string | null | undefined): string {
  const token = oneLine(fullName || '').split(/\s+/).filter(Boolean)[0]
  return token || 'there'
}

/** ksa and intl are founding seats. The product label in this letter is Founding Member. */
export function shareSeat(seat: string): { seatLabel: string; founding: boolean } {
  if (seat === 'ksa' || seat === 'intl' || seat === 'Founding Member') {
    return { seatLabel: 'Founding Member', founding: true }
  }
  const seatLabel = oneLine(seat) || 'Member'
  return { seatLabel, founding: false }
}

/** Headline at company, or whichever side exists. Empty drops the line. */
export function roleLine(headline?: string | null, company?: string | null): string | null {
  const role = oneLine(headline || '')
  const firm = oneLine(company || '')
  if (role && firm) return `${role} at ${firm}`
  if (role) return role
  if (firm) return firm
  return null
}

export function linkedInPostText(input: {
  founding: boolean
  seatLabel: string
  headline?: string | null
  company?: string | null
}): string {
  const seatLabel = oneLine(input.seatLabel) || 'Member'
  const open = input.founding
    ? FOUNDING_OPEN
    : `I am honoured to join Board Arabia as a ${seatLabel}.`
  return paragraphs([open, roleLine(input.headline, input.company), NETWORK, CLOSE, SITE_LINE])
}

export function linkedInShareUrl(postBody: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(postBody)}`
}

export function isLinkedInShareUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    if (url.hostname !== 'www.linkedin.com') return false
    if (url.pathname !== '/feed/') return false
    if (url.searchParams.get('shareActive') !== 'true') return false
    return true
  } catch {
    return false
  }
}

export function isAdmitShareClickUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    if (url.username || url.password) return false
    if (!url.hostname.endsWith('.supabase.co')) return false
    if (!url.pathname.endsWith('/admit-li-share-go')) return false
    const token = url.searchParams.get('t') || ''
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return false
    return true
  } catch {
    return false
  }
}

export function admitShareClickUrl(clickBase: string, token: string): string | null {
  const base = clickBase.replace(/\/$/, '')
  if (!base.startsWith('https://') || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null
  const url = `${base}/admit-li-share-go?t=${encodeURIComponent(token)}`
  return isAdmitShareClickUrl(url) ? url : null
}

export function newAdmitShareToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function requestIsPrefetch(getHeader: (name: string) => string | null): boolean {
  const blob = ['purpose', 'sec-purpose', 'x-purpose', 'x-moz'].map((name) => getHeader(name) || '').join(' ')
  return /prefetch|preview/i.test(blob)
}

export function admitShareBrandBlocked(value: string): boolean {
  return BLOCKED.test(value)
}

export type AdmitLiMail = {
  subject: string
  preheader: string
  text: string
  html: string
  postText: string
  shareUrl: string
}

export function admitLiShareMail(input: {
  firstName: string
  seatLabel: string
  postText: string
  dashboardUrl: string
  shareUrl: string
  clickUrl?: string | null
}): AdmitLiMail {
  const name = oneLine(input.firstName) || 'there'
  const seatLabel = oneLine(input.seatLabel) || 'Member'
  const postText = input.postText.trim()
  const dashboardUrl = oneLine(input.dashboardUrl)
  const linked = isLinkedInShareUrl(input.shareUrl) ? input.shareUrl : linkedInShareUrl(postText)
  const shareUrl = input.clickUrl && isAdmitShareClickUrl(input.clickUrl) ? input.clickUrl : linked
  const subject = `${name}${ADMIT_LI_SHARE_SUBJECT_TAIL}`
  const bodyOne = `Your ${seatLabel} seat is live. You are now part of a private network connecting Saudi boardrooms with international counterparts: Chairpersons, Board members and C-suite executives.`
  const text = [
    ADMIT_LI_SHARE_HEADING,
    '',
    `Dear ${name},`,
    '',
    bodyOne,
    '',
    BODY_TWO,
    '',
    `${ADMIT_LI_SHARE_PREVIEW_LABEL}:`,
    '',
    postText,
    '',
    `${ADMIT_LI_SHARE_BUTTON}:`,
    shareUrl,
    '',
    `${ADMIT_LI_SHARE_DASHBOARD_LABEL}:`,
    dashboardUrl,
    '',
    ADMIT_LI_SHARE_SOFT,
    '',
    ADMIT_LI_SHARE_SIGN_OFF,
    '',
    ADMIT_LI_SHARE_FOOTER,
    ADMIT_LI_SHARE_FOOTER_LINE,
  ].join('\n')
  const html = letterHtml({
    preheader: ADMIT_LI_SHARE_PREHEADER,
    heading: ADMIT_LI_SHARE_HEADING,
    blocks: [
      `Dear ${escapeHtml(name)},`,
      escapeHtml(bodyOne),
      escapeHtml(BODY_TWO),
    ],
    postText,
    shareUrl,
    dashboardUrl,
    includeDashboard: true,
  })
  return { subject, preheader: ADMIT_LI_SHARE_PREHEADER, text, html, postText, shareUrl }
}

export function admitLiReminderBody(memberName: string, tier: string): string {
  const name = oneLine(memberName) || 'there'
  const seat = oneLine(tier) || 'Member'
  return `A single reminder, ${name}. Your ${seat} LinkedIn draft is ready if you want it. No pressure either way.`
}

export function admitLiReminderMail(input: {
  memberName: string
  tier: string
  postText: string
  shareUrl: string
  clickUrl?: string | null
}): AdmitLiMail {
  const postText = input.postText.trim()
  const linked = isLinkedInShareUrl(input.shareUrl) ? input.shareUrl : linkedInShareUrl(postText)
  const shareUrl = input.clickUrl && isAdmitShareClickUrl(input.clickUrl) ? input.clickUrl : linked
  const body = admitLiReminderBody(input.memberName, input.tier)
  const text = [
    ADMIT_LI_REMINDER_HEADING,
    '',
    body,
    '',
    `${ADMIT_LI_SHARE_PREVIEW_LABEL}:`,
    '',
    postText,
    '',
    `${ADMIT_LI_SHARE_BUTTON}:`,
    shareUrl,
    '',
    ADMIT_LI_SHARE_SOFT,
    '',
    ADMIT_LI_SHARE_SIGN_OFF,
    '',
    ADMIT_LI_SHARE_FOOTER,
    ADMIT_LI_SHARE_FOOTER_LINE,
  ].join('\n')
  const html = letterHtml({
    preheader: ADMIT_LI_REMINDER_PREHEADER,
    heading: ADMIT_LI_REMINDER_HEADING,
    blocks: [escapeHtml(body)],
    postText,
    shareUrl,
    dashboardUrl: '',
    includeDashboard: false,
  })
  return {
    subject: ADMIT_LI_REMINDER_SUBJECT,
    preheader: ADMIT_LI_REMINDER_PREHEADER,
    text,
    html,
    postText,
    shareUrl,
  }
}

export function admitLiShareSample(kind: 'share' | 'reminder'): AdmitLiMail {
  const postText = linkedInPostText({
    founding: true,
    seatLabel: 'Founding Member',
    headline: 'Operator',
    company: 'Example House',
  })
  const shareUrl = linkedInShareUrl(postText)
  if (kind === 'reminder') {
    return admitLiReminderMail({
      memberName: 'Layla',
      tier: 'Founding Member',
      postText,
      shareUrl,
    })
  }
  return admitLiShareMail({
    firstName: 'Layla',
    seatLabel: 'Founding Member',
    postText,
    dashboardUrl: 'https://boardarabia.com/dashboard',
    shareUrl,
  })
}

export type ShareDeliveryStatus = 'sent' | 'dry_run' | 'error' | 'skipped'

export async function sendDedicatedAdmitShare(opts: {
  enabled: boolean
  to: string
  firstName: string
  seatLabel: string
  founding: boolean
  headline?: string | null
  company?: string | null
  dashboardUrl: string
  clickBase: string
  claim: (input: { token: string; postText: string; seatLabel: string }) => Promise<{ token: string; postText: string } | null>
  release: () => Promise<void>
  send: (message: { to: string; subject: string; html: string; text: string }) => Promise<{ status: 'sent' | 'dry_run' | 'error'; detail?: string | null }>
}): Promise<{ status: ShareDeliveryStatus; subject: string; detail: string | null }> {
  const draft = linkedInPostText({
    founding: opts.founding,
    seatLabel: opts.seatLabel,
    headline: opts.headline,
    company: opts.company,
  })
  const preview = admitLiShareMail({
    firstName: opts.firstName,
    seatLabel: opts.seatLabel,
    postText: draft,
    dashboardUrl: opts.dashboardUrl,
    shareUrl: linkedInShareUrl(draft),
  })
  if (!opts.enabled) return { status: 'skipped', subject: preview.subject, detail: 'flag_off' }
  if (!opts.to) return { status: 'error', subject: preview.subject, detail: 'Missing recipient' }

  const token = newAdmitShareToken()
  const claimed = await opts.claim({ token, postText: draft, seatLabel: opts.seatLabel })
  if (!claimed?.token || !claimed.postText) {
    return { status: 'skipped', subject: preview.subject, detail: 'already_sent' }
  }

  const clickUrl = admitShareClickUrl(opts.clickBase, claimed.token)
  const mail = admitLiShareMail({
    firstName: opts.firstName,
    seatLabel: opts.seatLabel,
    postText: claimed.postText,
    dashboardUrl: opts.dashboardUrl,
    shareUrl: linkedInShareUrl(claimed.postText),
    clickUrl,
  })
  if (admitShareBrandBlocked(`${mail.subject}\n${mail.text}\n${mail.html}`)) {
    await opts.release()
    return { status: 'error', subject: mail.subject, detail: 'Invite blocked' }
  }
  const sent = await opts.send({ to: opts.to, subject: mail.subject, html: mail.html, text: mail.text })
  if (sent.status !== 'sent') await opts.release()
  return { status: sent.status, subject: mail.subject, detail: sent.detail ?? null }
}

export type AdmitShareReminderRow = {
  userId: string
  email: string | null
  sentAt: string | null
  clickedAt: string | null
  reminderSentAt: string | null
  suppressedAt: string | null
  optedOutAt: string | null
  status: string
}

/** One reminder, three days after the share email, only when the reminder flag is on. */
export function admitShareReminderDue(row: AdmitShareReminderRow, now: Date, enabled: boolean): boolean {
  if (!enabled) return false
  if (row.status !== 'invited' && row.status !== 'active') return false
  if (!row.email) return false
  if (row.clickedAt || row.reminderSentAt || row.suppressedAt || row.optedOutAt) return false
  if (!row.sentAt) return false
  const sent = Date.parse(row.sentAt)
  if (!Number.isFinite(sent)) return false
  if (sent > now.getTime() - ADMIT_LI_SHARE_REMINDER_AFTER_MS) return false
  return true
}

export type ReminderSendStatus = 'sent' | 'dry_run' | 'error'

export async function deliverAdmitShareReminders<T extends AdmitShareReminderRow>(opts: {
  enabled: boolean
  now: Date
  due: T[]
  claim: (row: T) => Promise<boolean> | boolean
  release: (row: T) => Promise<void> | void
  send: (row: T) => Promise<{ status: ReminderSendStatus }>
}): Promise<{ sent: number; failed: number; dryRun: boolean; skipped: number }> {
  if (!opts.enabled) return { sent: 0, failed: 0, dryRun: false, skipped: opts.due.length }
  let sent = 0
  let failed = 0
  let dryRun = false
  let skipped = 0
  for (const row of opts.due) {
    if (!admitShareReminderDue(row, opts.now, true)) {
      skipped += 1
      continue
    }
    const claimed = await opts.claim(row)
    if (!claimed) {
      skipped += 1
      continue
    }
    const result = await opts.send(row)
    if (result.status === 'sent') {
      sent += 1
      continue
    }
    await opts.release(row)
    if (result.status === 'dry_run') {
      dryRun = true
      break
    }
    failed += 1
  }
  return { sent, failed, dryRun, skipped }
}

function letterHtml(opts: {
  preheader: string
  heading: string
  blocks: string[]
  postText: string
  shareUrl: string
  dashboardUrl: string
  includeDashboard: boolean
}): string {
  const paragraphsHtml = opts.blocks
    .map(
      (block) =>
        `<p style="margin:0 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1C1343;">${block}</p>`,
    )
    .join('')
  const dashboard = opts.includeDashboard
    ? `<p style="margin:14px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;">
              <a href="${escapeHtml(opts.dashboardUrl)}" style="color:${INDIGO};text-decoration:underline;">${ADMIT_LI_SHARE_DASHBOARD_LABEL}</a>
            </p>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PORCELAIN};color:#1C1343;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PORCELAIN};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #DDD7EC;border-top:3px solid ${COPPER};">
          <tr>
            <td style="padding:28px 28px 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${INDIGO};">
              Board Arabia
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:26px;line-height:1.25;color:${NIGHT};">
              ${escapeHtml(opts.heading)}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 0;">
              ${paragraphsHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:4px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${INDIGO};">
              ${ADMIT_LI_SHARE_PREVIEW_LABEL}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 28px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PORCELAIN};border:1px solid #DDD7EC;">
                <tr>
                  <td style="padding:18px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1C1343;white-space:pre-wrap;">${escapeHtml(opts.postText)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 0;" align="left">
              <a href="${escapeHtml(opts.shareUrl)}" style="display:inline-block;background:${NIGHT};color:${PORCELAIN};text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:20px;padding:12px 22px;min-height:44px;">
                ${ADMIT_LI_SHARE_BUTTON}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;">
              ${dashboard}
              <p style="margin:14px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#5C5678;">
                ${ADMIT_LI_SHARE_SOFT}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1C1343;">
              ${ADMIT_LI_SHARE_SIGN_OFF}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#5C5678;">
              ${ADMIT_LI_SHARE_FOOTER}<br />
              ${ADMIT_LI_SHARE_FOOTER_LINE}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function paragraphs(parts: Array<string | null>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join('\n\n')
}

function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 500)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

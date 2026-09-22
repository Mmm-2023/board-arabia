import { boardMail } from './mail.ts'

/** Personal apply link. The token is the only secret in the URL. */
export function applyInviteUrl(site: string, token: string): string {
  const base = site.replace(/\/$/, '')
  return `${base}/apply?invite=${encodeURIComponent(token)}`
}

export function whatsAppInviteText(applyUrl: string): string {
  return [
    'You are invited to request consideration for Board Arabia.',
    'This personal link does not skip review:',
    applyUrl,
  ].join('\n')
}

/** wa.me with prefilled text. Phone is optional digits; without it the share sheet opens. */
export function whatsAppInviteUrl(phoneDigits: string | null, applyUrl: string): string {
  const phone = (phoneDigits || '').replace(/\D/g, '')
  const text = encodeURIComponent(whatsAppInviteText(applyUrl))
  if (phone) return `https://wa.me/${phone}?text=${text}`
  return `https://wa.me/?text=${text}`
}

/** Peer invite email. Board Arabia footer only. No booking link. */
export function peerInviteMail(
  applyUrl: string,
  inviterLabel: string,
): { subject: string; text: string; html: string } {
  const label = oneLine(inviterLabel) || 'A Board Arabia member'
  const safeUrl = oneLine(applyUrl)
  const sealed = boardMail(
    `Hello,

${label} invited you to request consideration for Board Arabia.

Open this personal link:

${safeUrl}

You will see who invited you, and you will be asked why you were invited. Then submit your credentials. An invitation does not skip review.

If the link does not work, you can still request consideration at https://boardarabia.com/apply.`,
    `<p>Hello,</p>
<p>${escapeHtml(label)} invited you to request consideration for Board Arabia.</p>
<p>Open this personal link:</p>
<p><a href="${escapeHtml(safeUrl)}">${escapeHtml(safeUrl)}</a></p>
<p>You will see who invited you, and you will be asked why you were invited. Then submit your credentials. An invitation does not skip review.</p>
<p>If the link does not work, you can still request consideration at <a href="https://boardarabia.com/apply">boardarabia.com/apply</a>.</p>`,
  )
  return { subject: 'Board Arabia: a personal invitation', ...sealed }
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

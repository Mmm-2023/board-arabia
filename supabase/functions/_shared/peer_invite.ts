/** Peer invite letter, WhatsApp share text, and the one 7-day reminder.
 * Copy is the locked 23 Sep 2026 sequence. Board Arabia footer only.
 */

const INDIGO = '#4b3f9a'
const COHORT_FOOTER = 'Board Arabia · Private founding cohort'

export const BENEFIT_LINES = [
  'Private directory of founding peers, when the cohort opens it',
  'Warm intros, when both sides agree',
  'Admin-gated capital mandates',
  'Private deal rooms for live conversations',
  'Founding cohort access, including majlis when scheduled',
] as const

export type InviterRef = {
  name: string
  headline?: string | null
  company?: string | null
}

/** Personal apply link. The token is the only secret in the URL. */
export function applyInviteUrl(site: string, token: string): string {
  const base = site.replace(/\/$/, '')
  return `${base}/apply?invite=${encodeURIComponent(token)}`
}

export function inviterName(name: string): string {
  return oneLine(name) || 'A Board Arabia member'
}

/** 1 both, 2 headline, 3 company, 4 name only. Empty clauses are omitted. */
export function inviterAttr(inviter: InviterRef): string {
  const who = inviterName(inviter.name)
  const headline = oneLine(inviter.headline || '')
  const company = oneLine(inviter.company || '')
  if (headline && company) return `${who} (${headline}, ${company})`
  if (headline) return `${who} (${headline})`
  if (company) return `${who} (${company})`
  return who
}

export function benefitsHtml(): string {
  const items = BENEFIT_LINES.map((line) => `  <li>${line}</li>`).join('\n')
  return `<ul style="margin:0;padding-left:1.2em;">\n${items}\n</ul>`
}

export function benefitsText(): string {
  return BENEFIT_LINES.map((line) => `- ${line}`).join('\n')
}

/** Locked WhatsApp first line is the name only. */
export function whatsAppInviteText(applyUrl: string, name: string): string {
  const who = inviterName(name)
  const link = oneLine(applyUrl)
  return [
    `${who} vouched for you on Board Arabia.`,
    '',
    `Private founding cohort for operators and capital around Saudi Arabia and the region. ${who} used one of only two peer invites on their seat.`,
    '',
    'This is an invitation to apply. Review is still required. Not an automatic admit.',
    '',
    'What members get:',
    '• Private directory when the cohort opens it',
    '• Warm intros when both sides agree',
    '• Admin-gated capital mandates',
    '• Private deal rooms',
    '• Founding cohort and majlis when scheduled',
    '',
    'Review the invitation:',
    link,
  ].join('\n')
}

/** wa.me with prefilled text. Phone is optional digits; without it the share sheet opens. */
export function whatsAppInviteUrl(phoneDigits: string | null, applyUrl: string, name: string): string {
  const phone = (phoneDigits || '').replace(/\D/g, '')
  const text = encodeURIComponent(whatsAppInviteText(applyUrl, name))
  if (phone) return `https://wa.me/${phone}?text=${text}`
  return `https://wa.me/?text=${text}`
}

export function peerInviteMail(
  applyUrl: string,
  inviter: InviterRef,
): { subject: string; preheader: string; text: string; html: string } {
  const who = inviterName(inviter.name)
  const attr = inviterAttr(inviter)
  const link = oneLine(applyUrl)
  const subject = `${who} vouched for you on Board Arabia`
  const preheader = 'A private founding seat invitation. Review still required.'
  const text = [
    'Board Arabia',
    '',
    `You were vouched for by ${attr}`,
    '',
    `That is rare. Board Arabia is a private founding cohort for operators and capital around Saudi Arabia and the region. ${who} used one of only two peer invites to put your name forward.`,
    '',
    'This is an invitation to apply, not an automatic seat. Applications are reviewed personally.',
    '',
    'What members get',
    benefitsText(),
    '',
    'Review the invitation:',
    link,
    '',
    '-',
    COHORT_FOOTER,
    `You received this because ${who} invited you. If this was unexpected, you can ignore it.`,
  ].join('\n')
  const html = letter({
    preheader,
    title: 'Board Arabia invitation',
    heading: `You were vouched for by ${escapeHtml(attr)}`,
    body: [
      `That is rare. Board Arabia is a private founding cohort for operators and capital around Saudi Arabia and the region. ${escapeHtml(who)} used one of only two peer invites to put your name forward.`,
      'This is an invitation to apply, not an automatic seat. Applications are reviewed personally.',
    ],
    benefits: true,
    link,
    footerExtra: `You received this because ${escapeHtml(who)} invited you. If this was unexpected, you can ignore it.`,
  })
  return { subject, preheader, text, html }
}

export function peerInviteReminderMail(
  applyUrl: string,
  inviter: InviterRef,
): { subject: string; preheader: string; text: string; html: string } {
  const who = inviterName(inviter.name)
  const link = oneLine(applyUrl)
  const subject = `Still open: ${who}\u2019s Board Arabia invitation`
  const preheader = 'One quiet reminder. The invite is still yours to review.'
  const text = [
    'Board Arabia',
    '',
    `Your invitation from ${who} is still open`,
    '',
    `A short reminder only. ${who} vouched for you with a peer invite on Board Arabia. Applications are reviewed personally. Nothing changes until you choose to apply.`,
    '',
    'Review the invitation:',
    link,
    '',
    '-',
    COHORT_FOOTER,
  ].join('\n')
  const html = letter({
    preheader,
    title: 'Board Arabia invitation',
    heading: `Your invitation from ${escapeHtml(who)} is still open`,
    body: [
      `A short reminder only. ${escapeHtml(who)} vouched for you with a peer invite on Board Arabia. Applications are reviewed personally. Nothing changes until you choose to apply.`,
    ],
    benefits: true,
    link,
    footerExtra: '',
  })
  return { subject, preheader, text, html }
}

function letter(opts: {
  preheader: string
  title: string
  heading: string
  body: string[]
  benefits: boolean
  link: string
  footerExtra: string
}): string {
  const safeLink = escapeHtml(opts.link)
  const paragraphs = opts.body
    .map(
      (para) => `<tr>
            <td style="padding:16px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#2a2a2a;">
              ${para}
            </td>
          </tr>`,
    )
    .join('\n          ')
  const benefits = opts.benefits
    ? `<tr>
            <td style="padding:20px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#6b655a;">
              What members get
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#2a2a2a;">
              ${benefitsHtml()}
            </td>
          </tr>`
    : ''
  const extra = opts.footerExtra ? `<br />\n              ${opts.footerExtra}` : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f4ef;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ef;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e6e1d6;">
          <tr>
            <td style="padding:28px 28px 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b655a;">
              Board Arabia
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-size:26px;line-height:1.25;font-weight:normal;">
              ${opts.heading}
            </td>
          </tr>
          ${paragraphs}
          ${benefits}
          <tr>
            <td style="padding:24px 28px 0;" align="left">
              <a href="${safeLink}" style="display:inline-block;background:${INDIGO};color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;padding:12px 20px;">
                Review the invitation
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#6b655a;">
              Or open this link:<br />
              <a href="${safeLink}" style="color:${INDIGO};word-break:break-all;">${safeLink}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8a8378;border-top:1px solid #e6e1d6;margin-top:24px;">
              ${COHORT_FOOTER}${extra}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
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

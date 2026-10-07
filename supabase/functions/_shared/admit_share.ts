/** Admit LinkedIn share letter. Phase 1 opens a prefilled compose URL. No auto-post.
 * Copy is the locked 23 Sep 2026 admit share pack. Board Arabia footer only.
 */

const INDIGO = '#4b3f9a'
const COHORT_FOOTER = 'Board Arabia · Private founding cohort'

export const SHARE_TIERS = ['Founding Member', 'Member', 'Partner'] as const
export type ShareTier = (typeof SHARE_TIERS)[number]

export type AdmitShareInput = {
  memberName: string
  tier: ShareTier
  headline?: string | null
  company?: string | null
  dashboardUrl: string
}

export function credentialLine(headline?: string | null, company?: string | null): string | null {
  const role = oneLine(headline || '')
  const firm = oneLine(company || '')
  if (role && firm) return `${role} at ${firm}`
  if (role) return role
  if (firm) return firm
  return null
}

/** Locked default is the longer block. Empty credential drops that paragraph. */
export function linkedInPostBody(tier: ShareTier, headline?: string | null, company?: string | null): string {
  const credential = credentialLine(headline, company)
  if (tier === 'Member') {
    return paragraphs([
      'Honoured to join Board Arabia as a Member.',
      credential,
      'A private network for operators and capital around Saudi Arabia and the region. Admission by review.',
      'boardarabia.com',
    ])
  }
  if (tier === 'Partner') {
    return paragraphs([
      'Proud to support Board Arabia as a Partner.',
      credential,
      'Backing a private founding cohort for operators and capital around Saudi Arabia and the region.',
      'boardarabia.com',
    ])
  }
  return paragraphs([
    'Honoured to be admitted as a Founding Member of Board Arabia.',
    credential,
    'Board Arabia is a private founding cohort for operators and capital around Saudi Arabia and the region. Seat by review. Not an open directory.',
    'Grateful for the trust.',
    'boardarabia.com',
  ])
}

/** Feed compose with encoded text. The member publishes. We do not post. */
export function linkedInShareUrl(postBody: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(postBody)}`
}

export function admitShareMail(input: AdmitShareInput): {
  subject: string
  preheader: string
  text: string
  html: string
  postBody: string
  shareUrl: string
} {
  const name = oneLine(input.memberName) || 'there'
  const tier = input.tier
  const postBody = linkedInPostBody(tier, input.headline, input.company)
  const shareUrl = linkedInShareUrl(postBody)
  const dashboard = oneLine(input.dashboardUrl)
  const subject = 'Your Board Arabia post is ready to share'
  const preheader = 'A short draft for LinkedIn. You publish when it feels right.'
  const text = [
    'Board Arabia',
    '',
    'Your post, ready to share',
    '',
    `Welcome, ${name}. Your ${tier} seat is live. When you want to mark it on LinkedIn, here is a short draft in your voice. Edit freely. You publish; we do not post for you.`,
    '',
    'Preview',
    '---',
    postBody,
    '---',
    '',
    'Share on LinkedIn:',
    shareUrl,
    '',
    'Soft ask only. Skip this if you prefer to stay quiet.',
    '',
    'Member dashboard:',
    dashboard,
    '',
    '-',
    COHORT_FOOTER,
    'Sent because your seat was admitted. We never post to LinkedIn without you.',
  ].join('\n')
  const html = admitHtml({
    preheader,
    name,
    tier,
    postBody,
    shareUrl,
    dashboard,
  })
  return { subject, preheader, text, html, postBody, shareUrl }
}

export type ShareSendStatus = 'sent' | 'dry_run' | 'error'

/** Builds the letter and hands it to the existing mail transport. Does not post to LinkedIn. */
export async function deliverAdmitShare(
  input: AdmitShareInput & { to: string },
  send: (message: {
    to: string
    subject: string
    html: string
    text: string
  }) => Promise<{ status: ShareSendStatus; detail?: string | null }>,
): Promise<{ status: ShareSendStatus; subject: string; detail: string | null }> {
  const mail = admitShareMail(input)
  if (/calendar\.app\.google|nammco|sme marketer/i.test(`${mail.subject}\n${mail.text}\n${mail.html}`)) {
    return { status: 'error', subject: mail.subject, detail: 'Invite blocked' }
  }
  const sent = await send({ to: input.to, subject: mail.subject, html: mail.html, text: mail.text })
  return { status: sent.status, subject: mail.subject, detail: sent.detail ?? null }
}

function admitHtml(opts: {
  preheader: string
  name: string
  tier: string
  postBody: string
  shareUrl: string
  dashboard: string
}): string {
  const share = escapeHtml(opts.shareUrl)
  const dashboard = escapeHtml(opts.dashboard)
  const post = escapeHtml(opts.postBody)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Board Arabia - share on LinkedIn</title>
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
            <td style="padding:8px 28px 0;font-size:26px;line-height:1.25;">
              Your post, ready to share
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#2a2a2a;">
              Welcome, ${escapeHtml(opts.name)}. Your ${escapeHtml(opts.tier)} seat is live. When you want to mark it on LinkedIn, here is a short draft in your voice. Edit freely. You publish; we do not post for you.
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#6b655a;">
              Preview
            </td>
          </tr>
          <tr>
            <td style="padding:10px 28px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf8f4;border:1px solid #e6e1d6;">
                <tr>
                  <td style="padding:18px 18px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;white-space:pre-wrap;">${post}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 0;" align="left">
              <a href="${share}" style="display:inline-block;background:${INDIGO};color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;padding:12px 20px;">
                Share on LinkedIn
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#6b655a;">
              Soft ask only. Skip this if you prefer to stay quiet. Your member dashboard is here:<br />
              <a href="${dashboard}" style="color:${INDIGO};">${dashboard}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8a8378;border-top:1px solid #e6e1d6;">
              ${COHORT_FOOTER}<br />
              Sent because your seat was admitted. We never post to LinkedIn without you.
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

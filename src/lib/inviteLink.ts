/** Keep in sync with supabase/functions/_shared/peer_invite.ts */

const FALLBACK_NAME = 'A Board Arabia member'

export function applyInviteUrl(site: string, token: string): string {
  const base = site.replace(/\/$/, '')
  return `${base}/apply?invite=${encodeURIComponent(token)}`
}

export function whatsAppInviteText(applyUrl: string, name: string): string {
  const who = oneLine(name) || FALLBACK_NAME
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

export function whatsAppInviteUrl(phoneDigits: string | null, applyUrl: string, name: string): string {
  const phone = (phoneDigits || '').replace(/\D/g, '')
  const text = encodeURIComponent(whatsAppInviteText(applyUrl, name))
  if (phone) return `https://wa.me/${phone}?text=${text}`
  return `https://wa.me/?text=${text}`
}

function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 500)
}

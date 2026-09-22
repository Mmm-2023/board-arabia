/** Keep in sync with supabase/functions/_shared/peer_invite.ts */

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

export function whatsAppInviteUrl(phoneDigits: string | null, applyUrl: string): string {
  const phone = (phoneDigits || '').replace(/\D/g, '')
  const text = encodeURIComponent(whatsAppInviteText(applyUrl))
  if (phone) return `https://wa.me/${phone}?text=${text}`
  return `https://wa.me/?text=${text}`
}

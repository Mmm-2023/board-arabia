/** Name the inviter types. Kept on their sent list. Not returned by the public invite lookup. */

export function cleanInviteeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (name.length < 1 || name.length > 80) return null
  if (/[\u0000-\u001F\u007F]/.test(name)) return null
  if (!/\p{L}/u.test(name)) return null
  return name
}

export function sentInviteLabel(input: {
  channel: 'email' | 'whatsapp'
  recipient_name?: string | null
  recipient_email?: string | null
  recipient_phone?: string | null
}): { title: string; detail: string } {
  const name = input.recipient_name?.trim() || ''
  const channel = input.channel === 'email' ? 'Email' : 'WhatsApp'
  const contact = [input.recipient_email?.trim(), input.recipient_phone?.trim()].filter(Boolean).join(' · ')
  if (!name) {
    return { title: contact ? `${channel} · ${contact}` : channel, detail: '' }
  }
  return { title: name, detail: [channel, contact].filter(Boolean).join(' · ') }
}

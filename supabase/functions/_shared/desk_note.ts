/** Member note to admin. The address stays in Edge config (ADMIN_NOTIFY_EMAIL). */

export const DESK_TOPICS = [
  'Seat',
  'Invites',
  'Intros',
  'Majlis',
  'Deal rooms',
  'Privacy',
  'Something else',
] as const

export type DeskTopic = (typeof DESK_TOPICS)[number]

export const DESK_NOTE_MIN = 10
export const DESK_NOTE_MAX = 500
export const DESK_NOTE_HOURLY_CAP = 5

export function cleanDeskNote(input: {
  topic: unknown
  message: unknown
}): { ok: true; topic: DeskTopic; message: string } | { ok: false; error: string } {
  const topic = typeof input.topic === 'string' ? input.topic.trim() : ''
  if (!isDeskTopic(topic)) return { ok: false, error: 'Choose a topic.' }
  if (typeof input.message !== 'string') return { ok: false, error: 'Write a short note.' }
  const message = input.message
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (message.length < DESK_NOTE_MIN) return { ok: false, error: 'Write a few words so our admin team can help.' }
  if (message.length > DESK_NOTE_MAX) return { ok: false, error: 'Keep the note under 500 characters.' }
  return { ok: true, topic, message }
}

export function isDeskTopic(value: string): value is DeskTopic {
  return (DESK_TOPICS as readonly string[]).includes(value)
}

export function escapeDeskText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function deskNoteLetter(input: { name: string; topic: DeskTopic; message: string }): {
  subject: string
  text: string
  html: string
} {
  const name = input.name.replace(/[\r\n]+/g, ' ').trim().slice(0, 80) || 'A member'
  const subject = `Member note from ${name}: ${input.topic}`.slice(0, 140)
  const text = [`${name} sent a note from Help.`, `Topic: ${input.topic}`, '', input.message].join('\n')
  const html = [
    `<p>${escapeDeskText(name)} sent a note from Help.</p>`,
    `<p>Topic: ${escapeDeskText(input.topic)}</p>`,
    ...input.message.split('\n').map((line) => `<p>${escapeDeskText(line) || '&nbsp;'}</p>`),
  ].join('\n')
  return { subject, text, html }
}

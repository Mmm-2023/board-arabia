const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'] as const
const BOARD_SIGNOFF = 'Board Arabia'

export type DigestCopyPerson = {
  fullName: string
  headline: string
  company: string
  id?: string
}

export type DigestCopyMandate = {
  sector: string
  dealType: string
  ticketBand: string
  geography: string
  oneLiner: string
  stage?: string
}

export type DigestCopyEvent = {
  title: string
  when: string
  region: string
  hostName: string
  venueAddress: string | null
}

export type DigestCopyIntro = {
  fullName: string
  headline: string
  company: string
  reason: string
  example?: boolean
}

export type DigestCopyInput = {
  newMembers: DigestCopyPerson[]
  newMandates: DigestCopyMandate[]
  upcomingEvents: DigestCopyEvent[]
  introductions: DigestCopyIntro[]
  notes?: { text: string }[]
}

export type WeeklyDigestMail = {
  subject: string
  text: string
  html: string
  mail_ready: false
}

export const DIGEST_PREVIEW_INTRO: DigestCopyIntro = {
  fullName: 'Example Member A',
  headline: 'Board director',
  company: 'Example Company A',
  reason: 'Example introduction for this preview.',
  example: true,
}

/** A future sender must refuse anything that is not an approved issue with the switch on and mail ready. */
export function digestIssueSendable(input: {
  status: string
  sendEnabled: boolean
  mailReady: boolean
}): boolean {
  return input.status === 'approved' && input.sendEnabled === true && input.mailReady === true
}

export function weeklyDigestMail(input: DigestCopyInput, site: string): WeeklyDigestMail {
  const origin = site.replace(/\/$/, '')
  const preferences = `${origin}/dashboard/digest/unsubscribe`
  const textParts = [
    'This week at Board Arabia.',
    '',
    'This note lists what is new for members. Email sending is not connected.',
  ]
  const htmlParts = [
    '<p>This week at Board Arabia.</p>',
    '<p>This note lists what is new for members. Email sending is not connected.</p>',
  ]

  pushPeople(textParts, htmlParts, 'New members', input.newMembers)
  pushMandates(textParts, htmlParts, input.newMandates)
  pushEvents(textParts, htmlParts, input.upcomingEvents)
  pushIntros(textParts, htmlParts, input.introductions)
  pushNotes(textParts, htmlParts, input.notes ?? [])

  if (
    input.newMembers.length === 0 &&
    input.newMandates.length === 0 &&
    input.upcomingEvents.length === 0 &&
    input.introductions.length === 0 &&
    (input.notes ?? []).length === 0
  ) {
    textParts.push('', 'Nothing new is listed for this week.')
    htmlParts.push('<p>Nothing new is listed for this week.</p>')
  }

  textParts.push(
    '',
    'Weekly email preferences are on your account. Nothing is sent from this letter.',
    preferences,
  )
  htmlParts.push(
    `<p>Weekly email preferences are on your account. Nothing is sent from this letter.</p>`,
    `<p><a href="${escapeHtml(preferences)}">Weekly email preferences</a></p>`,
  )

  const wrapped = boardFooter(textParts.join('\n'), htmlParts.join('\n'))
  return {
    subject: 'This week at Board Arabia',
    text: wrapped.text,
    html: wrapped.html,
    mail_ready: false,
  }
}

/** Same close as boardMail in mail.ts. This file does not import the sender. */
function boardFooter(textBody: string, htmlBody: string): { text: string; html: string } {
  const text = `${textBody.replace(/\s+$/, '')}\n\n${BOARD_SIGNOFF}`
  const html = `${htmlBody.replace(/\s+$/, '')}\n<footer>${BOARD_SIGNOFF}</footer>`
  return { text, html }
}

function pushPeople(textParts: string[], htmlParts: string[], title: string, rows: DigestCopyPerson[]) {
  if (rows.length === 0) return
  textParts.push('', title)
  htmlParts.push(`<h2>${escapeHtml(title)}</h2>`, '<ul>')
  for (const row of rows) {
    const line = [row.fullName, row.headline, row.company].filter(Boolean).join('. ')
    textParts.push(line)
    htmlParts.push(`<li>${escapeHtml(line)}</li>`)
  }
  htmlParts.push('</ul>')
}

function pushMandates(textParts: string[], htmlParts: string[], rows: DigestCopyMandate[]) {
  if (rows.length === 0) return
  textParts.push('', 'New mandates')
  htmlParts.push('<h2>New mandates</h2>', '<ul>')
  for (const row of rows) {
    const line = [row.sector, row.dealType, row.ticketBand, row.geography, row.oneLiner].filter(Boolean).join('. ')
    textParts.push(line)
    htmlParts.push(`<li>${escapeHtml(line)}</li>`)
  }
  htmlParts.push('</ul>')
}

function pushEvents(textParts: string[], htmlParts: string[], rows: DigestCopyEvent[]) {
  if (rows.length === 0) return
  textParts.push('', 'Upcoming Majlis')
  htmlParts.push('<h2>Upcoming Majlis</h2>', '<ul>')
  for (const row of rows) {
    const when = row.when || ''
    const place = [row.region, row.venueAddress].filter(Boolean).join('. ')
    const line = [row.title, when, place, row.hostName].filter(Boolean).join('. ')
    textParts.push(line)
    htmlParts.push(`<li>${escapeHtml(line)}</li>`)
  }
  htmlParts.push('</ul>')
}

function pushNotes(textParts: string[], htmlParts: string[], rows: { text: string }[]) {
  if (rows.length === 0) return
  textParts.push('', 'Notes')
  htmlParts.push('<h2>Notes</h2>', '<ul>')
  for (const row of rows) {
    textParts.push(row.text)
    htmlParts.push(`<li>${escapeHtml(row.text)}</li>`)
  }
  htmlParts.push('</ul>')
}

function pushIntros(textParts: string[], htmlParts: string[], rows: DigestCopyIntro[]) {
  if (rows.length === 0) return
  textParts.push('', 'Introductions')
  htmlParts.push('<h2>Introductions</h2>', '<ul>')
  for (const row of rows) {
    const line = [row.fullName, row.headline, row.company, row.reason].filter(Boolean).join('. ')
    textParts.push(line)
    htmlParts.push(`<li>${escapeHtml(line)}</li>`)
  }
  htmlParts.push('</ul>')
}

export function formatDigestWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const month = MONTHS[Number(pick('month')) - 1]
  const day = String(Number(pick('day')))
  const year = pick('year')
  const hour = pick('hour')
  const minute = pick('minute')
  if (!month || !day || !year || !hour || !minute) return ''
  return `${day} ${month} ${year}, ${hour}:${minute}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

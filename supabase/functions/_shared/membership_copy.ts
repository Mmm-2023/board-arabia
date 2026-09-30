import { boardMail, publicSite } from './mail.ts'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Product links in candidate mail. Source, medium, and campaign are always set. */
export function emailLink(path: string, campaign: string) {
  const url = new URL(path, `${publicSite()}/`)
  url.searchParams.set('utm_source', 'email')
  url.searchParams.set('utm_medium', 'email')
  url.searchParams.set('utm_campaign', campaign)
  return url.toString()
}

function seal(text: string, html: string, subject: string) {
  return { subject, ...boardMail(text, html) }
}

export function checklistReminderMail(input: { missing: string[]; dashboardUrl: string }) {
  const lines = input.missing.map((item) => `- ${item}`).join('\n')
  const items = input.missing.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
  return seal(
    `You are still short of the required steps. The missing steps are listed in your dashboard. One reminder only.

${lines}

Open your account:
${input.dashboardUrl}`,
    `<p>You are still short of the required steps. The missing steps are listed in your dashboard. One reminder only.</p>
<ul>${items}</ul>
<p><a href="${escapeHtml(input.dashboardUrl)}">Open your account</a></p>`,
    'Two steps left on your Board Arabia request',
  )
}

/** One reminder for an account that never submits a membership request. */
export function idleAccountReminderMail(input: { dashboardUrl: string }) {
  return seal(
    `You opened an account and have not sent a membership request. One reminder only.

If you still want the desk to review you, complete your credentials and request full membership. If you do nothing, this account is deleted 30 days after this note.

Open your account:
${input.dashboardUrl}`,
    `<p>You opened an account and have not sent a membership request. One reminder only.</p>
<p>If you still want the desk to review you, complete your credentials and request full membership. If you do nothing, this account is deleted 30 days after this note.</p>
<p><a href="${escapeHtml(input.dashboardUrl)}">Open your account</a></p>`,
    'Your Board Arabia account is still open',
  )
}

export function requestReceivedMail(input: { dashboardUrl: string }) {
  return seal(
    `Thank you. The desk reviews every request personally. There is no fixed response time; we will write when there is news.

Your request:
${input.dashboardUrl}`,
    `<p>Thank you. The desk reviews every request personally. There is no fixed response time; we will write when there is news.</p>
<p><a href="${escapeHtml(input.dashboardUrl)}">Your request</a></p>`,
    'We received your full membership request',
  )
}

/** Desk alert. No capacity, phone, CR, or statement. */
export function deskRequestMail(input: {
  name: string
  role: string
  region: string
  company: string
  vouch: string
  adminUrl: string
}) {
  const vouch = input.vouch.trim()
  const vouchText = vouch ? `\nVouched: ${vouch}` : ''
  const vouchHtml = vouch ? `<p>Vouched: ${escapeHtml(vouch)}</p>` : ''
  return seal(
    `New membership request.

Name: ${input.name}
Role: ${input.role}
Region: ${input.region}
Company: ${input.company}${vouchText}

Open the request:
${input.adminUrl}`,
    `<p>New membership request.</p>
<p>Name: ${escapeHtml(input.name)}<br>Role: ${escapeHtml(input.role)}<br>Region: ${escapeHtml(input.region)}<br>Company: ${escapeHtml(input.company)}</p>
${vouchHtml}
<p><a href="${escapeHtml(input.adminUrl)}">Open the request</a></p>`,
    `New membership request: ${input.name}, ${input.role}, ${input.region}`,
  )
}

export function needsInfoMail(input: { question: string; dashboardUrl: string }) {
  return seal(
    `The desk asks: ${input.question}

Reply in your dashboard so it stays private. Your request resumes when you answer.

${input.dashboardUrl}`,
    `<p>The desk asks: ${escapeHtml(input.question)}</p>
<p>Reply in your dashboard so it stays private. Your request resumes when you answer.</p>
<p><a href="${escapeHtml(input.dashboardUrl)}">Reply in your dashboard</a></p>`,
    'One question on your Board Arabia request',
  )
}

/** The only candidate letter that may carry the private booking link. */
export function reviewCallMail(input: { bookingUrl: string }) {
  return seal(
    `The desk would like 20 minutes with you before a decision. Use this private link to choose a time. It is personal to you.

${input.bookingUrl}`,
    `<p>The desk would like 20 minutes with you before a decision. Use this private link to choose a time. It is personal to you.</p>
<p><a href="${escapeHtml(input.bookingUrl)}">${escapeHtml(input.bookingUrl)}</a></p>`,
    'Board Arabia: a short conversation',
  )
}

export function waitlistMail(input: { dashboardUrl: string }) {
  return seal(
    `Thank you for your patience. We will write when a place opens. Your account stays open.

${input.dashboardUrl}`,
    `<p>Thank you for your patience. We will write when a place opens. Your account stays open.</p>
<p><a href="${escapeHtml(input.dashboardUrl)}">Your account</a></p>`,
    'Your Board Arabia request is on the waitlist',
  )
}

export function declinedMail(input: { askAgain: string; dashboardUrl: string }) {
  return seal(
    `After review, the desk has not offered full membership at this time. Your account stays open, and you can ask again after ${input.askAgain}.

${input.dashboardUrl}`,
    `<p>After review, the desk has not offered full membership at this time. Your account stays open, and you can ask again after ${escapeHtml(input.askAgain)}.</p>
<p><a href="${escapeHtml(input.dashboardUrl)}">Your account</a></p>`,
    'Board Arabia membership update',
  )
}

/** Existing sign-in. No password, code, or one-time link. */
export function membershipLiveMail(input: {
  dashboardUrl: string
  foundingNumber: number | null
  tier: 'founding' | 'member'
}) {
  const line =
    input.foundingNumber != null
      ? `Founding Member No. ${input.foundingNumber}.`
      : 'Your Member seat is live.'
  const tierLine = input.tier === 'founding' ? 'Founding Member' : 'Member'
  return seal(
    `Welcome. Everything in your dashboard is now open. ${line} Your two peer invites are ready. You are a ${tierLine}.

${input.dashboardUrl}`,
    `<p>Welcome. Everything in your dashboard is now open. ${escapeHtml(line)} Your two peer invites are ready. You are a ${escapeHtml(tierLine)}.</p>
<p><a href="${escapeHtml(input.dashboardUrl)}">Open your dashboard</a></p>`,
    'Your Board Arabia membership is live',
  )
}

export function waitlistOwnerMail(input: { name: string; adminUrl: string }) {
  return seal(
    `Waitlist revisit. ${input.name} has been on the waitlist for 30 days.

${input.adminUrl}`,
    `<p>Waitlist revisit. ${escapeHtml(input.name)} has been on the waitlist for 30 days.</p>
<p><a href="${escapeHtml(input.adminUrl)}">Open the request</a></p>`,
    `Waitlist revisit: ${input.name}`,
  )
}

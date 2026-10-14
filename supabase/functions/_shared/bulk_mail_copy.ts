export const FROM_NAME = 'Board Arabia'
export const UNSUBSCRIBE_LABEL = 'Unsubscribe'
export const PREFERENCES_LABEL = 'Manage email preferences'
export const FOOTER_CREDIT = 'powered by nammco'
export const TEST_SUBJECT_PREFIX = 'Test:'
export const ONE_CLICK_BODY = 'List-Unsubscribe=One-Click'
export const TRY_AGAIN = 'Try again later.'

export type BulkLetter = {
  subject: string
  text: string
  html: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Letter body plus the unsubscribe line, the preferences line, and the footer credit. */
export function renderBulkLetter(input: {
  subject: string
  preheader: string
  bodyText: string
  bodyHtml: string
  unsubscribeUrl: string
  preferencesUrl: string
  test: boolean
}): BulkLetter {
  const subject = input.test ? `${TEST_SUBJECT_PREFIX} ${input.subject}`.trim() : input.subject
  const text = [
    input.bodyText.trim(),
    '',
    `${UNSUBSCRIBE_LABEL}: ${input.unsubscribeUrl}`,
    `${PREFERENCES_LABEL}: ${input.preferencesUrl}`,
    '',
    FOOTER_CREDIT,
  ].join('\n')
  const preheader = input.preheader.trim()
  const hidden = preheader
    ? `<div style="display:none">${escapeHtml(preheader)}</div>`
    : ''
  const body = input.bodyHtml.trim() || `<p>${escapeHtml(input.bodyText.trim())}</p>`
  const html = [
    hidden,
    body,
    `<p><a href="${escapeHtml(input.unsubscribeUrl)}">${UNSUBSCRIBE_LABEL}</a></p>`,
    `<p><a href="${escapeHtml(input.preferencesUrl)}">${PREFERENCES_LABEL}</a></p>`,
    `<p>${FOOTER_CREDIT}</p>`,
  ].join('\n')
  return { subject, text, html }
}

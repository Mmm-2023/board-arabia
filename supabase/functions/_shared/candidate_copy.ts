import { boardMail } from './mail.ts'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Registration code. Board Arabia footer only. No booking link. */
export function registrationCodeMail(input: {
  code: string
  verifyUrl: string
}): { subject: string; text: string; html: string } {
  const code = input.code.trim()
  const url = input.verifyUrl.trim()
  const sealed = boardMail(
    `Your code is ${code}. It expires in 10 minutes and works once. If you did not ask for this, ignore this email.

Or open this one-time link:
${url}`,
    `<p>Your code is <strong>${escapeHtml(code)}</strong>. It expires in 10 minutes and works once. If you did not ask for this, ignore this email.</p>
<p>Or open this one-time link:<br><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
  )
  return { subject: 'Your Board Arabia code', ...sealed }
}

/** Sent once, after the email is confirmed. No sign-in secret. */
export function accountOpenMail(input: { dashboardUrl: string }): { subject: string; text: string; html: string } {
  const url = input.dashboardUrl.trim()
  const sealed = boardMail(
    `You can now look around the member dashboard. Full membership is by review: complete a few credentials, then press Request full membership. Nothing member-private is shown until then.

Open your account:
${url}`,
    `<p>You can now look around the member dashboard. Full membership is by review: complete a few credentials, then press Request full membership. Nothing member-private is shown until then.</p>
<p><a href="${escapeHtml(url)}">Open your account</a></p>`,
  )
  return { subject: 'Your Board Arabia account is open', ...sealed }
}

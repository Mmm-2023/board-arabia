import { boardMail } from './mail.ts'

/** Same return address a client resetPasswordForEmail redirectTo would use. */
export const PASSWORD_RESET_REDIRECT = 'https://boardarabia.com/auth/confirm'

type Issued =
  | { mode: 'magic_link'; otp?: string; tempPassword?: never }
  | { mode: 'temp_password'; tempPassword: string; otp?: never }

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Applicant acknowledgement. Footer is Board Arabia only. */
export function applicationAck(greeting: string): { subject: string; text: string; html: string } {
  const name = greeting.trim() || 'there'
  const sealed = boardMail(
    `Hello ${name},

Thank you for applying to Board Arabia. We have your pre-vet details and Michael will review them shortly.

You do not need to book anything yet. If accepted, you will receive a private next-step email.`,
    `<p>Hello ${escapeHtml(name)},</p>
<p>Thank you for applying to Board Arabia. We have your pre-vet details and Michael will review them shortly.</p>
<p>You do not need to book anything yet. If accepted, you will receive a private next-step email.</p>`,
  )
  return { subject: 'We received your Board Arabia application', ...sealed }
}

/** Accept. The booking URL is passed in by decide-application. Footer is Board Arabia only. */
export function acceptMail(greeting: string, bookingUrl: string): { subject: string; text: string; html: string } {
  const name = greeting.trim() || 'there'
  const sealed = boardMail(
    `Hello ${name},

Your Board Arabia application has been accepted.

Please use this private booking link to schedule a conversation with Michael:

${bookingUrl}

This link is personal to accepted candidates and is not published on the public site.`,
    `<p>Hello ${escapeHtml(name)},</p>
<p>Your Board Arabia application has been <strong>accepted</strong>.</p>
<p>Please use this private booking link to schedule a conversation with Michael:</p>
<p><a href="${escapeHtml(bookingUrl)}">${escapeHtml(bookingUrl)}</a></p>
<p>This link is personal to accepted candidates and is not published on the public site.</p>`,
  )
  return { subject: 'Board Arabia: next step (private booking)', ...sealed }
}

/** Reject. Footer is Board Arabia only. */
export function rejectMail(greeting: string): { subject: string; text: string; html: string } {
  const name = greeting.trim() || 'there'
  const sealed = boardMail(
    `Hello ${name},

Thank you for your interest in Board Arabia. After review, we are unable to proceed with your application at this time.

We appreciate you taking the time to apply.`,
    `<p>Hello ${escapeHtml(name)},</p>
<p>Thank you for your interest in Board Arabia. After review, we are unable to proceed with your application at this time.</p>
<p>We appreciate you taking the time to apply.</p>`,
  )
  return { subject: 'Board Arabia application update', ...sealed }
}

/** Admit / member invite. Footer is Board Arabia only. */
export function admitMail(opts: {
  greeting: string
  seatLabel: string
  loginUrl: string
  confirmUrl: string | null
  issued: Issued
}): { subject: string; text: string; html: string } {
  const name = opts.greeting.trim() || 'there'
  const lines = [
    `Hello ${name},`,
    '',
    `You have been admitted to Board Arabia as a founding member (${opts.seatLabel} seat).`,
    '',
  ]
  const parts = [
    `<p>Hello ${escapeHtml(name)},</p>`,
    `<p>You have been admitted to Board Arabia as a founding member (${escapeHtml(opts.seatLabel)} seat).</p>`,
  ]
  if (opts.issued.mode === 'magic_link' && opts.confirmUrl) {
    lines.push('Open this one-time link to sign in. It expires and works once:', '', opts.confirmUrl, '')
    parts.push(
      '<p>Open this one-time link to sign in. It expires and works once:</p>',
      `<p><a href="${escapeHtml(opts.confirmUrl)}">${escapeHtml(opts.confirmUrl)}</a></p>`,
    )
    if (opts.issued.otp) {
      lines.push(`Or sign in at ${opts.loginUrl} with this one-time code:`, '', opts.issued.otp, '')
      parts.push(
        `<p>Or sign in at <a href="${escapeHtml(opts.loginUrl)}">${escapeHtml(opts.loginUrl)}</a> with this one-time code:</p>`,
        `<p><strong>${escapeHtml(opts.issued.otp)}</strong></p>`,
      )
    }
  } else if (opts.issued.mode === 'temp_password') {
    lines.push(`Sign in at ${opts.loginUrl}`, '', `Temporary password: ${opts.issued.tempPassword}`, '')
    parts.push(
      `<p>Sign in at <a href="${escapeHtml(opts.loginUrl)}">${escapeHtml(opts.loginUrl)}</a></p>`,
      `<p>Temporary password: <strong>${escapeHtml(opts.issued.tempPassword)}</strong></p>`,
    )
  }
  lines.push(
    'After you arrive, set a password and review your profile.',
    '',
    'This invitation is personal. The member dashboard is not public.',
  )
  parts.push(
    '<p>After you arrive, set a password and review your profile.</p>',
    '<p>This invitation is personal. The member dashboard is not public.</p>',
  )
  return {
    subject: 'Board Arabia: your member invitation',
    ...boardMail(lines.join('\n'), parts.join('\n')),
  }
}

/** Password reset. Sent from the Workspace mailbox. Footer is Board Arabia only. */
export function passwordResetMail(confirmUrl: string): { subject: string; text: string; html: string } {
  const sealed = boardMail(
    `Hello,

We received a request to reset the password for this Board Arabia sign-in.

Open this link to choose a new password. It expires and works once:

${confirmUrl}

If you did not ask for this, you can ignore this message.

After you save the new password, sign in again. Members use https://boardarabia.com/login?next=/dashboard. Staff use https://boardarabia.com/login.`,
    `<p>Hello,</p>
<p>We received a request to reset the password for this Board Arabia sign-in.</p>
<p>Open this link to choose a new password. It expires and works once:</p>
<p><a href="${escapeHtml(confirmUrl)}">${escapeHtml(confirmUrl)}</a></p>
<p>If you did not ask for this, you can ignore this message.</p>
<p>After you save the new password, sign in again. Members use <a href="https://boardarabia.com/login?next=/dashboard">member sign-in</a>. Staff use <a href="https://boardarabia.com/login">staff sign-in</a>.</p>`,
  )
  return { subject: 'Board Arabia: reset your password', ...sealed }
}

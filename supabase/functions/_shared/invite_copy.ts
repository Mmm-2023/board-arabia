import { boardMail } from './mail.ts'

type LinkIssued = {
  mode: 'magic_link'
  otp: string
  tempPassword?: never
}

type PasswordIssued = {
  mode: 'temp_password'
  tempPassword: string
  otp?: never
}

export function buildMasterInvite(opts: {
  greeting: string
  seatLabel: string | null
  loginUrl: string
  confirmUrl: string | null
  staffLoginUrl: string
  memberLoginUrl: string
  staffRole?: 'staff' | 'master'
  issued: LinkIssued | PasswordIssued
}): { subject: string; text: string; html: string } {
  const subject = opts.seatLabel
    ? 'Board Arabia: your member invitation'
    : 'Board Arabia: staff sign-in'
  const sealed = boardMail(inviteText(opts), inviteHtml(opts))
  return { subject, text: sealed.text, html: sealed.html }
}

function inviteText(opts: {
  greeting: string
  seatLabel: string | null
  loginUrl: string
  confirmUrl: string | null
  staffLoginUrl: string
  memberLoginUrl: string
  staffRole?: 'staff' | 'master'
  issued: LinkIssued | PasswordIssued
}) {
  const lines = [`Hello ${opts.greeting},`, '']
  lines.push(invitedAs(opts.staffRole, opts.seatLabel), '')
  if (opts.issued.mode === 'magic_link' && opts.confirmUrl) {
    lines.push(
      'Open this one-time link to sign in. It expires and works once:',
      '',
      opts.confirmUrl,
      '',
    )
    if (opts.issued.otp) {
      lines.push(`Or sign in at ${opts.loginUrl} with this one-time code:`, '', opts.issued.otp, '')
    }
  } else if (opts.issued.mode === 'temp_password') {
    lines.push(`Sign in at ${opts.loginUrl}`, '', `Temporary password: ${opts.issued.tempPassword}`, '')
  }
  lines.push(
    `Staff admin: ${opts.staffLoginUrl}`,
    `Member dashboard: ${opts.memberLoginUrl}`,
    '',
    'After you arrive, set a password and review your profile.',
    '',
    'This invitation is personal. The member dashboard is not public.',
  )
  return lines.join('\n')
}

function inviteHtml(opts: {
  greeting: string
  seatLabel: string | null
  loginUrl: string
  confirmUrl: string | null
  staffLoginUrl: string
  memberLoginUrl: string
  staffRole?: 'staff' | 'master'
  issued: LinkIssued | PasswordIssued
}) {
  const parts = [`<p>Hello ${escapeHtml(opts.greeting)},</p>`]
  parts.push(`<p>${escapeHtml(invitedAs(opts.staffRole, opts.seatLabel))}</p>`)
  if (opts.issued.mode === 'magic_link' && opts.confirmUrl) {
    parts.push(
      '<p>Open this one-time link to sign in. It expires and works once:</p>',
      `<p><a href="${escapeHtml(opts.confirmUrl)}">${escapeHtml(opts.confirmUrl)}</a></p>`,
    )
    if (opts.issued.otp) {
      parts.push(
        `<p>Or sign in at <a href="${escapeHtml(opts.loginUrl)}">${escapeHtml(opts.loginUrl)}</a> with this one-time code:</p>`,
        `<p><strong>${escapeHtml(opts.issued.otp)}</strong></p>`,
      )
    }
  } else if (opts.issued.mode === 'temp_password') {
    parts.push(
      `<p>Sign in at <a href="${escapeHtml(opts.loginUrl)}">${escapeHtml(opts.loginUrl)}</a></p>`,
      `<p>Temporary password: <strong>${escapeHtml(opts.issued.tempPassword)}</strong></p>`,
    )
  }
  parts.push(
    `<p>Staff admin: <a href="${escapeHtml(opts.staffLoginUrl)}">${escapeHtml(opts.staffLoginUrl)}</a></p>`,
    `<p>Member dashboard: <a href="${escapeHtml(opts.memberLoginUrl)}">${escapeHtml(opts.memberLoginUrl)}</a></p>`,
    '<p>After you arrive, set a password and review your profile.</p>',
    '<p>This invitation is personal. The member dashboard is not public.</p>',
  )
  return parts.join('\n')
}

function invitedAs(staffRole: 'staff' | 'master' | undefined, seatLabel: string | null) {
  const who = staffRole === 'staff' ? 'an admin' : 'master staff'
  if (!seatLabel) return `You are invited to Board Arabia as ${who}.`
  return `You are invited to Board Arabia as ${who}, and as a founding member (${seatLabel} seat).`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export const MEMBER_NOTICE_TYPES = [
  'welcome',
  'message_new',
  'intro_suggested',
  'invite',
  'event_reminder',
  'mandate_update',
  'newsletter_ready',
  'security_signin',
  'security_two_step',
  'security_deletion',
] as const

export type MemberNoticeType = (typeof MEMBER_NOTICE_TYPES)[number]

export const PRIVACY_PATH = '/dashboard/privacy'

const ESSENTIAL = new Set<MemberNoticeType>(['security_signin', 'security_two_step', 'security_deletion'])

const COPY: Record<MemberNoticeType, { subject: string; lead: string; reason: string; label: string }> = {
  welcome: {
    subject: 'Welcome to Board Arabia',
    lead: 'Your Board Arabia membership is open. Sign in when you are ready.',
    reason: 'you joined Board Arabia',
    label: 'Welcome',
  },
  message_new: {
    subject: 'New message on Board Arabia',
    lead: 'You have a new message on Board Arabia.',
    reason: 'you have a new message',
    label: 'New message',
  },
  intro_suggested: {
    subject: 'An introduction was suggested',
    lead: 'Board Arabia suggested an introduction for you. Open your dashboard to review it.',
    reason: 'an introduction was suggested for you',
    label: 'Intro suggested',
  },
  invite: {
    subject: 'You are invited to Board Arabia',
    lead: 'You have an invitation from Board Arabia. Open your dashboard to see it.',
    reason: 'you were invited',
    label: 'Invite',
  },
  event_reminder: {
    subject: 'Reminder for your Board Arabia gathering',
    lead: 'This is a reminder for a gathering you are registered for.',
    reason: 'you are registered for a gathering',
    label: 'Event reminder',
  },
  mandate_update: {
    subject: 'Update on your mandate request',
    lead: 'There is an update on a mandate you asked about. Open your dashboard to read it.',
    reason: 'there is an update on a mandate you asked about',
    label: 'Mandate update',
  },
  newsletter_ready: {
    subject: 'A newsletter is ready for review',
    lead: 'A newsletter is ready for an owner to review. Open the admin newsletter screen.',
    reason: 'a newsletter is ready for review',
    label: 'Newsletter ready',
  },
  security_signin: {
    subject: 'Board Arabia sign-in',
    lead: 'This confirms a sign-in, password reset, or magic link for your Board Arabia account.',
    reason: '',
    label: 'Sign-in',
  },
  security_two_step: {
    subject: 'Two-step sign-in changed',
    lead: 'Two-step sign-in on your Board Arabia account was changed.',
    reason: '',
    label: 'Two-step sign-in',
  },
  security_deletion: {
    subject: 'Your Board Arabia account is being deleted',
    lead: 'This confirms that your Board Arabia account is being deleted.',
    reason: '',
    label: 'Account deletion',
  },
}

export function isMemberNoticeType(value: string): value is MemberNoticeType {
  return (MEMBER_NOTICE_TYPES as readonly string[]).includes(value)
}

export function isEssentialNotice(typeKey: string): boolean {
  return isMemberNoticeType(typeKey) && ESSENTIAL.has(typeKey)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function memberNoticeMail(input: {
  typeKey: string
  contactEmail: string
  site: string
  unsubscribeUrl: string | null
}): { subject: string; text: string; html: string; essential: boolean } {
  if (!isMemberNoticeType(input.typeKey)) {
    throw new Error('unknown_notice')
  }
  const row = COPY[input.typeKey]
  const essential = ESSENTIAL.has(input.typeKey)
  const origin = input.site.replace(/\/$/, '')
  const privacyUrl = `${origin}${PRIVACY_PATH}`
  const contact = input.contactEmail.trim()
  const questions = contact ? `Questions: ${contact}` : ''
  let footerText: string
  let footerHtml: string
  if (essential) {
    footerText = ['This is an account security email and cannot be turned off.', questions, 'powered by nammco']
      .filter(Boolean)
      .join('\n')
    footerHtml = [
      '<p>This is an account security email and cannot be turned off.</p>',
      questions ? `<p>${escapeHtml(questions)}</p>` : '',
      '<p>powered by nammco</p>',
    ].join('')
  } else {
    const link = input.unsubscribeUrl || privacyUrl
    footerText = [
      `You get this because ${row.reason}. Turn off ${row.label} emails: ${link}. Manage all emails in Your privacy: ${privacyUrl}.`,
      questions,
      'powered by nammco',
    ]
      .filter(Boolean)
      .join('\n')
    footerHtml = [
      `<p>You get this because ${escapeHtml(row.reason)}. Turn off ${escapeHtml(row.label)} emails: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>. Manage all emails in <a href="${escapeHtml(privacyUrl)}">Your privacy</a>.</p>`,
      questions ? `<p>${escapeHtml(questions)}</p>` : '',
      '<p>powered by nammco</p>',
    ].join('')
  }
  const text = [row.lead, '', footerText].join('\n')
  const html = `<p>${escapeHtml(row.lead)}</p>${footerHtml}`
  return { subject: row.subject, text, html, essential }
}

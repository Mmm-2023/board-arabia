import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  buildRfc822,
  hasBoardFooter,
  hasSubstantiveBody,
  marketingSignatureHit,
  sendEmail,
  PRODUCT_FROM,
  workspaceFromAddress,
  WORKSPACE_MAILBOX,
} from '../supabase/functions/_shared/mail.ts'
import { buildMasterInvite } from '../supabase/functions/_shared/invite_copy.ts'
import {
  acceptMail,
  admitMail,
  applicationAck,
  passwordResetMail,
  PASSWORD_RESET_REDIRECT,
  rejectMail,
} from '../supabase/functions/_shared/transactional_copy.ts'

const SECRET_KEYS = [
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_SERVICE_ACCOUNT_JSON',
  'GMAIL_FROM',
  'GMAIL_IMPERSONATE',
]

function clearMailEnv() {
  for (const key of SECRET_KEYS) delete process.env[key]
}

afterEach(() => {
  clearMailEnv()
})

const acceptText = [
  'Hello there,',
  '',
  'Your Board Arabia application has been accepted.',
  '',
  'Please use the private booking link in this message to schedule a conversation with Michael.',
  '',
  'This link is personal to accepted candidates and is not published on the public site.',
  '',
  'Board Arabia',
].join('\n')

const acceptHtml = '<p>Your Board Arabia application has been accepted.</p>\n<footer>Board Arabia</footer>'

test('dry-run when Gmail credentials are missing', async () => {
  clearMailEnv()
  const result = await sendEmail({
    to: 'person@example.com',
    subject: 'Board Arabia: next step (private booking)',
    text: acceptText,
    html: acceptHtml,
  })
  assert.equal(result.status, 'dry_run')
  assert.equal(result.dryRun, true)
  assert.equal(result.provider, 'gmail')
})

test('Accept message is from cindy and replies to cindy', () => {
  clearMailEnv()
  const raw = buildRfc822({
    from: workspaceFromAddress(),
    to: 'person@example.com',
    subject: 'Board Arabia: next step (private booking)',
    text: acceptText,
    html: '<p>Your Board Arabia application has been accepted.</p>',
  })
  assert.match(raw, /From: "Board Arabia" <cindy@nammco.com>/)
  assert.match(raw, /Reply-To: cindy@nammco.com/)
  assert.equal(PRODUCT_FROM, 'cindy@nammco.com')
  assert.equal(/noreply@boardarabia\.com/i.test(raw), false)
  assert.equal(raw.includes('\u2014'), false)
  assert.equal(/resend/i.test(raw), false)
  assert.equal(/calendar\.app\.google/i.test(raw), false)
  assert.equal(WORKSPACE_MAILBOX, 'cindy@nammco.com')
})

test('a parked noreply GMAIL_FROM still sends as cindy', () => {
  clearMailEnv()
  process.env.GMAIL_FROM = '"Board Arabia" <noreply@boardarabia.com>'
  assert.equal(workspaceFromAddress(), '"Board Arabia" <cindy@nammco.com>')
  const raw = buildRfc822({
    from: workspaceFromAddress(),
    to: 'person@example.com',
    subject: 'Board Arabia: next step (private booking)',
    text: acceptText,
    html: acceptHtml,
  })
  assert.match(raw, /From: "Board Arabia" <cindy@nammco.com>/)
  assert.match(raw, /Reply-To: cindy@nammco.com/)
  assert.equal(/noreply@boardarabia\.com/i.test(raw), false)
  assert.equal(raw.includes('\u2014'), false)
  assert.equal(/resend/i.test(raw), false)
  assert.equal(/calendar\.app\.google/i.test(raw), false)
})

test('configured client posts the Accept message to the Gmail API', async () => {
  clearMailEnv()
  process.env.GMAIL_CLIENT_ID = 'client-id'
  process.env.GMAIL_CLIENT_SECRET = 'client-secret'
  process.env.GMAIL_REFRESH_TOKEN = 'refresh-token'
  const calls: { url: string; body: string }[] = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const body = typeof init?.body === 'string' ? init.body : ''
    calls.push({ url, body })
    if (url.includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'ya29.test-token' }), { status: 200 })
    }
    if (url.includes('gmail.googleapis.com')) {
      return new Response(JSON.stringify({ id: 'gmail-msg-1' }), { status: 200 })
    }
    return new Response('unexpected', { status: 500 })
  }
  try {
    const result = await sendEmail({
      to: 'person@example.com',
      subject: 'Board Arabia: next step (private booking)',
      text: acceptText,
      html: acceptHtml,
    })
    assert.equal(result.status, 'sent')
    assert.equal(result.provider, 'gmail')
    assert.equal(result.providerId, 'gmail-msg-1')
    assert.equal(result.dryRun, false)
    const gmailCall = calls.find((call) => call.url.includes('gmail.googleapis.com/gmail/v1/users/me/messages/send'))
    assert.ok(gmailCall)
    const raw = JSON.parse(gmailCall.body).raw as string
    const decoded = Buffer.from(raw.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8')
    assert.match(decoded, /From: "Board Arabia" <cindy@nammco.com>/)
    assert.match(decoded, /Reply-To: cindy@nammco.com/)
    assert.equal(/noreply@boardarabia\.com/i.test(decoded), false)
    const plain = decoded
      .split('Content-Transfer-Encoding: base64\r\n\r\n')[1]
      ?.split('\r\n--')[0]
      ?.replaceAll('\r\n', '')
    assert.ok(plain)
    assert.match(Buffer.from(plain, 'base64').toString('utf8'), /has been accepted/)
    assert.equal(/resend/i.test(decoded), false)
    assert.equal(decoded.includes('ya29.test-token'), false)
  } finally {
    globalThis.fetch = original
  }
})

test('marketing signature is refused and the Gmail API is not called', async () => {
  clearMailEnv()
  process.env.GMAIL_CLIENT_ID = 'client-id'
  process.env.GMAIL_CLIENT_SECRET = 'client-secret'
  process.env.GMAIL_REFRESH_TOKEN = 'refresh-token'
  let called = false
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    called = true
    return new Response('should not send', { status: 500 })
  }
  try {
    const banner = [
      'Director of Partnerships',
      'https://nammco.com',
      'https://www.linkedin.com/company/nammco',
      'Kingdom Centre',
      '<img src="https://nammco.com/banner.png" alt="Kingdom Centre">',
    ].join('\n')
    const result = await sendEmail({
      to: 'person@example.com',
      subject: 'Board Arabia: next step (private booking)',
      text: `${acceptText}\n${banner}`,
      html: `<p>Accepted.</p>${banner}`,
    })
    assert.equal(result.status, 'error')
    assert.equal(result.dryRun, false)
    assert.equal(called, false)
    assert.equal(result.detail?.includes('ya29'), false)
  } finally {
    globalThis.fetch = original
  }
})

test('a mailbox at the same domain is not treated as the marketing site', async () => {
  clearMailEnv()
  const text = [
    'New pending application.',
    '',
    'Email: founder@nammco.com',
    'LinkedIn: https://www.linkedin.com/in/founder',
    '',
    'Board Arabia',
  ].join('\n')
  const html = '<p>Email: founder@nammco.com</p><p>LinkedIn: https://www.linkedin.com/in/founder</p>\n<footer>Board Arabia</footer>'
  assert.equal(marketingSignatureHit(text, html), null)
  const result = await sendEmail({
    to: 'michael@nammco.com',
    subject: 'New Board Arabia application',
    text,
    html,
  })
  assert.equal(result.status, 'dry_run')
  assert.equal(result.dryRun, true)
})

test('the job title spelling in the mailbox signature is refused', async () => {
  clearMailEnv()
  process.env.GMAIL_CLIENT_ID = 'client-id'
  process.env.GMAIL_CLIENT_SECRET = 'client-secret'
  process.env.GMAIL_REFRESH_TOKEN = 'refresh-token'
  let called = false
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    called = true
    return new Response('should not send', { status: 500 })
  }
  try {
    const result = await sendEmail({
      to: 'person@example.com',
      subject: 'Board Arabia application update',
      text: `${acceptText}\nDirector of Partnerhips`,
      html: '<p>Board Arabia</p><p>Director of Partnerhips</p>',
    })
    assert.equal(result.status, 'error')
    assert.equal(called, false)
    assert.match(result.detail || '', /job title/)
  } finally {
    globalThis.fetch = original
  }
})

test('apply ack, Accept, Reject, and Admit use a Board Arabia footer only', () => {
  const booking = 'https://booking.example/private'
  const messages = [
    applicationAck('Ada'),
    acceptMail('Ada', booking),
    rejectMail('Ada'),
    admitMail({
      greeting: 'Ada',
      seatLabel: 'Saudi Arabia',
      loginUrl: 'https://boardarabia.com/login?next=/dashboard',
      confirmUrl: 'https://boardarabia.com/auth/confirm?token_hash=example&type=invite',
      issued: { mode: 'magic_link', otp: '123456' },
    }),
  ]
  for (const mail of messages) {
    assert.equal(hasBoardFooter(mail.text, mail.html), true)
    assert.equal(marketingSignatureHit(mail.text, mail.html), null)
    assert.equal(mail.text.includes('\u2014'), false)
    assert.equal(mail.html.includes('\u2014'), false)
    assert.equal(/<img\b/i.test(mail.html), false)
    assert.equal(/director of partner/i.test(`${mail.text}\n${mail.html}`), false)
    assert.equal(/advisory gateway|partnerships built to last|lasting partnerships/i.test(`${mail.text}\n${mail.html}`), false)
    assert.equal(/nammco/i.test(`${mail.text}\n${mail.html}`), false)
  }
  assert.match(messages[1].text, /has been accepted/)
  assert.match(messages[1].text, /https:\/\/booking\.example\/private/)
})

test('password reset uses a Board Arabia footer and a real letter', () => {
  const confirmUrl = `${PASSWORD_RESET_REDIRECT}?token_hash=example&type=recovery`
  const mail = passwordResetMail(confirmUrl)
  assert.equal(PASSWORD_RESET_REDIRECT, 'https://boardarabia.com/auth/confirm')
  assert.equal(hasBoardFooter(mail.text, mail.html), true)
  assert.equal(hasSubstantiveBody(mail.text, mail.html), true)
  assert.equal(marketingSignatureHit(mail.text, mail.html), null)
  assert.match(mail.text, /reset the password/)
  assert.match(mail.text, /type=recovery/)
  assert.equal(mail.text.includes('\u2014'), false)
  assert.equal(mail.html.includes('\u2014'), false)
  assert.equal(/<img\b/i.test(mail.html), false)
  assert.equal(/nammco/i.test(`${mail.subject}\n${mail.text}\n${mail.html}`), false)
  assert.equal(/director of partner|advisory gateway|kingdom centre/i.test(mail.text), false)
})

test('a footer with no letter is refused and the Gmail API is not called', async () => {
  clearMailEnv()
  process.env.GMAIL_CLIENT_ID = 'client-id'
  process.env.GMAIL_CLIENT_SECRET = 'client-secret'
  process.env.GMAIL_REFRESH_TOKEN = 'refresh-token'
  let called = false
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    called = true
    return new Response('should not send', { status: 500 })
  }
  try {
    const result = await sendEmail({
      to: 'person@example.com',
      subject: 'Board Arabia: reset your password',
      text: 'Board Arabia',
      html: '<footer>Board Arabia</footer>',
    })
    assert.equal(result.status, 'error')
    assert.equal(called, false)
    assert.match(result.detail || '', /empty/)
  } finally {
    globalThis.fetch = original
  }
})

test('nammco tagline is refused even when a Board Arabia footer is present', async () => {
  clearMailEnv()
  process.env.GMAIL_CLIENT_ID = 'client-id'
  process.env.GMAIL_CLIENT_SECRET = 'client-secret'
  process.env.GMAIL_REFRESH_TOKEN = 'refresh-token'
  let called = false
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    called = true
    return new Response('should not send', { status: 500 })
  }
  try {
    const result = await sendEmail({
      to: 'person@example.com',
      subject: 'Board Arabia: next step (private booking)',
      text: `${acceptText}\nAn advisory gateway for lasting partnerships in Saudi Arabia`,
      html: `${acceptHtml}\n<p>partnerships built to last</p>`,
    })
    assert.equal(result.status, 'error')
    assert.equal(result.dryRun, false)
    assert.equal(called, false)
    assert.match(result.detail || '', /tagline/)
  } finally {
    globalThis.fetch = original
  }
})

test('product invites use a plain Board Arabia sign-off', () => {
  const invite = buildMasterInvite({
    greeting: 'there',
    seatLabel: 'Saudi Arabia',
    loginUrl: 'https://boardarabia.com/login?next=/dashboard',
    confirmUrl: 'https://boardarabia.com/auth/confirm?token_hash=example&type=invite',
    staffLoginUrl: 'https://boardarabia.com/login',
    memberLoginUrl: 'https://boardarabia.com/login?next=/dashboard',
    issued: { mode: 'magic_link', otp: '123456' },
  })
  assert.equal(marketingSignatureHit(invite.text, invite.html), null)
  assert.equal(hasBoardFooter(invite.text, invite.html), true)
  assert.equal(invite.text.trimEnd().endsWith('Board Arabia'), true)
  assert.match(invite.html, /<footer>Board Arabia<\/footer>\s*$/)
  assert.equal(invite.text.includes('\u2014'), false)
  assert.equal(invite.html.includes('\u2014'), false)
})

test('Gmail auth failure is a dry-run and does not echo the token', async () => {
  clearMailEnv()
  process.env.GMAIL_CLIENT_ID = 'client-id'
  process.env.GMAIL_CLIENT_SECRET = 'client-secret'
  process.env.GMAIL_REFRESH_TOKEN = 'refresh-token'
  const original = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'ya29.secret-token' }), { status: 200 })
    }
    return new Response(JSON.stringify({ error: { message: 'Invalid Credentials ya29.secret-token' } }), {
      status: 401,
    })
  }
  try {
    const result = await sendEmail({
      to: 'person@example.com',
      subject: 'Board Arabia: next step (private booking)',
      text: acceptText,
      html: acceptHtml,
    })
    assert.equal(result.status, 'dry_run')
    assert.equal(result.dryRun, true)
    assert.equal(result.detail?.includes('ya29'), false)
  } finally {
    globalThis.fetch = original
  }
})

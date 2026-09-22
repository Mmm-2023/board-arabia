import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  buildRfc822,
  sendEmail,
  workspaceFromAddress,
  WORKSPACE_MAILBOX,
} from '../supabase/functions/_shared/mail.ts'

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

test('dry-run when Gmail credentials are missing', async () => {
  clearMailEnv()
  const result = await sendEmail({
    to: 'person@example.com',
    subject: 'Board Arabia: next step (private booking)',
    text: acceptText,
    html: '<p>Your Board Arabia application has been accepted.</p>',
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
  assert.equal(raw.includes('\u2014'), false)
  assert.equal(/resend/i.test(raw), false)
  assert.equal(/calendar\.app\.google/i.test(raw), false)
  assert.equal(WORKSPACE_MAILBOX, 'cindy@nammco.com')
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
      html: '<p>Your Board Arabia application has been accepted.</p>',
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
      html: '<p>Accepted.</p>',
    })
    assert.equal(result.status, 'dry_run')
    assert.equal(result.dryRun, true)
    assert.equal(result.detail?.includes('ya29'), false)
  } finally {
    globalThis.fetch = original
  }
})

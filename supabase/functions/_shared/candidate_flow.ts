import { storeAttribution, type StoredAttribution } from './attribution.ts'
import { accountOpenMail, registrationCodeMail } from './candidate_copy.ts'

export const CODE_TTL_MS = 10 * 60 * 1000

const ROLES = new Set(['chairperson', 'board_member', 'c_suite', 'other'])
const REGIONS = new Set(['ksa_gcc', 'intl'])

export type RegisterBody = {
  full_name?: unknown
  email?: unknown
  role?: unknown
  region?: unknown
  consent?: unknown
  turnstile_token?: unknown
  invite_token?: unknown
  invite_reason?: unknown
  first_touch?: unknown
  last_touch?: unknown
  analytics_id?: unknown
  resend?: unknown
}

export type CandidateRow = {
  userId: string
  verified: boolean
}

export type MailMessage = { to: string; subject: string; text: string; html: string }

export type RegisterDeps = {
  now: () => Date
  pepper: string
  turnstileSecret: string
  site: string
  verifyTurnstile: (token: string, secret: string, remoteIp: string) => Promise<boolean>
  emailIsMember: (email: string) => Promise<boolean>
  findCandidate: (email: string) => Promise<CandidateRow | null>
  findAuthUserId: (email: string) => Promise<string | null>
  createAuthUser: (email: string) => Promise<{ userId: string } | { error: string }>
  insertCandidate: (row: {
    userId: string
    email: string
    fullName: string
    role: string
    region: string
    inviteReason: string | null
    attribution: StoredAttribution
  }) => Promise<{ error?: string }>
  issueCode: (userId: string, codeHash: string, linkHash: string, expiresAt: string) => Promise<'ok' | 'cooldown' | 'rate_limited' | 'error'>
  voidLatestCode: (userId: string) => Promise<void>
  sendMail: (message: MailMessage) => Promise<{ ok: boolean; dryRun: boolean }>
  recordEvent: (userId: string, kind: string, detail: Record<string, string | boolean>) => Promise<void>
  claimInvite: (userId: string, token: string, reason: string) => Promise<boolean>
}

export type FlowResult = {
  status: number
  body: Record<string, unknown>
}

function clean(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.includes('\n')
}

export async function sha256(pepper: string, value: string) {
  const data = new TextEncoder().encode(`${pepper}:${value}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function randomCode() {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const view = new DataView(bytes.buffer)
  const n = view.getUint32(0) % 1_000_000
  return String(n).padStart(6, '0')
}

export function randomToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function result(status: number, body: Record<string, unknown>): FlowResult {
  return { status, body }
}

async function issueAndSend(
  email: string,
  userId: string,
  hasInvite: boolean,
  deps: RegisterDeps,
): Promise<FlowResult> {
  const code = randomCode()
  const linkToken = randomToken()
  const codeHash = await sha256(deps.pepper, code)
  const linkHash = await sha256(deps.pepper, linkToken)
  const expires = new Date(deps.now().getTime() + CODE_TTL_MS).toISOString()
  const issued = await deps.issueCode(userId, codeHash, linkHash, expires)
  if (issued === 'cooldown') {
    return result(429, { error: 'Wait a minute, then ask for a new code.', error_code: 'cooldown' })
  }
  if (issued === 'rate_limited') {
    return result(429, { error: 'Too many codes. Try again later.', error_code: 'rate_limited' })
  }
  if (issued !== 'ok') {
    return result(400, { error: 'Could not send a code. Try again.', error_code: 'server' })
  }

  const site = deps.site.replace(/\/$/, '')
  const verifyUrl = `${site}/apply/verify?token=${encodeURIComponent(linkToken)}`
  const mail = registrationCodeMail({ code, verifyUrl })
  const sent = await deps.sendMail({ to: email, ...mail })
  if (!sent.ok) {
    await deps.voidLatestCode(userId)
    return result(502, { error: 'We could not send the email. Wait a minute, then try again.', error_code: 'mail' })
  }
  await deps.recordEvent(userId, 'code_sent', { has_invite: hasInvite })
  return result(200, { ok: true, dry_run: sent.dryRun, error_code: '' })
}

export async function registerCandidate(
  body: RegisterBody,
  remoteIp: string,
  deps: RegisterDeps,
): Promise<FlowResult> {
  if (!deps.pepper || !deps.turnstileSecret) {
    return result(503, { error: 'Registration is not available yet.', error_code: 'not_configured' })
  }

  if (body.resend === true) {
    const email = clean(body.email, 320).toLowerCase()
    const token = clean(body.turnstile_token, 2048)
    if (!isEmail(email)) {
      return result(400, { error: 'Enter the work email you registered.', error_code: 'invalid_email' })
    }
    if (!token) {
      return result(400, { error: 'Complete the security check, then try again.', error_code: 'turnstile' })
    }
    const passed = await deps.verifyTurnstile(token, deps.turnstileSecret, remoteIp)
    if (!passed) {
      return result(400, { error: 'The security check did not pass. Try again.', error_code: 'turnstile' })
    }
    const existing = await deps.findCandidate(email)
    if (!existing) {
      return result(200, { ok: true, created: false, dry_run: false, error_code: '' })
    }
    const sent = await issueAndSend(email, existing.userId, false, deps)
    if (sent.status === 200) sent.body.created = false
    return sent
  }

  const fullName = clean(body.full_name, 200)
  const email = clean(body.email, 320).toLowerCase()
  const role = clean(body.role, 40)
  const region = clean(body.region, 40)
  const token = clean(body.turnstile_token, 2048)
  const inviteToken = clean(body.invite_token, 80)
  const inviteReason = clean(body.invite_reason, 500)

  if (!fullName || !email || !ROLES.has(role) || !REGIONS.has(region)) {
    return result(400, { error: 'Name, work email, role, and region are required.', error_code: 'missing_fields' })
  }
  if (!isEmail(email)) {
    return result(400, { error: 'Enter a valid work email.', error_code: 'invalid_email' })
  }
  if (body.consent !== true) {
    return result(400, { error: 'Agree to the Terms and Privacy notice to continue.', error_code: 'consent' })
  }
  if (inviteToken && !inviteReason) {
    return result(400, { error: 'Say why you were invited.', error_code: 'invite_reason' })
  }
  if (!token) {
    return result(400, { error: 'Complete the security check, then try again.', error_code: 'turnstile' })
  }

  const passed = await deps.verifyTurnstile(token, deps.turnstileSecret, remoteIp)
  if (!passed) {
    return result(400, { error: 'The security check did not pass. Try again.', error_code: 'turnstile' })
  }

  if (await deps.emailIsMember(email)) {
    return result(409, {
      error: 'This email already has an account. Sign in.',
      error_code: 'account_exists',
    })
  }

  const attribution = storeAttribution({
    first: body.first_touch,
    last: body.last_touch,
    analyticsId: body.analytics_id,
  })

  let candidate = await deps.findCandidate(email)
  let created = false
  if (!candidate) {
    let userId = await deps.findAuthUserId(email)
    if (!userId) {
      const createdUser = await deps.createAuthUser(email)
      if ('error' in createdUser) {
        return result(400, { error: 'Could not open the account. Try again.', error_code: 'server' })
      }
      userId = createdUser.userId
    }
    const inserted = await deps.insertCandidate({
      userId,
      email,
      fullName,
      role,
      region,
      inviteReason: inviteToken ? inviteReason : null,
      attribution,
    })
    if (inserted.error) {
      return result(400, { error: 'Could not open the account. Try again.', error_code: 'server' })
    }
    candidate = { userId, verified: false }
    created = true
    if (inviteToken) {
      await deps.claimInvite(userId, inviteToken, inviteReason)
    }
    await deps.recordEvent(userId, 'registered', {
      role_group: role,
      region_group: region,
      has_invite: Boolean(inviteToken),
    })
  }

  const sent = await issueAndSend(email, candidate.userId, Boolean(inviteToken), deps)
  if (sent.status === 200) sent.body.created = created
  return sent
}

export type VerifyBody = {
  email?: unknown
  code?: unknown
  token?: unknown
}

export type VerifyDeps = {
  pepper: string
  site: string
  consume: (input: {
    email: string
    codeHash: string
    linkHash: string
  }) => Promise<{ status: string; userId: string | null }>
  markVerified: (userId: string) => Promise<{ first: boolean } | { error: string }>
  confirmAuthEmail: (userId: string) => Promise<{ error?: string }>
  issueSession: (email: string) => Promise<{ tokenHash: string; email: string } | { error: string }>
  lookupEmail: (userId: string) => Promise<string | null>
  sendMail: (message: MailMessage) => Promise<{ ok: boolean; dryRun: boolean }>
  recordEvent: (userId: string, kind: string, detail: Record<string, string | boolean>) => Promise<void>
}

export async function verifyCandidate(body: VerifyBody, deps: VerifyDeps): Promise<FlowResult> {
  if (!deps.pepper) {
    return result(503, { error: 'Confirmation is not available yet.', error_code: 'not_configured' })
  }
  const email = clean(body.email, 320).toLowerCase()
  const code = clean(body.code, 12).replace(/\s/g, '')
  const token = clean(body.token, 128)
  const byLink = /^[A-Za-z0-9_-]{20,128}$/.test(token)
  const byCode = /^[0-9]{6}$/.test(code)
  if (!byLink && !(byCode && isEmail(email))) {
    return result(400, { error: 'Enter the 6 digit code from your email.', error_code: 'missing_fields' })
  }

  const consumed = await deps.consume({
    email: byLink ? '' : email,
    codeHash: byCode && !byLink ? await sha256(deps.pepper, code) : '',
    linkHash: byLink ? await sha256(deps.pepper, token) : '',
  })

  if (consumed.status === 'expired') {
    return result(400, { error: 'That code has expired. Request a new one.', error_code: 'expired' })
  }
  if (consumed.status === 'locked') {
    return result(400, { error: 'Too many tries. Request a new code.', error_code: 'locked' })
  }
  if (consumed.status !== 'ok' || !consumed.userId) {
    return result(400, { error: 'That code is not valid.', error_code: 'invalid_code' })
  }

  const marked = await deps.markVerified(consumed.userId)
  if ('error' in marked) {
    return result(400, { error: 'Could not confirm the email. Try again.', error_code: 'server' })
  }

  const accountEmail = (await deps.lookupEmail(consumed.userId)) || email
  if (!accountEmail) {
    return result(400, { error: 'Could not confirm the email. Try again.', error_code: 'server' })
  }

  const confirmed = await deps.confirmAuthEmail(consumed.userId)
  if (confirmed.error) {
    return result(502, { error: 'Confirmed, but sign-in did not start. Request a new code.', error_code: 'server' })
  }

  const session = await deps.issueSession(accountEmail)
  if ('error' in session) {
    return result(502, { error: 'Confirmed, but sign-in did not start. Request a new code.', error_code: 'server' })
  }

  if (marked.first) {
    const site = deps.site.replace(/\/$/, '')
    const mail = accountOpenMail({ dashboardUrl: `${site}/dashboard` })
    await deps.sendMail({ to: accountEmail, ...mail })
    await deps.recordEvent(consumed.userId, 'email_verified', { method: byLink ? 'link' : 'code' })
  }

  return result(200, {
    ok: true,
    token_hash: session.tokenHash,
    email: session.email,
    already_verified: !marked.first,
    method: byLink ? 'link' : 'code',
  })
}

export async function verifyTurnstileToken(token: string, secret: string, remoteIp: string) {
  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp)
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) return false
  const payload = (await response.json()) as { success?: boolean }
  return payload.success === true
}

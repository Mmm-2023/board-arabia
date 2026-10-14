import { CODE_TTL_MS, randomCode, sha256 } from '../_shared/candidate_flow.ts'
import { boardMail } from '../_shared/mail.ts'

export type DeleteMail = { to: string; subject: string; text: string; html: string }

export type DeleteDeps = {
  userId: string | null
  email: string | null
  body: unknown
  now: () => number
  pepper: string
  issueCode: (userId: string, codeHash: string, expiresAt: string) => Promise<string>
  voidCode: (userId: string) => Promise<void>
  confirmDelete: (userId: string, codeHash: string) => Promise<Record<string, unknown> | null>
  sendMail: (message: DeleteMail) => Promise<{ ok: boolean }>
  removeAvatar?: (path: string) => Promise<void>
  deleteAnalytics?: (analyticsId: string) => Promise<void>
}

function cleanCode(value: unknown) {
  if (typeof value !== 'string') return ''
  const code = value.trim()
  return /^\d{6}$/.test(code) ? code : ''
}

function actionOf(body: unknown) {
  if (!body || typeof body !== 'object') return ''
  const action = (body as { action?: unknown }).action
  return action === 'send_code' || action === 'confirm' ? action : ''
}

function codeLetter(code: string) {
  const sealed = boardMail(
    `Your code is ${code}. It expires in 10 minutes and works once. Enter it on Delete account. If you did not ask to delete your account, ignore this email.`,
    `<p>Your code is <strong>${code}</strong>. It expires in 10 minutes and works once. Enter it on Delete account. If you did not ask to delete your account, ignore this email.</p>`,
  )
  return { subject: 'Your Board Arabia code', ...sealed }
}

function statusMessage(status: string): { status: number; body: Record<string, unknown> } | null {
  if (status === 'staff') {
    return { status: 409, body: { error: 'This sign-in is a staff account and is not removed from here.' } }
  }
  if (status === 'closed') {
    return { status: 409, body: { error: 'This account is already closed.' } }
  }
  if (status === 'missing') {
    return { status: 404, body: { error: 'No account was found to delete.' } }
  }
  if (status === 'cooldown') {
    return { status: 429, body: { error: 'Wait a minute, then ask for a new code.' } }
  }
  if (status === 'rate_limited' || status === 'locked') {
    return { status: 429, body: { error: 'Too many codes. Try again later.' } }
  }
  if (status === 'expired') {
    return { status: 400, body: { error: 'That code has expired. Ask for a new one.' } }
  }
  if (status === 'mismatch' || status === 'invalid') {
    return { status: 400, body: { error: 'That code does not match. Try again.' } }
  }
  return null
}

async function finishDelete(
  data: Record<string, unknown>,
  deps: DeleteDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const analyticsId = data.analytics_id
  if (typeof analyticsId === 'string' && analyticsId && !analyticsId.includes('@')) {
    try {
      await deps.deleteAnalytics?.(analyticsId)
    } catch {
      // The account is already closed. A missed analytics delete does not reopen it.
    }
  }
  const avatar = data.avatar_path
  if (typeof avatar === 'string' && avatar && !avatar.includes('@') && !avatar.includes('..')) {
    try {
      await deps.removeAvatar?.(avatar)
    } catch {
      // The profile path is already cleared.
    }
  }
  return { status: 200, body: { ok: true } }
}

export async function handleDeleteAccount(
  deps: DeleteDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!deps.userId) return { status: 401, body: { error: 'Unauthorized' } }
  if (!deps.pepper) return { status: 503, body: { error: 'Account deletion is not available yet.' } }

  const action = actionOf(deps.body)
  if (action === 'send_code') {
    if (!deps.email || !deps.email.includes('@')) {
      return { status: 400, body: { error: 'No account was found to delete.' } }
    }
    const code = randomCode()
    const codeHash = await sha256(deps.pepper, code)
    const expiresAt = new Date(deps.now() + CODE_TTL_MS).toISOString()
    const issued = await deps.issueCode(deps.userId, codeHash, expiresAt)
    const refused = statusMessage(issued)
    if (refused) return refused
    if (issued !== 'ok') return { status: 500, body: { error: 'Could not send a code. Try again.' } }

    const sent = await deps.sendMail({ to: deps.email, ...codeLetter(code) })
    if (!sent.ok) {
      await deps.voidCode(deps.userId)
      return { status: 502, body: { error: 'We could not send the code. Wait a minute, then try again.' } }
    }
    return { status: 200, body: { ok: true } }
  }

  if (action === 'confirm') {
    const code = cleanCode((deps.body as { code?: unknown }).code)
    if (!code) return { status: 400, body: { error: 'Enter the 6 digit code.' } }
    const codeHash = await sha256(deps.pepper, code)
    const data = await deps.confirmDelete(deps.userId, codeHash)
    if (!data) return { status: 500, body: { error: 'Could not delete the account.' } }
    const status = String(data.status || '')
    const refused = statusMessage(status)
    if (refused) return refused
    if (status !== 'ok') return { status: 500, body: { error: 'Could not delete the account.' } }
    return finishDelete(data, deps)
  }

  return { status: 400, body: { error: 'Choose send or confirm.' } }
}

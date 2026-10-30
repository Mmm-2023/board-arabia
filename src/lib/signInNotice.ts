export type SignInNoticeTone = 'error' | 'warn'

export type SignInNotice = {
  tone: SignInNoticeTone
  text: string
}

export type SignInFailure = {
  message?: string
  status?: number
  name?: string
  code?: string
}

export const SIGN_IN_NETWORK = 'We could not reach Board Arabia. Check your connection and try again.'
export const SIGN_IN_MISMATCH = 'That email and password do not match. Check them and try again, or reset your password.'
export const SIGN_IN_RATE = 'Too many attempts. Wait a few minutes, or reset your password.'
export const SIGN_IN_CODE = 'That code did not work. Ask for a new link on the sign-in page.'
export const SIGN_IN_RESET_WAIT = 'You can ask again in 60 seconds.'
export const SIGN_IN_RESET_FAIL = 'We could not send the link. Check the email and try again.'
export const SIGN_IN_EMAIL = 'Enter the email address you use for Board Arabia.'
export const SIGN_IN_PASSWORD = 'Enter your password.'
export const SIGN_IN_CODE_FIELD = 'Enter the one-time code.'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function memberEmailProblem(value: string) {
  const trimmed = value.trim()
  if (!trimmed || !EMAIL_SHAPE.test(trimmed)) return SIGN_IN_EMAIL
  return ''
}

/** Maps an auth failure onto the sign-in sentences. Does not call auth. */
export function presentSignInNotice(error: SignInFailure | null | undefined, kind: 'password' | 'code' | 'reset'): SignInNotice {
  if (isNetworkFailure(error)) return { tone: 'error', text: SIGN_IN_NETWORK }
  if (isRateLimit(error)) {
    if (kind === 'reset') return { tone: 'warn', text: SIGN_IN_RESET_WAIT }
    return { tone: 'warn', text: SIGN_IN_RATE }
  }
  if (kind === 'code') return { tone: 'error', text: SIGN_IN_CODE }
  if (kind === 'reset') return { tone: 'error', text: SIGN_IN_RESET_FAIL }
  return { tone: 'error', text: SIGN_IN_MISMATCH }
}

function isNetworkFailure(error: SignInFailure | null | undefined) {
  if (!error) return false
  const message = (error.message || '').toLowerCase()
  const code = (error.code || '').toLowerCase()
  if (error.name === 'AuthRetryableFetchError') return true
  if (error.status === 0 || (typeof error.status === 'number' && error.status >= 500)) return true
  if (code === 'request_timeout' || code === 'hook_timeout' || code === 'hook_timeout_after_retry') return true
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('load failed') ||
    message.includes('fetch failed')
  )
}

function isRateLimit(error: SignInFailure | null | undefined) {
  if (!error) return false
  const message = (error.message || '').toLowerCase()
  const code = (error.code || '').toLowerCase()
  if (error.status === 429) return true
  if (code.includes('rate_limit') || code.includes('over_request') || code.includes('over_email_send')) return true
  return message.includes('too many') || message.includes('rate limit') || message.includes('only request this')
}

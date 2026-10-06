import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { track } from '../lib/analytics'
import { registerCandidate, supabase, verifyCandidate } from '../lib/supabase'
import { useNoIndex } from '../lib/usePageTitle'
import { clearVerifyEmail, readVerifyEmail, rememberVerifyEmail } from '../lib/verifyEmail'
import { VerifyScreen } from './apply/VerifyScreen'

export function VerifyPage({ security = 'live' as 'live' | 'preview' }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const linkToken = (params.get('token') || '').trim()
  const [email] = useState(readVerifyEmail)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [resendWait, setResendWait] = useState(0)
  const linkStarted = useRef('')
  const confirmRef = useRef<(input: { code?: string; token?: string }) => Promise<void>>(async () => {})
  useNoIndex('Check your email | Board Arabia')

  useEffect(() => {
    confirmRef.current = confirm
  })

  useEffect(() => {
    if (!linkToken || security === 'preview' || linkStarted.current === linkToken) return
    linkStarted.current = linkToken
    void confirmRef.current({ token: linkToken })
  }, [linkToken, security])

  useEffect(() => {
    if (resendWait <= 0) return
    const timer = window.setTimeout(() => setResendWait((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendWait])

  async function confirm(input: { code?: string; token?: string }) {
    setError('')
    setSubmitting(true)
    const result = await verifyCandidate({
      email: input.token ? undefined : email,
      code: input.code,
      token: input.token,
    })
    if (result.error || !result.tokenHash) {
      setSubmitting(false)
      setError(result.error || 'That code is not valid.')
      track('register_error', { step: 'verify', error_code: result.errorCode || 'invalid_code', path: '/register/verify' })
      return
    }
    const verified = await supabase.auth.verifyOtp({ token_hash: result.tokenHash, type: 'magiclink' })
    setSubmitting(false)
    if (verified.error) {
      setError('Confirmed, but sign-in did not start. Request a new code.')
      track('register_error', { step: 'verify', error_code: 'server', path: '/register/verify' })
      return
    }
    if (result.alreadyVerified) {
      track('login', { method: result.method === 'link' ? 'link' : 'code', path: '/dashboard' })
    } else {
      track('email_verified', { method: result.method === 'link' ? 'link' : 'code', path: '/dashboard' })
    }
    clearVerifyEmail()
    navigate('/dashboard', { replace: true })
  }

  async function onResend(token: string) {
    const current = email || readVerifyEmail()
    if (!current) {
      setError('Go back and enter your work email again.')
      return
    }
    setResending(true)
    setError('')
    const result = await registerCandidate({
      full_name: '',
      email: current,
      role: '',
      region: '',
      consent: true,
      turnstile_token: token,
      resend: true,
    })
    setResending(false)
    if (result.error) {
      setError(result.error)
      track('register_error', { step: 'verify', error_code: result.errorCode || 'server', path: '/register/verify' })
      return
    }
    rememberVerifyEmail(current)
    setNote(
      result.dryRun
        ? 'Outbound mail is not connected yet. Ask our admin team, then try again.'
        : 'If an account is open for this email, a new code is on its way.',
    )
    setResendWait(60)
  }

  return (
    <VerifyScreen
      email={email}
      submitting={submitting}
      resending={resending}
      error={error}
      note={note}
      resendWait={resendWait}
      security={security}
      nav={<Nav />}
      onSubmit={(code) => {
        void confirm({ code })
      }}
      onResend={(token) => {
        void onResend(token)
      }}
    />
  )
}

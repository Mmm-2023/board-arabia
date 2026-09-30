import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { Seo } from '../components/Seo'
import { track } from '../lib/analytics'
import { lookupMemberInvite, registerCandidate } from '../lib/supabase'
import { readSubmitAttribution } from '../lib/tracking/touch'
import { rememberVerifyEmail } from '../lib/verifyEmail'
import { RegisterScreen, type RegisterValues } from './apply/RegisterScreen'

type InviteView =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'valid'; label: string; token: string }
  | { kind: 'bad'; message: string }

const INVITE_NOTE = {
  invalid: 'This invite link is invalid. You can still register for consideration.',
  expired: 'This invite link has expired. You can still register for consideration.',
  used: 'This invite was already used. You can still register for consideration.',
  limited: 'This invite link could not be checked just now. You can still register for consideration.',
} as const

export function ApplyPage({ security = 'live' as 'live' | 'preview' }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const inviteParam = (params.get('invite') || '').trim()
  const [lookup, setLookup] = useState<{ token: string; view: InviteView } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const started = useRef(false)
  const tokenOk = /^[A-Za-z0-9_-]{43,80}$/.test(inviteParam)
  const inviteView: InviteView = !inviteParam
    ? { kind: 'none' }
    : !tokenOk
      ? { kind: 'bad', message: INVITE_NOTE.invalid }
      : lookup?.token === inviteParam
        ? lookup.view
        : { kind: 'checking' }

  useEffect(() => {
    if (!tokenOk) return
    let cancelled = false
    void lookupMemberInvite(inviteParam).then((result) => {
      if (cancelled) return
      if (result.valid) {
        setLookup({ token: inviteParam, view: { kind: 'valid', label: result.inviterLabel, token: inviteParam } })
        return
      }
      setLookup({ token: inviteParam, view: { kind: 'bad', message: INVITE_NOTE[result.state] } })
    })
    return () => {
      cancelled = true
    }
  }, [inviteParam, tokenOk])

  function onFocus() {
    if (started.current) return
    started.current = true
    track('register_start', {
      entry_path: '/apply',
      has_invite: inviteView.kind === 'valid',
      path: '/apply',
      page_type: 'apply',
    })
  }

  async function onSubmit(values: RegisterValues) {
    setError('')
    const fullName = values.fullName.trim().slice(0, 200)
    const email = values.email.trim().toLowerCase().slice(0, 320)
    if (!fullName || !email || !values.role || !values.region) {
      setError('Name, work email, role, and region are required.')
      track('register_error', { step: 'register', error_code: 'missing_fields', path: '/apply' })
      return
    }
    if (!values.consent) {
      setError('Agree to the Terms and Privacy notice to continue.')
      track('register_error', { step: 'register', error_code: 'consent', path: '/apply' })
      return
    }
    if (inviteView.kind === 'checking') {
      setError('Still checking the invite link.')
      return
    }
    const reason = values.inviteReason.trim().slice(0, 500)
    if (inviteView.kind === 'valid' && !reason) {
      setError('Say why you were invited.')
      track('register_error', { step: 'register', error_code: 'invite_reason', path: '/apply' })
      return
    }
    if (security !== 'preview' && !values.turnstileToken) {
      setError('Complete the security check, then try again.')
      track('register_error', { step: 'register', error_code: 'turnstile', path: '/apply' })
      return
    }
    setSubmitting(true)
    const result = await registerCandidate({
      full_name: fullName,
      email,
      role: values.role,
      region: values.region,
      consent: true,
      turnstile_token: values.turnstileToken,
      invite_token: inviteView.kind === 'valid' ? inviteView.token : null,
      invite_reason: inviteView.kind === 'valid' ? reason : null,
      ...readSubmitAttribution(),
    })
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      track('register_error', { step: 'register', error_code: result.errorCode || 'server', path: '/apply' })
      return
    }
    track('register_basic', {
      role_group: values.role,
      region_group: values.region,
      has_invite: inviteView.kind === 'valid',
      path: '/apply',
      page_type: 'apply',
    })
    rememberVerifyEmail(email)
    navigate('/apply/verify')
  }

  return (
    <>
      <Seo path="/apply" />
      <RegisterScreen
        invite={inviteView.kind === 'valid' ? { kind: 'valid', label: inviteView.label } : inviteView}
        submitting={submitting}
        error={error}
        onSubmit={(values) => {
          void onSubmit(values)
        }}
        onFocus={onFocus}
        security={security}
        nav={<Nav />}
        footer={<Footer />}
      />
    </>
  )
}

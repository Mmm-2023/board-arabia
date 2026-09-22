import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { resolveAfterLogin } from '../lib/memberGate'
import { sendPasswordReset, supabase } from '../lib/supabase'
import { useNoIndex } from '../lib/usePageTitle'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextPath = safeNext(searchParams.get('next'))

  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [destination, setDestination] = useState<string | null>(null)
  const [resetNote, setResetNote] = useState('')
  const memberEntry = nextPath.startsWith('/dashboard')
  const codeType = otpType(searchParams.get('otp_type'))

  useNoIndex(memberEntry ? 'Member login | Board Arabia' : 'Staff login | Board Arabia')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void resolveAfterLogin(session.user.id, nextPath).then((path) => {
      if (!cancelled) setDestination(path)
    })
    return () => {
      cancelled = true
    }
  }, [session, nextPath])

  async function onSignIn(e: FormEvent) {
    e.preventDefault()
    setAuthError('')
    setSubmitting(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error || !data.user) {
      setSubmitting(false)
      setAuthError(error?.message || 'Sign-in failed')
      return
    }
    const dest = await resolveAfterLogin(data.user.id, nextPath)
    setSubmitting(false)
    navigate(dest, { replace: true })
  }

  async function onReset() {
    setAuthError('')
    setResetNote('')
    if (!email.trim()) {
      setAuthError('Enter your email, then request a reset link.')
      return
    }
    setSubmitting(true)
    const result = await sendPasswordReset(email)
    setSubmitting(false)
    if (result.error) {
      setAuthError(result.error)
      return
    }
    setResetNote('If this inbox can sign in, a reset link is on its way.')
  }

  async function onCode(e: FormEvent) {
    e.preventDefault()
    setAuthError('')
    if (!email.trim() || !code.trim()) {
      setAuthError('Enter the email and the one-time code.')
      return
    }
    setSubmitting(true)
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: codeType,
    })
    if (error || !data.user) {
      setSubmitting(false)
      setAuthError(error?.message || 'That code was not accepted')
      return
    }
    const dest = await resolveAfterLogin(data.user.id, nextPath)
    setSubmitting(false)
    navigate(dest, { replace: true })
  }

  if (session === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink text-pearl">
        <p className="text-stone/70">Loading…</p>
      </div>
    )
  }

  if (session) {
    if (!destination) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-ink text-pearl">
          <p className="text-stone/70">Loading…</p>
        </div>
      )
    }
    return <Navigate to={destination} replace />
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-pearl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 15% 10%, rgba(176,137,62,0.18), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 85%, rgba(13,61,58,0.9), transparent 50%), linear-gradient(165deg, #062a28 0%, #0a3532 45%, #041f1d 100%)',
        }}
      />
      <div aria-hidden className="grain absolute inset-0" />

      <header className="relative z-10 border-b border-pearl/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 md:px-8">
          <Link
            to="/"
            className="font-display text-[1.05rem] font-bold tracking-[-0.02em]"
          >
            Board Arabia
          </Link>
          <Link
            to="/"
            className="text-[0.72rem] font-semibold tracking-[0.06em] text-pearl/55 uppercase transition-colors hover:text-pearl"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col justify-center px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto w-full max-w-md">
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass-bright uppercase">
            {memberEntry ? 'Members' : 'Staff only'}
          </p>
          <h1 className="mt-3 font-display text-[2.35rem] leading-[1.05] font-bold tracking-[-0.03em] md:text-[2.75rem]">
            Sign in
          </h1>
          <p className="mt-4 text-[0.98rem] leading-relaxed text-stone/70">
            {memberEntry
              ? 'Use the one-time link in your admission email, or the password you set after you arrived.'
              : 'Email and password via Supabase Auth. After sign-in you go to the admin applications list. Visitors never need this screen.'}
          </p>

          <form onSubmit={onSignIn} className="mt-10 space-y-4">
            <label className="block">
              <span className="mb-2 block text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
                Email
              </span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@boardarabia.com"
                className="w-full border border-pearl/20 bg-pearl/5 px-4 py-3.5 text-[1rem] text-pearl outline-none placeholder:text-pearl/35 focus:border-brass"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
                Password
              </span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full border border-pearl/20 bg-pearl/5 px-4 py-3.5 text-[1rem] text-pearl outline-none placeholder:text-pearl/35 focus:border-brass"
              />
            </label>
            {authError && (
              <p className="text-[0.9rem] text-red-300" role="alert">
                {authError}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brass px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:bg-brass-bright disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void onReset()}
              className="w-full border border-pearl/25 px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:border-pearl/50 disabled:opacity-60"
            >
              Email me a reset link
            </button>
            {resetNote && <p className="text-[0.9rem] text-brass-bright">{resetNote}</p>}
          </form>

          {memberEntry && (
            <form onSubmit={onCode} className="mt-8 space-y-4 border-t border-pearl/10 pt-8">
              <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
                One-time code
              </p>
              <label className="block">
                <span className="sr-only">One-time code</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Code from the invitation"
                  className="w-full border border-pearl/20 bg-pearl/5 px-4 py-3.5 text-[1rem] text-pearl outline-none placeholder:text-pearl/35 focus:border-brass"
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="w-full border border-pearl/25 px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:border-pearl/50 disabled:opacity-60"
              >
                {submitting ? 'Signing in…' : 'Use code'}
              </button>
            </form>
          )}

          <p className="mt-8 text-[0.85rem] leading-relaxed text-pearl/45">
            {memberEntry
              ? 'Admission is by invitation. This page does not create accounts. Email me a reset link sends you to set a new password.'
              : 'Email me a reset link opens a page on this site where you choose a new password. An owner can also send a recovery link from the Supabase dashboard if the redirect is https://boardarabia.com/auth/confirm.'}
          </p>
        </div>
      </main>
    </div>
  )
}

function safeNext(raw: string | null): string {
  if (!raw) return '/admin'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/admin'
  if (raw.startsWith('/login')) return '/admin'
  return raw
}

function otpType(raw: string | null): 'invite' | 'magiclink' | 'email' {
  if (raw === 'magiclink' || raw === 'email') return raw
  return 'invite'
}

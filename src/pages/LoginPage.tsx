import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextPath = safeNext(searchParams.get('next'))

  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    document.title = 'Staff login — Board Arabia'
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  async function onSignIn(e: FormEvent) {
    e.preventDefault()
    setAuthError('')
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setSubmitting(false)
    if (error) {
      setAuthError(error.message)
      return
    }
    navigate(nextPath, { replace: true })
  }

  if (session === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink text-pearl">
        <p className="text-stone/70">Loading…</p>
      </div>
    )
  }

  if (session) {
    return <Navigate to={nextPath} replace />
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
            Staff only
          </p>
          <h1 className="mt-3 font-display text-[2.35rem] leading-[1.05] font-bold tracking-[-0.03em] md:text-[2.75rem]">
            Sign in
          </h1>
          <p className="mt-4 text-[0.98rem] leading-relaxed text-stone/70">
            Email and password via Supabase Auth. After sign-in you go to the
            admin applications list. Visitors never need this screen.
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
          </form>

          <p className="mt-8 text-[0.85rem] leading-relaxed text-pearl/45">
            Forgot password? Ask an owner to send a Supabase Auth invite or
            recovery link, or reset it under Authentication → Users in the
            dashboard. See README.
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

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  clearPasswordRecovery,
  passwordRecoveryPending,
  supabase,
} from '../lib/supabase'
import { useNoIndex } from '../lib/usePageTitle'

const OTP_TYPES = ['invite', 'magiclink', 'email', 'recovery', 'signup'] as const
type OtpType = (typeof OTP_TYPES)[number]
type Phase = 'working' | 'set_password' | 'error'

export function AuthConfirmPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('working')
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  useNoIndex('Sign in | Board Arabia')

  useEffect(() => {
    let cancelled = false

    async function confirm() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const tokenHash = searchParams.get('token_hash') || hash.get('token_hash') || ''
      const type = otpType(searchParams.get('type') || hash.get('type'))
      const recovery = type === 'recovery' || passwordRecoveryPending()

      if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        })
        if (cancelled) return
        if (verifyError) {
          clearPasswordRecovery()
          setError(verifyError.message)
          setPhase('error')
          return
        }
        if (type === 'recovery') {
          setPhase('set_password')
          return
        }
        clearPasswordRecovery()
        navigate('/dashboard', { replace: true })
        return
      }

      const code = searchParams.get('code')
      if (code) {
        const existing = await supabase.auth.getSession()
        if (!existing.data.session) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (cancelled) return
          if (exchangeError) {
            clearPasswordRecovery()
            setError(exchangeError.message)
            setPhase('error')
            return
          }
        }
        if (cancelled) return
        if (recovery) {
          setPhase('set_password')
          return
        }
        navigate('/dashboard', { replace: true })
        return
      }

      if (recovery) {
        const { data } = await supabase.auth.getSession()
        if (cancelled) return
        if (data.session) {
          setPhase('set_password')
          return
        }
        clearPasswordRecovery()
        setError('This reset link is missing or has expired.')
        setPhase('error')
        return
      }

      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) {
        navigate('/dashboard', { replace: true })
        return
      }
      setError('This sign-in link is missing or has expired.')
      setPhase('error')
    }

    void confirm()

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY') setPhase('set_password')
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [navigate, searchParams])

  async function onSavePassword(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    if (password.length < 8) {
      setFormError('Use at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.')
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setSaving(false)
      setFormError(updateError.message)
      return
    }
    clearPasswordRecovery()
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) {
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
      return
    }
    const { data: staff } = await supabase
      .from('staff_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (staff) {
      navigate('/admin', { replace: true })
      return
    }
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const title =
    phase === 'set_password' ? 'Set a new password' : phase === 'error' ? 'Link not accepted' : 'Signing you in…'

  return (
    <div className="flex min-h-dvh items-center justify-center bg-pearl px-5 text-ink">
      <div className="w-full max-w-md">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
          Board Arabia
        </p>
        <h1 className="mt-3 font-display text-[2rem] font-bold tracking-[-0.03em]">{title}</h1>
        {phase === 'set_password' && (
          <form onSubmit={onSavePassword} className="mt-6 space-y-4">
            <p className="text-[1rem] leading-relaxed text-ink/65">
              Choose a password for this account. You will use it the next time you sign in.
            </p>
            <label className="block">
              <span className="mb-2 block text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
                New password
              </span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(input) => setPassword(input.target.value)}
                className="w-full border border-ink/15 bg-white px-4 py-3 text-[1rem] text-ink outline-none focus:border-brass"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
                Confirm password
              </span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(input) => setConfirmPassword(input.target.value)}
                className="w-full border border-ink/15 bg-white px-4 py-3 text-[1rem] text-ink outline-none focus:border-brass"
              />
            </label>
            {formError && (
              <p className="text-[0.9rem] text-red-700" role="alert">
                {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-ink px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}
        {phase === 'error' && (
          <>
            <p className="mt-4 text-[1rem] leading-relaxed text-ink/65">{error}</p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                to="/login"
                className="text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
              >
                Staff sign in
              </Link>
              <Link
                to="/login?next=/dashboard"
                className="text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
              >
                Member sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function otpType(raw: string | null): OtpType | null {
  if (
    raw === 'invite' ||
    raw === 'magiclink' ||
    raw === 'email' ||
    raw === 'recovery' ||
    raw === 'signup'
  ) {
    return raw
  }
  return null
}

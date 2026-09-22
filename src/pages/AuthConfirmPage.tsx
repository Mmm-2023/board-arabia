import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useNoIndex } from '../lib/usePageTitle'

const OTP_TYPES = ['invite', 'magiclink', 'email'] as const
type OtpType = (typeof OTP_TYPES)[number]

export function AuthConfirmPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  useNoIndex('Sign in | Board Arabia')

  useEffect(() => {
    let cancelled = false
    async function confirm() {
      const tokenHash = searchParams.get('token_hash') || ''
      const type = otpType(searchParams.get('type'))
      if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        })
        if (cancelled) return
        if (verifyError) {
          setError(verifyError.message)
          return
        }
        navigate('/dashboard', { replace: true })
        return
      }

      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) {
        navigate('/dashboard', { replace: true })
        return
      }
      setError('This sign-in link is missing or has expired.')
    }
    void confirm()
    return () => {
      cancelled = true
    }
  }, [navigate, searchParams])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-pearl px-5 text-ink">
      <div className="max-w-md">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
          Board Arabia
        </p>
        <h1 className="mt-3 font-display text-[2rem] font-bold tracking-[-0.03em]">
          {error ? 'Link not accepted' : 'Signing you in…'}
        </h1>
        {error && (
          <>
            <p className="mt-4 text-[1rem] leading-relaxed text-ink/65">{error}</p>
            <Link
              to="/login?next=/dashboard"
              className="mt-6 inline-block text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
            >
              Member sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function otpType(raw: string | null): OtpType | null {
  if (raw === 'invite' || raw === 'magiclink' || raw === 'email') return raw
  return null
}

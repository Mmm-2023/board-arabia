import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { BrandLockup } from '../components/BrandLockup'
import { mainLandmarkProps } from '../components/SkipLink'
import { MfaHold } from '../components/mfa/MfaHold'
import { signInFieldClassLight } from '../components/mfa/TwoStepScreens'
import { clearPasswordFlag } from '../lib/clearPasswordFlag'
import { readAssurance } from '../lib/mfa'
import { routeHold, type MfaHold as Hold } from '../lib/mfaFlow'
import { resolveAfterLogin } from '../lib/memberGate'
import { isStaffReturn, safeReturnPath } from '../lib/returnPath'
import {
  memberEmailProblem,
  presentSignInNotice,
  SIGN_IN_CODE_FIELD,
  SIGN_IN_PASSWORD,
  type SignInFailure,
  type SignInNotice,
} from '../lib/signInNotice'
import { track } from '../lib/analytics'
import { sendPasswordReset, supabase } from '../lib/supabase'
import { useNoIndex } from '../lib/usePageTitle'

const textLink =
  'inline-flex min-h-11 items-center text-[16px] font-semibold text-[var(--ba-indigo)] underline underline-offset-[3px]'

const primaryButton =
  'ba-primary flex min-h-[52px] w-full items-center justify-center px-6 text-[17px] font-semibold disabled:opacity-60'

const secondaryButton =
  'flex min-h-[52px] w-full items-center justify-center rounded-[6px] border-[1.5px] border-[var(--ba-indigo)] bg-transparent px-6 text-[17px] font-semibold text-[var(--ba-indigo)] disabled:opacity-60'

function fieldClass(invalid: boolean) {
  return [
    signInFieldClassLight,
    'min-h-[52px] rounded-[6px] !border-[1.5px] bg-white px-3.5 text-[16px] text-[var(--ba-ink)] !placeholder:text-[#6d6593]',
    invalid ? '!border-[var(--ba-error)] shadow-[0_0_0_1px_var(--ba-error)]' : '!border-[#6d6593]',
  ].join(' ')
}

function failureOf(error: { message?: string; status?: number; name?: string; code?: string } | null): SignInFailure {
  return {
    message: error?.message,
    status: error?.status,
    name: error?.name,
    code: error?.code,
  }
}

export function LoginPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const onStaffPath = location.pathname === '/login/staff'
  const nextPath = safeReturnPath(searchParams.get('next'), onStaffPath ? '/admin' : '/dashboard')
  const staffEntry = onStaffPath || isStaffReturn(nextPath)

  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [codeMode, setCodeMode] = useState(false)
  const [banner, setBanner] = useState<SignInNotice | null>(null)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [destination, setDestination] = useState<string | null>(null)
  const [hold, setHold] = useState<Hold | 'loading'>('loading')
  const [passCount, setPassCount] = useState(0)
  const [resetNote, setResetNote] = useState('')
  const codeType = otpType(searchParams.get('otp_type'))

  useNoIndex(staffEntry ? 'Staff sign in | Board Arabia' : 'Member sign in | Board Arabia')

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
    setHold('loading')
    setDestination(null)
    void readAssurance().then(async (assurance) => {
      if (cancelled) return
      const step = routeHold({
        area: staffEntry ? 'staff' : 'member',
        currentLevel: assurance.currentLevel,
        verifiedFactor: assurance.verifiedFactor,
      })
      if (step !== 'clear') {
        setHold(step)
        return
      }
      const path = await resolveAfterLogin(session.user.id, nextPath)
      if (!cancelled) {
        setHold('clear')
        setDestination(path)
      }
    })
    return () => {
      cancelled = true
    }
  }, [session, nextPath, staffEntry, passCount])

  async function onSignIn(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    setResetNote('')
    const nextEmailError = memberEmailProblem(email)
    const nextPasswordError = password ? '' : SIGN_IN_PASSWORD
    setEmailError(nextEmailError)
    setPasswordError(nextPasswordError)
    const fieldNotes = [nextEmailError, nextPasswordError].filter(Boolean)
    if (fieldNotes.length) {
      setBanner({ tone: 'error', text: fieldNotes.join(' ') })
      return
    }
    setSubmitting(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error || !data.user) {
        setSubmitting(false)
        setBanner(presentSignInNotice(failureOf(error), 'password'))
        return
      }
      await clearPasswordFlag(data.user.id)
      track('login', { method: 'password', path: staffEntry ? '/admin' : '/dashboard' })
      setSubmitting(false)
    } catch (error) {
      setSubmitting(false)
      setBanner(presentSignInNotice(failureOf(error instanceof Error ? error : null), 'password'))
    }
  }

  async function onReset() {
    setBanner(null)
    setResetNote('')
    const nextEmailError = memberEmailProblem(email)
    setEmailError(nextEmailError)
    if (nextEmailError) {
      setBanner({ tone: 'error', text: nextEmailError })
      return
    }
    setSubmitting(true)
    try {
      const result = await sendPasswordReset(email)
      setSubmitting(false)
      if (result.error) {
        setBanner(presentSignInNotice({ message: result.error }, 'reset'))
        return
      }
      setResetNote('If this inbox can sign in, a reset link is on its way.')
    } catch (error) {
      setSubmitting(false)
      setBanner(presentSignInNotice(failureOf(error instanceof Error ? error : null), 'reset'))
    }
  }

  async function onCode(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    setResetNote('')
    const nextEmailError = memberEmailProblem(email)
    const nextCodeError = code.trim() ? '' : SIGN_IN_CODE_FIELD
    setEmailError(nextEmailError)
    setCodeError(nextCodeError)
    const fieldNotes = [nextEmailError, nextCodeError].filter(Boolean)
    if (fieldNotes.length) {
      setBanner({ tone: 'error', text: fieldNotes.join(' ') })
      return
    }
    setSubmitting(true)
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: codeType,
      })
      if (error || !data.user) {
        setSubmitting(false)
        setBanner(presentSignInNotice(failureOf(error), 'code'))
        return
      }
      track('login', { method: 'code', path: '/dashboard' })
      setSubmitting(false)
    } catch (error) {
      setSubmitting(false)
      setBanner(presentSignInNotice(failureOf(error instanceof Error ? error : null), 'code'))
    }
  }

  if (session === undefined) {
    return (
      <main {...mainLandmarkProps} className="flex min-h-dvh items-center justify-center bg-[var(--ba-porcelain)] text-[var(--ba-ink)]">
        <p className="text-[16px] text-[var(--ba-muted)]">Loading…</p>
      </main>
    )
  }

  if (session) {
    if (hold === 'challenge' || hold === 'enrol') {
      return (
        <MfaHold
          mode={hold}
          tone="dark"
          signOutTo={staffEntry ? '/login/staff' : '/login'}
          onPassed={() => setPassCount((value) => value + 1)}
        />
      )
    }
    if (hold !== 'clear' || !destination) {
      return (
        <main {...mainLandmarkProps} className="flex min-h-dvh items-center justify-center bg-[var(--ba-porcelain)] text-[var(--ba-ink)]">
          <p className="text-[16px] text-[var(--ba-muted)]">Loading…</p>
        </main>
      )
    }
    return <Navigate to={destination} replace />
  }

  const usingCode = codeMode && !staffEntry

  return (
    <div className="flex min-h-dvh justify-center bg-[var(--ba-porcelain)] text-[var(--ba-ink)]" data-screen="sign-in">
      <div className="flex w-full max-w-md flex-col">
        <header className="border-b border-[var(--ba-line)]">
          <div className="flex min-h-[60px] items-center justify-between px-5">
            <BrandLockup to="/" tone="on-light" subline={false} />
            {staffEntry ? (
              <Link to="/" className="inline-flex min-h-11 items-center text-[16px] font-semibold text-[var(--ba-indigo)] underline underline-offset-[3px]">
                Back to site
              </Link>
            ) : (
              <span />
            )}
          </div>
        </header>

        <main {...mainLandmarkProps} className="flex flex-1 flex-col gap-5 px-5 py-7">
          <div className="flex flex-col gap-2">
            <p className="text-[15px] font-semibold tracking-[0.06em] text-[var(--ba-indigo)] uppercase">
              {staffEntry ? 'Staff' : 'Members'}
            </p>
            <h1 className="font-display text-[30px] leading-[1.12] font-bold tracking-[-0.03em]">
              {staffEntry ? 'Staff sign in' : 'Sign in'}
            </h1>
            <p className="text-[16px] leading-normal text-[var(--ba-muted)]">
              {staffEntry
                ? 'Email and password for staff. After sign-in you open admin.'
                : 'For members of Board Arabia.'}
            </p>
          </div>

          {banner ? <SignInAlert notice={banner} /> : null}

          {usingCode ? (
            <form onSubmit={onCode} noValidate className="flex flex-col gap-[18px]">
              <Field
                id="sign-in-email"
                label="Email"
                type="email"
                autoComplete="username"
                value={email}
                placeholder="you@example.com"
                invalid={emailError}
                errorId="sign-in-email-error"
                onChange={(value) => {
                  setEmail(value)
                  if (emailError) setEmailError('')
                }}
              />
              <Field
                id="sign-in-code"
                label="One-time code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                placeholder="Code from your email"
                invalid={codeError}
                errorId="sign-in-code-error"
                onChange={(value) => {
                  setCode(value)
                  if (codeError) setCodeError('')
                }}
              />
              <button type="submit" disabled={submitting} className={secondaryButton}>
                {submitting ? 'Signing in…' : 'Use code'}
              </button>
            </form>
          ) : (
            <form onSubmit={onSignIn} noValidate className="flex flex-col gap-[18px]">
              <Field
                id="sign-in-email"
                label="Email"
                type="email"
                autoComplete="username"
                value={email}
                placeholder="you@example.com"
                invalid={emailError}
                errorId="sign-in-email-error"
                onChange={(value) => {
                  setEmail(value)
                  if (emailError) setEmailError('')
                }}
              />
              <div>
                <label htmlFor="sign-in-password" className="mb-1.5 block text-[15px] font-semibold leading-snug text-[var(--ba-ink)]">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="sign-in-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (passwordError) setPasswordError('')
                    }}
                    placeholder="Your password"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={passwordError ? 'sign-in-password-error' : undefined}
                    className={`${fieldClass(Boolean(passwordError))} pr-20`}
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 right-1 inline-flex min-h-11 -translate-y-1/2 items-center px-2 text-[15px] font-semibold text-[var(--ba-indigo)]"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <FieldError id="sign-in-password-error" text={passwordError} />
              </div>
              <button type="submit" disabled={submitting} className={primaryButton}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {usingCode ? (
            <button
              type="button"
              className={`${textLink} self-center`}
              onClick={() => {
                setCodeMode(false)
                setCodeError('')
                setBanner(null)
              }}
            >
              Use my password instead
            </button>
          ) : (
            <div className="flex flex-col">
              <button type="button" disabled={submitting} className={`${textLink} self-start disabled:opacity-60`} onClick={() => void onReset()}>
                {staffEntry ? 'Forgot password?' : 'Forgot your password?'}
              </button>
              {!staffEntry ? (
                <button
                  type="button"
                  className={`${textLink} self-start`}
                  onClick={() => {
                    setCodeMode(true)
                    setPasswordError('')
                    setBanner(null)
                  }}
                >
                  Use a one-time code instead
                </button>
              ) : null}
            </div>
          )}

          {resetNote ? (
            <p className="text-[16px] leading-snug text-[var(--ba-ink)]" role="status">
              {resetNote}
            </p>
          ) : null}

          {!staffEntry ? (
            <section className="rounded-lg border border-[var(--ba-line)] bg-[var(--ba-lavender-mist)] p-4" aria-labelledby="not-a-member">
              <h2 id="not-a-member" className="font-display text-[18px] leading-[1.12] font-bold tracking-[-0.03em]">
                Not a member yet?
              </h2>
              <p className="mt-1 text-[16px] leading-normal text-[var(--ba-muted)]">Board Arabia is by application.</p>
              <Link to="/apply" className={textLink}>
                Apply for consideration
              </Link>
              <p className="mt-1.5 text-[15px] leading-snug text-[var(--ba-muted)]">
                Accepted already? Use the link in your acceptance email to create your account.
              </p>
              <button type="button" disabled={submitting} className={`${textLink} disabled:opacity-60`} onClick={() => void onReset()}>
                Email me a new link
              </button>
            </section>
          ) : (
            <p className="text-[15px] leading-relaxed text-[var(--ba-muted)]">
              Forgot password? sends a link to choose a new password on this site. This page does not create accounts.
            </p>
          )}

          <div className="mt-auto flex flex-col gap-3">
            <p className="text-[15px] leading-relaxed text-[var(--ba-muted)]">
              Signed-in area. Never share your one-time code.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-[var(--ba-line)] pt-2">
              {staffEntry ? (
                <Link to="/login" className={textLink}>
                  Member sign in
                </Link>
              ) : (
                <>
                  <Link to="/" className={textLink}>
                    Back to the site
                  </Link>
                  <Link to="/login/staff" className={textLink}>
                    Admin sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  type,
  autoComplete,
  inputMode,
  value,
  placeholder,
  invalid,
  errorId,
  onChange,
}: {
  id: string
  label: string
  type: string
  autoComplete: string
  inputMode?: 'numeric'
  value: string
  placeholder: string
  invalid: string
  errorId: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-semibold leading-snug text-[var(--ba-ink)]">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={fieldClass(Boolean(invalid))}
      />
      <FieldError id={errorId} text={invalid} />
    </div>
  )
}

function FieldError({ id, text }: { id: string; text: string }) {
  if (!text) return null
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-[15px] leading-snug font-medium text-[var(--ba-error)]">
      <NoticeIcon />
      <span>{text}</span>
    </p>
  )
}

function SignInAlert({ notice }: { notice: SignInNotice }) {
  const toneClass =
    notice.tone === 'warn'
      ? 'border-[var(--ba-warn)] bg-[#fbf5e8] text-[#5c4210]'
      : 'border-[var(--ba-error)] bg-[#fbefef] text-[#6e2323]'
  return (
    <div role="alert" className={`flex gap-3 rounded-lg border-[1.5px] px-4 py-3.5 text-[16px] leading-snug font-medium ${toneClass}`}>
      <NoticeIcon />
      <span>{notice.text}</span>
    </div>
  )
}

function NoticeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.1" />
    </svg>
  )
}

function otpType(raw: string | null): 'invite' | 'magiclink' | 'email' {
  if (raw === 'magiclink' || raw === 'email') return raw
  return 'invite'
}

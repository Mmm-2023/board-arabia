import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BrandLockup } from '../components/BrandLockup'
import { signInFieldClassLight } from '../components/mfa/TwoStepScreens'
import {
  LINK_PROBLEM_HEADING,
  LINK_PROBLEM_NETWORK,
  LINK_PROBLEM_SENT,
  LINK_PROBLEM_WAIT,
  linkProblemCooling,
  linkProblemEmailProblem,
  linkProblemWaitUntil,
  presentLinkProblem,
} from '../lib/linkProblem'
import type { SignInNotice } from '../lib/signInNotice'
import { requestPasswordResetLetter } from '../lib/supabase'

const textLink =
  'inline-flex min-h-11 items-center text-[16px] font-semibold text-[var(--ba-indigo)] underline underline-offset-[3px]'

const primaryButton =
  'ba-primary flex min-h-[52px] w-full items-center justify-center px-6 text-[17px] font-semibold disabled:opacity-60'

function fieldClass(invalid: boolean) {
  return [
    signInFieldClassLight,
    'min-h-[52px] rounded-[6px] !border-[1.5px] bg-white px-3.5 text-[16px] text-[var(--ba-ink)] !placeholder:text-[#6d6593]',
    invalid ? '!border-[var(--ba-error)] shadow-[0_0_0_1px_var(--ba-error)]' : '!border-[#6d6593]',
  ].join(' ')
}

/** Expired, used, and missing links share this screen. One primary action asks for a new link. */
export function LinkProblemScreen() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [banner, setBanner] = useState<SignInNotice | null>(null)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [waitUntil, setWaitUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const cooling = linkProblemCooling(now, waitUntil)

  useEffect(() => {
    if (!cooling) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [cooling])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (sendingRef.current || linkProblemCooling(Date.now(), waitUntil)) return
    setBanner(null)
    const problem = linkProblemEmailProblem(email)
    setEmailError(problem)
    if (problem) {
      setBanner({ tone: 'error', text: problem })
      return
    }
    sendingRef.current = true
    setSending(true)
    try {
      const call = await requestPasswordResetLetter(email)
      const result = presentLinkProblem(call)
      if (result.kind === 'sent') {
        setSent(true)
        setEmailError('')
        setBanner(null)
        setWaitUntil(linkProblemWaitUntil(Date.now()))
        return
      }
      if (result.kind === 'wait') {
        setWaitUntil(linkProblemWaitUntil(Date.now()))
        setBanner(null)
        return
      }
      if (result.kind === 'invalid') {
        setEmailError(result.text)
        setBanner({ tone: 'error', text: result.text })
        return
      }
      setBanner({ tone: 'error', text: result.text })
    } catch {
      setBanner({ tone: 'error', text: LINK_PROBLEM_NETWORK })
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-dvh justify-center bg-[var(--ba-porcelain)] text-[var(--ba-ink)]" data-screen="link-problem">
      <div className="flex w-full max-w-md flex-col">
        <header className="border-b border-[var(--ba-line)]">
          <div className="flex min-h-[60px] items-center px-5">
            <BrandLockup to="/" tone="on-light" subline={false} />
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-5 px-5 py-7">
          <h1 className="font-display text-[30px] leading-[1.2] font-bold tracking-[-0.03em]">{LINK_PROBLEM_HEADING}</h1>

          {banner ? <LinkProblemAlert notice={banner} /> : null}

          {sent ? (
            <p className="text-[16px] leading-snug text-[var(--ba-ink)]" role="status" data-link-sent="">
              {LINK_PROBLEM_SENT}
            </p>
          ) : null}

          {cooling ? (
            <p className="flex items-start gap-2 text-[16px] leading-snug font-medium text-[#5c4210]" role="status" data-link-wait="">
              <NoticeIcon />
              <span>{LINK_PROBLEM_WAIT}</span>
            </p>
          ) : null}

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]" aria-busy={sending || undefined}>
            <div>
              <label htmlFor="link-email" className="mb-1.5 block text-[15px] font-semibold leading-snug text-[var(--ba-ink)]">
                Email
              </label>
              <input
                id="link-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(input) => {
                  setEmail(input.target.value)
                  if (emailError) setEmailError('')
                }}
                placeholder="you@example.com"
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'link-email-error' : undefined}
                className={fieldClass(Boolean(emailError))}
              />
              <FieldError id="link-email-error" text={emailError} />
            </div>
            <button type="submit" disabled={sending || cooling} className={primaryButton}>
              {sending ? 'Sending…' : 'Email me a new link'}
            </button>
          </form>

          <Link to="/login" className={`${textLink} self-start`}>
            Back to sign in
          </Link>
        </main>
      </div>
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

function LinkProblemAlert({ notice }: { notice: SignInNotice }) {
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

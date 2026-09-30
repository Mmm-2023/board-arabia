import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TurnstileField } from '../../components/TurnstileField'

export function VerifyScreen({
  email,
  submitting,
  resending,
  error,
  note,
  resendWait,
  onSubmit,
  onResend,
  security = 'live',
  nav,
}: {
  email: string
  submitting: boolean
  resending: boolean
  error: string
  note: string
  resendWait: number
  onSubmit: (code: string) => void
  onResend: (token: string) => void
  security?: 'live' | 'preview'
  nav: ReactNode
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [token, setToken] = useState('')
  const code = digits.join('')

  function setDigit(index: number, value: string) {
    const next = value.replace(/\D/g, '').slice(-1)
    setDigits((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)))
    if (next && index < 5) {
      const input = document.getElementById(`code-${index + 1}`)
      input?.focus()
    }
  }

  function onPaste(text: string) {
    const chars = text.replace(/\D/g, '').slice(0, 6).split('')
    if (chars.length === 0) return
    setDigits(Array.from({ length: 6 }, (_, index) => chars[index] || ''))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit(code)
  }

  return (
    <>
      {nav}
      <main className="min-h-dvh bg-pearl px-5 pt-24 pb-16 md:pt-28" data-screen="verify">
        <form onSubmit={submit} className="mx-auto w-full max-w-md border border-[var(--ba-line)] bg-white px-5 py-6">
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Check your email</p>
          <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Enter your code</h1>
          <p className="mt-3 text-[1rem] leading-relaxed text-ink/70">
            We sent a 6 digit code{email ? ` to ${email}` : ''}. It expires in 10 minutes and works once.
          </p>
          <div className="mt-6 grid grid-cols-6 gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                id={`code-${index}`}
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                aria-label={`Digit ${index + 1}`}
                value={digit}
                onChange={(event) => setDigit(index, event.target.value)}
                onPaste={(event) => {
                  event.preventDefault()
                  onPaste(event.clipboardData.getData('text'))
                }}
                className="min-h-12 border border-[var(--ba-line)] bg-white text-center text-[1.25rem]"
              />
            ))}
          </div>
          {error ? (
            <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
              {error}
            </p>
          ) : null}
          {note ? (
            <p className="mt-4 text-[0.95rem] text-ink/70" role="status">
              {note}
            </p>
          ) : null}
          <button
            type="submit"
            className="ba-primary mt-6 inline-flex min-h-11 w-full items-center justify-center text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
            disabled={submitting || code.length !== 6}
          >
            {submitting ? 'Checking…' : 'Confirm email'}
          </button>
          <div className="mt-6">
            {security === 'preview' ? (
              <p className="min-h-16 border border-[var(--ba-line)] px-3 py-3 text-[0.95rem]" data-turnstile="preview">
                Security check
              </p>
            ) : (
              <TurnstileField onToken={setToken} />
            )}
          </div>
          <button
            type="button"
            className="mt-4 inline-flex min-h-11 items-center text-[0.95rem] text-ink underline disabled:opacity-40"
            disabled={resending || resendWait > 0 || !(security === 'preview' || token)}
            onClick={() => onResend(security === 'preview' ? 'preview-token' : token)}
          >
            {resendWait > 0 ? `Resend code in ${resendWait}s` : resending ? 'Sending…' : 'Resend code'}
          </button>
          <p className="mt-4">
            <Link to="/apply" className="inline-flex min-h-11 items-center text-[0.95rem] text-ink underline">
              Change email
            </Link>
          </p>
        </form>
      </main>
    </>
  )
}

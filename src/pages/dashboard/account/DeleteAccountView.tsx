import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountBackLink } from '../AccountBackLink'

const primary =
  'ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40'

export function DeleteAccountView({
  heading = 'Delete account',
  step,
  busy,
  error,
  code,
  sent,
  onCode,
  onContinue,
  onSendCode,
  onConfirm,
}: {
  heading?: string
  step: 'explain' | 'code'
  busy: boolean
  error: string
  code: string
  sent: boolean
  onCode: (value: string) => void
  onContinue: () => void
  onSendCode: () => void
  onConfirm: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  const codeReady = sent && /^\d{6}$/.test(code)
  return (
    <div className="account-main max-w-xl" data-screen="delete-account" data-delete-step={step}>
      <AccountBackLink to="/dashboard/privacy" label="Back to Your privacy" />
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Account</p>
      <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">{heading}</h1>
      {step === 'explain' ? (
        <>
          <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-ink/75">
            This closes the account for every member, including a full membership. It cannot be undone.
          </p>
          <h2 className="mt-8 font-display text-[1.35rem] font-semibold tracking-[-0.02em]">What is deleted</h2>
          <ul className="mt-3 max-w-xl list-disc space-y-2 pl-5 text-[1rem] leading-relaxed text-ink/75">
            <li>Your profile and directory card</li>
            <li>Your directory listing</li>
            <li>Your introductions</li>
            <li>Your notifications</li>
            <li>Messages you sent</li>
          </ul>
          <h2 className="mt-8 font-display text-[1.35rem] font-semibold tracking-[-0.02em]">What is kept</h2>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/75">
            Legal records and consent logs stay, as set out in the retention rules. The account reference on those rows
            is removed, unless a legal hold applies.
          </p>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/75">
            Admin sees a notice in the app. No separate request is sent.
          </p>
          <label className="mt-6 flex min-h-11 items-start gap-3 text-[1rem] leading-relaxed">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>I understand this removes my account.</span>
          </label>
          {error ? (
            <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" className={primary} disabled={!confirmed || busy} onClick={onContinue}>
              Continue
            </button>
            <Link to="/dashboard" className="inline-flex min-h-11 items-center text-[0.95rem] underline">
              Keep my account
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-ink/75">
            We send a code to the email on this account. Enter it here before the account is deleted. The code expires
            in 10 minutes and works once.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" className={primary} disabled={busy} onClick={onSendCode}>
              {busy && !sent ? 'Sending…' : sent ? 'Send a new code' : 'Send code'}
            </button>
          </div>
          <label className="mt-6 block text-[1rem] leading-relaxed">
            <span className="font-semibold">Code</span>
            <input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="mt-2 block w-full max-w-[12rem] border border-ink/20 px-3 py-3 text-[1.05rem]"
              onChange={(event) => onCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          {error ? (
            <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" className={primary} disabled={!codeReady || busy} onClick={onConfirm}>
              {busy && sent ? 'Deleting…' : 'Delete account'}
            </button>
            <Link to="/dashboard" className="inline-flex min-h-11 items-center text-[0.95rem] underline">
              Keep my account
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

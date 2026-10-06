import { useState } from 'react'
import { Link } from 'react-router-dom'

const primary =
  'ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40'

export function DeleteAccountView({
  busy,
  error,
  onConfirm,
}: {
  busy: boolean
  error: string
  onConfirm: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div className="account-main max-w-xl" data-screen="delete-account">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Account</p>
      <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Delete account</h1>
      <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-ink/75">
        This removes your account, the professional details you added for membership review, and your sign-in. It cannot be undone. A full
        member record is not removed from this page.
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
        <button type="button" className={primary} disabled={!confirmed || busy} onClick={onConfirm}>
          {busy ? 'Deleting…' : 'Delete account'}
        </button>
        <Link to="/dashboard" className="inline-flex min-h-11 items-center text-[0.95rem] underline">
          Keep my account
        </Link>
      </div>
    </div>
  )
}

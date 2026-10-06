import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandLockup } from '../BrandLockup'
import { homeMemberPrompt } from '../../lib/mfaFlow'

export const signInFieldClass =
  'w-full border border-pearl/20 bg-pearl/5 px-4 py-3.5 text-[1rem] text-pearl placeholder:text-pearl/35 focus-visible:border-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ba-lavender-mist)]'

export const signInFieldClassLight =
  'w-full border border-ink/15 bg-white px-4 py-3.5 text-[1rem] text-ink placeholder:text-ink/35 focus-visible:border-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ba-copper-deep)]'

const darkInput = signInFieldClass
const lightInput = signInFieldClassLight

export function TwoStepEnrolScreen({
  tone,
  forced,
  qr,
  manualKey,
  code,
  error,
  factors,
  busy,
  onCode,
  onVerify,
  onStart,
  onRemove,
}: {
  tone: 'dark' | 'light'
  forced: boolean
  qr: string
  manualKey: string
  code: string
  error: string
  factors: Array<{ id: string; status: string }>
  busy: boolean
  onCode: (value: string) => void
  onVerify: (event: FormEvent) => void
  onStart: () => void
  onRemove: (factorId: string) => void
}) {
  const light = tone === 'light'
  const verified = factors.filter((factor) => factor.status === 'verified')
  return (
    <section className={light ? 'max-w-lg text-ink' : 'text-pearl'} aria-labelledby="two-step-title">
      <p className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${light ? 'text-brass' : 'text-brass-bright'}`}>
        {forced ? 'Admin' : 'Account'}
      </p>
      <h1 id="two-step-title" className="mt-3 font-display text-[2.1rem] leading-[1.05] font-bold tracking-[-0.03em]">
        Two-step sign-in
      </h1>
      <p className={`mt-4 text-[1rem] leading-relaxed ${light ? 'text-ink/70' : 'text-stone/70'}`}>
        Add an authenticator app for extra protection.
      </p>
      {forced ? (
        <p className={`mt-3 text-[0.95rem] leading-relaxed ${light ? 'text-ink/70' : 'text-stone/70'}`}>
          Admin sign-in needs an authenticator app before the admin area opens.
        </p>
      ) : null}
      {verified.length > 0 ? (
        <ul className="mt-8 space-y-3">
          {verified.map((factor, index) => (
            <li key={factor.id} className={`flex items-center justify-between gap-3 border px-4 py-3 ${light ? 'border-ink/15 bg-white' : 'border-pearl/15'}`}>
              <span>Authenticator app {index + 1}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(factor.id)}
                className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold underline decoration-current/30 underline-offset-4"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {qr ? (
        <form onSubmit={onVerify} className="mt-8 space-y-4">
          <img data-mfa-qr alt="" src={qr} className="h-44 w-44 bg-white p-2" />
          <p className={`text-[0.85rem] ${light ? 'text-ink/60' : 'text-pearl/60'}`}>
            Or enter this key in the app.
          </p>
          <p data-mfa-key className="font-mono text-[0.95rem] break-all">
            {manualKey}
          </p>
          <label className="block">
            <span className={`mb-2 block text-[0.72rem] font-semibold tracking-[0.08em] uppercase ${light ? 'text-ink/45' : 'text-pearl/45'}`}>
              Code
            </span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => onCode(event.target.value)}
              placeholder="123456"
              className={light ? lightInput : darkInput}
            />
          </label>
          {error ? (
            <p className="text-[0.9rem] text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className="ba-primary px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-60">
            {busy ? 'Checking…' : 'Confirm code'}
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onStart}
          className="ba-primary mt-8 px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-60"
        >
          {busy ? 'Starting…' : 'Turn on two-step sign-in'}
        </button>
      )}
    </section>
  )
}

export function TwoStepChallengeScreen({
  tone,
  code,
  error,
  busy,
  onCode,
  onSubmit,
  onSignOut,
}: {
  tone: 'dark' | 'light'
  code: string
  error: string
  busy: boolean
  onCode: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onSignOut: () => void
}) {
  const light = tone === 'light'
  return (
    <section className={light ? 'max-w-md text-ink' : 'mx-auto w-full max-w-md text-pearl'} aria-labelledby="mfa-challenge-title">
      <BrandLockup to="/" tone={light ? 'on-light' : 'on-dark'} />
      <p className={`mt-8 text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${light ? 'text-brass' : 'text-brass-bright'}`}>
        Two-step sign-in
      </p>
      <h1 id="mfa-challenge-title" className="mt-3 font-display text-[2.1rem] leading-[1.05] font-bold tracking-[-0.03em]">
        Enter your code
      </h1>
      <p className={`mt-4 text-[1rem] leading-relaxed ${light ? 'text-ink/70' : 'text-stone/70'}`}>
        Open your authenticator app and enter the current code.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="sr-only">One-time code</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => onCode(event.target.value)}
            placeholder="Code"
            className={light ? lightInput : darkInput}
          />
        </label>
        {error ? (
          <p className={`text-[0.9rem] ${light ? 'text-red-700' : 'text-red-300'}`} role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className="ba-primary w-full px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-60">
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
      <button
        type="button"
        onClick={onSignOut}
        className={`mt-6 inline-flex min-h-11 items-center text-[0.95rem] font-semibold underline underline-offset-4 ${light ? 'text-ink/70 decoration-ink/30' : 'text-pearl/80 decoration-pearl/30'}`}
      >
        Sign out
      </button>
    </section>
  )
}

export function MemberMfaPrompt({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-4 text-[0.92rem] leading-snug text-ink"
      role="status"
      data-mfa-prompt=""
    >
      <p>Protect your seat: turn on two-step sign-in.</p>
      <span className="inline-flex items-center gap-x-4">
        <Link
          to="/dashboard/two-step"
          className="inline-flex min-h-11 items-center font-semibold underline decoration-ink/30 underline-offset-4"
        >
          Turn on
        </Link>
        <button type="button" onClick={onDismiss} className="inline-flex min-h-11 items-center font-semibold text-ink/70">
          Not now
        </button>
      </span>
    </div>
  )
}

export function MemberHomePrompt({
  pathname,
  verifiedFactor,
  dismissedAt,
  now,
  onDismiss,
}: {
  pathname: string
  verifiedFactor: boolean
  dismissedAt: number | null
  now: number
  onDismiss: () => void
}) {
  if (!homeMemberPrompt({ pathname, verifiedFactor, dismissedAt, now })) return null
  return <MemberMfaPrompt onDismiss={onDismiss} />
}

export function AdminShareBar({
  shared,
  deckShared,
  busy,
  showDeck,
  onToggle,
  onToggleDeck,
}: {
  shared: boolean
  deckShared?: boolean
  busy: boolean
  showDeck?: boolean
  onToggle: () => void
  onToggleDeck?: () => void
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-3" data-admin-share={shared ? 'on' : 'off'}>
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.95rem] font-semibold"
      >
        {shared ? 'Stop sharing' : 'Share with admin'}
      </button>
      {showDeck && onToggleDeck ? (
        <button
          type="button"
          disabled={busy}
          onClick={onToggleDeck}
          className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.95rem] font-semibold"
        >
          {deckShared ? 'Stop sharing the deck file' : 'Share the deck file with admin'}
        </button>
      ) : null}
    </div>
  )
}

export function Frame({ tone, children }: { tone: 'dark' | 'light'; children: ReactNode }) {
  if (tone === 'light') {
    return <div className="bg-pearl px-5 py-8 text-ink">{children}</div>
  }
  return (
    <div className="min-h-dvh bg-ink px-5 py-16 text-pearl">
      <div className="mx-auto max-w-md">{children}</div>
    </div>
  )
}

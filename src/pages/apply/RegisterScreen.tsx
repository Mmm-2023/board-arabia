import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TurnstileField } from '../../components/TurnstileField'
import { registerStrip } from '../../content/trust'
import { isTwoTierRegisterEnabled } from '../../lib/twoTierRegister'

const ROLES = [
  { id: 'chairperson', label: 'Chairperson' },
  { id: 'board_member', label: 'Board member' },
  { id: 'c_suite', label: 'C-suite executive' },
  { id: 'other', label: 'Other' },
] as const

const REGIONS = [
  { id: 'ksa_gcc', label: 'Saudi Arabia and the GCC' },
  { id: 'intl', label: 'International' },
] as const

const fieldClass =
  'mt-2 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem] text-ink outline-none focus:border-[var(--ba-indigo)]'
const labelClass = 'text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase'

export type RegisterValues = {
  fullName: string
  email: string
  role: string
  region: string
  consent: boolean
  turnstileToken: string
  inviteReason: string
  companyFax: string
  formStartedAt: number
}

export function RegisterScreen({
  invite,
  submitting,
  error,
  onSubmit,
  onFocus,
  security = 'live',
  footer,
  nav,
}: {
  invite: { kind: 'none' } | { kind: 'checking' } | { kind: 'bad'; message: string } | { kind: 'valid'; label: string }
  submitting: boolean
  error: string
  onSubmit: (values: RegisterValues) => void
  onFocus: () => void
  security?: 'live' | 'preview'
  footer: ReactNode
  nav: ReactNode
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [region, setRegion] = useState('')
  const [consent, setConsent] = useState(false)
  const [inviteReason, setInviteReason] = useState('')
  const [token, setToken] = useState('')
  const [companyFax, setCompanyFax] = useState('')
  const [formStartedAt] = useState(() => Date.now())
  const securityReady = security === 'preview' || Boolean(token)
  const blocked = submitting || !securityReady
  const trustStrip = registerStrip(isTwoTierRegisterEnabled())

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit({
      fullName,
      email,
      role,
      region,
      consent,
      turnstileToken: security === 'preview' ? 'preview-token' : token,
      inviteReason,
      companyFax,
      formStartedAt,
    })
  }

  return (
    <>
      {nav}
      <main className="min-h-dvh bg-pearl pt-24 pb-20 md:pt-28" data-screen="register">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-2 lg:items-start lg:px-10">
          <form className="relative order-1 space-y-5 lg:order-2" onSubmit={submit}>
            <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">
              Register for consideration
            </p>
            <h1 className="font-display text-[clamp(2rem,4.5vw,3.1rem)] font-bold leading-[1.05] tracking-[-0.03em]">
              Start with an account. Membership follows review.
            </h1>
            <p className="text-[1.02rem] leading-relaxed text-ink/70">
              For Chairpersons, Board members and C-suite executives in Saudi Arabia, the GCC and internationally. Your
              account opens after you confirm your email. Member-only content stays locked until admin approves full
              membership.
            </p>

            {invite.kind === 'checking' ? <p className="text-[0.95rem] text-ink/55">Checking this invite link.</p> : null}
            {invite.kind === 'bad' ? (
              <p className="border border-[var(--ba-line)] bg-white px-4 py-3 text-[0.95rem]" role="status">
                {invite.message}
              </p>
            ) : null}
            {invite.kind === 'valid' ? (
              <div className="border border-[var(--ba-line)] bg-white px-4 py-4">
                <p className={labelClass}>Invited by</p>
                <p className="mt-2 text-[1.05rem]">{invite.label}</p>
                <label className="mt-4 block">
                  <span className={labelClass}>Why were you invited?</span>
                  <textarea
                    required
                    value={inviteReason}
                    onChange={(event) => setInviteReason(event.target.value)}
                    onFocus={onFocus}
                    rows={3}
                    className={fieldClass}
                  />
                </label>
              </div>
            ) : null}

            <div className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
              <label>
                Fax
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={companyFax}
                  onChange={(event) => setCompanyFax(event.target.value)}
                />
              </label>
            </div>
            <label className="block">
              <span className={labelClass}>Full name</span>
              <input required value={fullName} onChange={(event) => setFullName(event.target.value)} onFocus={onFocus} className={fieldClass} autoComplete="name" />
            </label>
            <label className="block">
              <span className={labelClass}>Work email</span>
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} onFocus={onFocus} className={fieldClass} autoComplete="email" />
            </label>
            <label className="block">
              <span className={labelClass}>Role</span>
              <select required value={role} onChange={(event) => setRole(event.target.value)} onFocus={onFocus} className={fieldClass}>
                <option value="">Choose a role</option>
                {ROLES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {role === 'other' ? (
              <p className="text-[0.92rem] leading-relaxed text-ink/60">
                Board Arabia is held for Chairpersons, Board members and C-suite executives. If your role is different, tell
                admin in your statement.
              </p>
            ) : null}
            <label className="block">
              <span className={labelClass}>Region</span>
              <select required value={region} onChange={(event) => setRegion(event.target.value)} onFocus={onFocus} className={fieldClass}>
                <option value="">Choose a region</option>
                {REGIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-start gap-3 text-[0.98rem] leading-relaxed">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                required
              />
              <span>
                I agree to the <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy notice</Link>.
              </span>
            </label>
            <p className="text-[0.92rem] leading-relaxed text-ink/60">
              We record which link brought you here to understand how people find Board Arabia.{' '}
              <Link to="/privacy" className="underline">Privacy</Link>
            </p>
            {security === 'preview' ? (
              <p className="min-h-16 border border-[var(--ba-line)] bg-white px-3 py-3 text-[0.95rem]" data-turnstile="preview">
                Security check
              </p>
            ) : (
              <TurnstileField onToken={setToken} />
            )}
            {error ? (
              <p className="text-[0.95rem] text-[var(--ba-error)]" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="ba-primary inline-flex min-h-11 items-center px-5 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40" disabled={blocked}>
              {submitting ? 'Sending…' : 'Register for consideration'}
            </button>
            {trustStrip ? (
              <p className="text-[0.92rem] leading-relaxed text-ink/60" data-trust-strip="register">
                {trustStrip}
              </p>
            ) : null}
            <div className="order-2 lg:hidden">
              <NextSteps />
            </div>
          </form>
          <aside className="order-2 hidden lg:order-1 lg:block">
            <NextSteps />
          </aside>
        </div>
      </main>
      {footer}
    </>
  )
}

function NextSteps() {
  return (
    <div className="border border-[var(--ba-line)] bg-white px-5 py-5">
      <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">What happens next</h2>
      <ol className="mt-4 space-y-3 text-[1rem] leading-relaxed text-ink/75">
        <li>1. Confirm your email.</li>
        <li>2. Complete a few credentials inside.</li>
        <li>3. Request full membership. Admin decides.</li>
      </ol>
      <p className="mt-4 text-[0.95rem] leading-relaxed text-ink/60">
        For Chairpersons, Board members and C-suite executives. Membership is by review.
      </p>
    </div>
  )
}

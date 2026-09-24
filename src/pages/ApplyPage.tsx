import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { Seo } from '../components/Seo'
import { REVIEW_SLA } from '../content/marketing'
import { parseUsdInput } from '../lib/capacity'
import { lookupMemberInvite, submitApplication } from '../lib/supabase'

type FormState = {
  fullName: string
  email: string
  phone: string
  turnover: string
  foAum: string
  investable: string
  includeInPublic: boolean
  linkedinUrl: string
  jobTitles: string
  companies: string
}

const empty: FormState = {
  fullName: '',
  email: '',
  phone: '',
  turnover: '',
  foAum: '',
  investable: '',
  includeInPublic: true,
  linkedinUrl: '',
  jobTitles: '',
  companies: '',
}

type InviteView =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'valid'; label: string; token: string }
  | { kind: 'bad'; message: string }

const INVITE_NOTE = {
  invalid: 'This invite link is invalid. You can still request consideration.',
  expired: 'This invite link has expired. You can still request consideration.',
  used: 'This invite was already used. You can still request consideration.',
  limited: 'This invite link could not be checked just now. You can still request consideration.',
} as const

export function ApplyPage() {
  const [params] = useSearchParams()
  const inviteParam = (params.get('invite') || '').trim()
  const [form, setForm] = useState<FormState>(empty)
  const [inviteReason, setInviteReason] = useState('')
  const [lookup, setLookup] = useState<{ token: string; view: InviteView } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [emailNote, setEmailNote] = useState('')
  const tokenOk = /^[A-Za-z0-9_-]{43,80}$/.test(inviteParam)
  const inviteView: InviteView = !inviteParam
    ? { kind: 'none' }
    : !tokenOk
      ? { kind: 'bad', message: INVITE_NOTE.invalid }
      : lookup?.token === inviteParam
        ? lookup.view
        : { kind: 'checking' }

  useEffect(() => {
    if (!tokenOk) return
    let cancelled = false
    void lookupMemberInvite(inviteParam).then((result) => {
      if (cancelled) return
      if (result.valid) {
        setLookup({
          token: inviteParam,
          view: { kind: 'valid', label: result.inviterLabel, token: inviteParam },
        })
        return
      }
      setLookup({
        token: inviteParam,
        view: { kind: 'bad', message: INVITE_NOTE[result.state] },
      })
    })
    return () => {
      cancelled = true
    }
  }, [inviteParam, tokenOk])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const fullName = form.fullName.trim().slice(0, 200)
    const email = form.email.trim().slice(0, 320)
    const phone = form.phone.trim().slice(0, 40)
    const turnover = form.turnover.trim().slice(0, 500)
    const foAum = form.foAum.trim().slice(0, 500)
    const investable = parseUsdInput(form.investable)
    const linkedinUrl = form.linkedinUrl.trim().slice(0, 500)
    const jobTitles = form.jobTitles.trim().slice(0, 2000)
    const companies = form.companies.trim().slice(0, 4000)

    if (!fullName || !email || !linkedinUrl || !jobTitles || !companies) {
      setError('Name, email, LinkedIn, job titles, and companies are required.')
      return
    }
    if (!turnover && !foAum) {
      setError('Provide turnover or family-office AUM / size.')
      return
    }
    if (investable === 'invalid') {
      setError('Investable capacity must be a USD number, or leave it blank.')
      return
    }
    if (inviteView.kind === 'checking') {
      setError('Still checking the invite link.')
      return
    }
    const reason = inviteReason.trim().slice(0, 500)
    if (inviteView.kind === 'valid' && !reason) {
      setError('Say why you were invited.')
      return
    }
    try {
      const u = new URL(linkedinUrl)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        setError('LinkedIn URL must start with https://')
        return
      }
    } catch {
      setError('LinkedIn URL is not valid.')
      return
    }

    setSubmitting(true)
    const result = await submitApplication({
      full_name: fullName,
      email,
      phone: phone || null,
      turnover,
      fo_aum: foAum || null,
      investable_capacity_usd: investable,
      include_in_public_aggregates: form.includeInPublic,
      linkedin_url: linkedinUrl,
      job_titles: jobTitles,
      companies,
      invite_token: inviteView.kind === 'valid' ? inviteView.token : null,
      invite_reason: inviteView.kind === 'valid' ? reason : null,
    })
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    const parts: string[] = []
    if (result.dryRun) {
      parts.push('Application saved. Confirmation email is logged until outbound mail is connected.')
    } else {
      parts.push('Acknowledgement and staff notify emails were queued.')
    }
    if (inviteView.kind === 'valid' && result.inviteAttached === false) {
      parts.push('The invite could not be attached. Your request was still received and will be reviewed.')
    }
    setEmailNote(parts.join(' '))
    setDone(true)
  }

  if (done) {
    return (
      <>
        <Seo path="/apply" />
        <Nav ctaTo="/" ctaLabel="Home" />
        <main className="min-h-dvh bg-pearl pt-24 pb-20 md:pt-28">
          <div className="mx-auto max-w-xl px-5 text-center md:px-10">
            <p className="font-serif text-[1.15rem] italic text-ink-soft/70">
              Received
            </p>
            <h1 className="mt-3 font-display text-[clamp(2rem,4.5vw,3rem)] font-bold tracking-[-0.03em] text-ink">
              Consideration requested
            </h1>
            <p className="mt-5 text-[1.05rem] leading-relaxed text-ink/65">
              Thank you. We have your pre-vet details. There is nothing to
              arrange on this site. {REVIEW_SLA} You will hear back with an
              acceptance and a private next step by email, or with a decline.
            </p>
            {emailNote && (
              <p className="mt-4 text-[0.9rem] text-ink/50">{emailNote}</p>
            )}
            <Link
              to="/"
              className="ba-primary mt-10 inline-flex items-center justify-center px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] uppercase transition-colors"
            >
              Return home
            </Link>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Seo path="/apply" />
      <Nav />
      <main className="min-h-dvh bg-pearl pt-24 pb-20 md:pt-28">
        <div className="mx-auto max-w-2xl px-5 md:px-10">
          <p className="font-serif text-[1.15rem] italic text-ink-soft/70">
            Pre-vet
          </p>
          <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.035em] text-ink">
            Apply for consideration
          </h1>
          <p className="mt-5 text-[1.05rem] leading-relaxed text-ink/65">
            Request consideration for Board Arabia by submitting a pre-vet
            form. The desk reviews credentials; accepted candidates receive a
            private conversation invite by email. {REVIEW_SLA} That link is
            not on this website.
          </p>

          {inviteView.kind === 'checking' && (
            <p className="mt-8 text-[0.95rem] text-ink/55">Checking this invite link.</p>
          )}
          {inviteView.kind === 'bad' && (
            <p className="mt-8 border border-ink/10 bg-white/60 px-4 py-3 text-[0.95rem] text-ink/75" role="status">
              {inviteView.message}
            </p>
          )}
          {inviteView.kind === 'valid' && (
            <div className="mt-8 border border-brass/40 bg-white/60 px-4 py-4">
              <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase">
                Invited by
              </p>
              <p className="mt-2 text-[1.05rem] text-ink">{inviteView.label}</p>
              <p className="mt-2 text-[0.9rem] leading-relaxed text-ink/55">
                This name comes from the invite link. An invitation does not skip review.
              </p>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-10 space-y-6">
            {inviteView.kind === 'valid' && (
              <Field
                id="invite_reason"
                label="Why were you invited"
                required
                value={inviteReason}
                onChange={setInviteReason}
                placeholder="A short note on why you were invited"
                multiline
              />
            )}
            <Field
              id="full_name"
              label="Full name"
              required
              value={form.fullName}
              onChange={(v) => setField('fullName', v)}
              placeholder="Your name"
              autoComplete="name"
            />
            <Field
              id="email"
              label="Email"
              required
              type="email"
              value={form.email}
              onChange={(v) => setField('email', v)}
              placeholder="you@company.com"
              autoComplete="email"
            />
            <Field
              id="phone"
              label="Phone (optional)"
              type="tel"
              value={form.phone}
              onChange={(v) => setField('phone', v)}
              placeholder="+966…"
              autoComplete="tel"
            />
            <Field
              id="turnover"
              label="Turnover"
              value={form.turnover}
              onChange={(v) => setField('turnover', v)}
              placeholder="e.g. SAR 50m+ group revenue"
              hint="Turnover or family-office size (at least one). This is for review, not a time slot."
            />
            <Field
              id="fo_aum"
              label="Family office size / AUM"
              value={form.foAum}
              onChange={(v) => setField('foAum', v)}
              placeholder="e.g. FO AUM USD 100m+"
            />
            <Field
              id="investable_capacity_usd"
              label="Investable capacity (USD)"
              value={form.investable}
              onChange={(v) => setField('investable', v)}
              placeholder="e.g. 1000000"
              inputMode="decimal"
              hint="Optional. US dollars you can put to work. Used only inside a platform sum, and only after the desk verifies it."
            />
            <label className="flex items-start gap-3 text-[0.98rem] leading-relaxed text-ink/70">
              <input
                id="include_in_public_aggregates"
                name="include_in_public_aggregates"
                type="checkbox"
                checked={form.includeInPublic}
                onChange={(event) => setField('includeInPublic', event.target.checked)}
                className="mt-1"
              />
              <span>
                Include my capacity in Board Arabia&apos;s public platform totals
                (never shown individually).
              </span>
            </label>
            <Field
              id="linkedin_url"
              label="LinkedIn URL"
              required
              type="url"
              value={form.linkedinUrl}
              onChange={(v) => setField('linkedinUrl', v)}
              placeholder="https://www.linkedin.com/in/…"
            />
            <Field
              id="job_titles"
              label="Job titles"
              required
              value={form.jobTitles}
              onChange={(v) => setField('jobTitles', v)}
              placeholder="Chair, NED, Advisor…"
              multiline
            />
            <Field
              id="companies"
              label="Companies involved with"
              required
              value={form.companies}
              onChange={(v) => setField('companies', v)}
              placeholder="Boards, operating companies, family office"
              multiline
            />

            {error && (
              <p className="text-[0.9rem] text-[var(--ba-error)]" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || inviteView.kind === 'checking'}
              className="ba-primary inline-flex items-center justify-center px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] uppercase transition-colors disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit for consideration'}
            </button>
          </form>
        </div>
      </main>
      <Footer />
    </>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  multiline,
  type = 'text',
  hint,
  autoComplete,
  inputMode,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  multiline?: boolean
  type?: string
  hint?: string
  autoComplete?: string
  inputMode?: 'decimal' | 'text' | 'tel' | 'email' | 'url'
}) {
  const shared =
    'mt-2 w-full border border-ink/15 bg-white/70 px-4 py-3.5 text-[1rem] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-brass'

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase"
      >
        {label}
        {required ? ' *' : ''}
      </label>
      {multiline ? (
        <textarea
          id={id}
          name={id}
          required={required}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${shared} resize-y`}
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className={shared}
        />
      )}
      {hint && <p className="mt-2 text-[0.85rem] text-ink/45">{hint}</p>}
    </div>
  )
}

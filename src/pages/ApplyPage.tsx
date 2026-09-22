import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { notifyApplicationSubmitted, supabase } from '../lib/supabase'

type FormState = {
  fullName: string
  email: string
  phone: string
  turnover: string
  foAum: string
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
  linkedinUrl: '',
  jobTitles: '',
  companies: '',
}

export function ApplyPage() {
  const [form, setForm] = useState<FormState>(empty)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [emailNote, setEmailNote] = useState('')

  useEffect(() => {
    document.title = 'Request consideration — Board Arabia'
  }, [])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const fullName = form.fullName.trim()
    const email = form.email.trim()
    const phone = form.phone.trim()
    const turnover = form.turnover.trim()
    const foAum = form.foAum.trim()
    const linkedinUrl = form.linkedinUrl.trim()
    const jobTitles = form.jobTitles.trim()
    const companies = form.companies.trim()

    if (!fullName || !email || !linkedinUrl || !jobTitles || !companies) {
      setError('Name, email, LinkedIn, job titles, and companies are required.')
      return
    }
    if (!turnover && !foAum) {
      setError('Provide turnover or family-office AUM / size.')
      return
    }

    setSubmitting(true)

    const { data, error: insertError } = await supabase
      .from('applications')
      .insert({
        full_name: fullName,
        email,
        phone: phone || null,
        turnover: turnover || foAum,
        fo_aum: foAum || null,
        linkedin_url: linkedinUrl,
        job_titles: jobTitles,
        companies,
        calendar_slot: null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !data) {
      setSubmitting(false)
      setError(insertError?.message || 'Could not submit application.')
      return
    }

    const notify = await notifyApplicationSubmitted(data.id)
    setSubmitting(false)

    if (notify.error) {
      setEmailNote(
        'Application saved. Email notify may need Resend secrets — see README.',
      )
    } else if (notify.dryRun) {
      setEmailNote(
        'Application saved. Emails logged in dry-run until RESEND_API_KEY is set.',
      )
    } else {
      setEmailNote('Acknowledgement and staff notify emails were queued.')
    }

    setDone(true)
  }

  if (done) {
    return (
      <>
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
              arrange on this site. You will hear back after review — an
              acceptance with a private next step by email, or a decline.
            </p>
            {emailNote && (
              <p className="mt-4 text-[0.9rem] text-ink/50">{emailNote}</p>
            )}
            <Link
              to="/"
              className="mt-10 inline-flex items-center justify-center bg-ink px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:bg-ink-soft"
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
      <Nav />
      <main className="min-h-dvh bg-pearl pt-24 pb-20 md:pt-28">
        <div className="mx-auto max-w-2xl px-5 md:px-10">
          <p className="font-serif text-[1.15rem] italic text-ink-soft/70">
            Pre-vet
          </p>
          <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.035em] text-ink">
            Request consideration
          </h1>
          <p className="mt-5 text-[1.05rem] leading-relaxed text-ink/65">
            This form is a pre-vet, not a booking. Send your name, email,
            LinkedIn, titles, companies, and turnover or family-office size.
            Michael reviews every submission. If you are accepted, a private
            booking link arrives by email. That link is not on this website.
          </p>

          <form onSubmit={onSubmit} className="mt-10 space-y-6">
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
              hint="Turnover or family-office size — at least one. This is for review, not a time slot."
            />
            <Field
              id="fo_aum"
              label="Family office size / AUM"
              value={form.foAum}
              onChange={(v) => setField('foAum', v)}
              placeholder="e.g. FO AUM USD 100m+"
            />
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
              <p className="text-[0.9rem] text-red-800" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center bg-ink px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:bg-ink-soft disabled:opacity-60"
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
          className={shared}
        />
      )}
      {hint && <p className="mt-2 text-[0.85rem] text-ink/45">{hint}</p>}
    </div>
  )
}

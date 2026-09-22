import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import {
  clearHeldSlot,
  getHeldSlot,
  hasBooked,
  markBooked,
  setHeldSlot,
  slotFromSearchParams,
} from '../lib/booking'
import { supabase } from '../lib/supabase'

export function VerifyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [turnover, setTurnover] = useState('')
  const [companies, setCompanies] = useState('')
  const [jobTitles, setJobTitles] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [calendarSlot, setCalendarSlot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    document.title = 'Verify — Board Arabia'
    const fromQuery = slotFromSearchParams(searchParams)
    if (fromQuery) {
      setHeldSlot(fromQuery)
      markBooked()
      setCalendarSlot(fromQuery)
      return
    }
    const held = getHeldSlot()
    if (!hasBooked() && !held) {
      navigate('/book', { replace: true })
      return
    }
    setCalendarSlot(held)
  }, [navigate, searchParams])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const t = turnover.trim()
    const c = companies.trim()
    const j = jobTitles.trim()
    const slot = calendarSlot.trim()

    if (!t || !c || !j) {
      setError('Turnover, companies, and job titles are required.')
      return
    }

    setSubmitting(true)
    if (slot) setHeldSlot(slot)

    const { error: insertError } = await supabase.from('applications').insert({
      turnover: t,
      companies: c,
      job_titles: j,
      linkedin_url: linkedinUrl.trim() || null,
      calendar_slot: slot || null,
      status: 'pending',
    })

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    clearHeldSlot()
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
              Application submitted
            </h1>
            <p className="mt-5 text-[1.05rem] leading-relaxed text-ink/65">
              Your verification is pending review. We will follow up against the
              calendar slot you held.
            </p>
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
      <Nav ctaTo="/book" ctaLabel="Booking" />
      <main className="min-h-dvh bg-pearl pt-24 pb-20 md:pt-28">
        <div className="mx-auto max-w-2xl px-5 md:px-10">
          <p className="font-serif text-[1.15rem] italic text-ink-soft/70">
            Step 2 of 2
          </p>
          <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.035em] text-ink">
            Verification
          </h1>
          <p className="mt-5 text-[1.05rem] leading-relaxed text-ink/65">
            After booking, complete this form so we can review your credentials.
          </p>

          <form onSubmit={onSubmit} className="mt-10 space-y-6">
            <Field
              id="turnover"
              label="Turnover"
              required
              value={turnover}
              onChange={setTurnover}
              placeholder="e.g. SAR 50m+ group revenue"
            />
            <Field
              id="companies"
              label="Companies involved with"
              required
              value={companies}
              onChange={setCompanies}
              placeholder="Boards, operating companies, family office"
              multiline
            />
            <Field
              id="job_titles"
              label="Job titles"
              required
              value={jobTitles}
              onChange={setJobTitles}
              placeholder="Chair, NED, Advisor…"
              multiline
            />
            <Field
              id="linkedin_url"
              label="LinkedIn URL (optional)"
              value={linkedinUrl}
              onChange={setLinkedinUrl}
              placeholder="https://www.linkedin.com/in/…"
              type="url"
            />
            <Field
              id="calendar_slot"
              label="Calendar slot (soft-hold)"
              value={calendarSlot}
              onChange={setCalendarSlot}
              placeholder="From your booking"
            />

            {error && (
              <p className="text-[0.9rem] text-red-800" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center bg-ink px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:bg-ink-soft disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
              <Link
                to="/book"
                className="text-center text-[0.85rem] text-ink/50 transition-colors hover:text-ink sm:text-left"
              >
                Back to booking
              </Link>
            </div>
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
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  multiline?: boolean
  type?: string
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
          className={shared}
        />
      )}
    </div>
  )
}

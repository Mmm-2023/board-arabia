import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import {
  CALENDAR_BOOKING_URL,
  getHeldSlot,
  hasBooked,
  markBooked,
  setHeldSlot,
  slotFromSearchParams,
} from '../lib/booking'

export function BookPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [slot, setSlot] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Book — Board Arabia'
    const fromQuery = slotFromSearchParams(searchParams)
    if (fromQuery) {
      setHeldSlot(fromQuery)
      markBooked()
      setSlot(fromQuery)
      return
    }
    const held = getHeldSlot()
    if (held) setSlot(held)
  }, [searchParams])

  function openCalendar() {
    markBooked()
    window.open(CALENDAR_BOOKING_URL, '_blank', 'noopener,noreferrer')
  }

  function onContinue(e: FormEvent) {
    e.preventDefault()
    const trimmed = slot.trim()
    if (!trimmed && !hasBooked()) {
      setError('Open the calendar to book a slot, then note the time below.')
      return
    }
    if (trimmed) setHeldSlot(trimmed)
    markBooked()
    navigate('/verify')
  }

  return (
    <>
      <Nav ctaTo="/verify" ctaLabel="Continue to verify" />
      <main className="min-h-dvh bg-pearl pt-24 pb-20 md:pt-28">
        <div className="mx-auto max-w-2xl px-5 md:px-10">
          <p className="font-serif text-[1.15rem] italic text-ink-soft/70">
            Step 1 of 2
          </p>
          <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.035em] text-ink">
            Book a conversation
          </h1>
          <p className="mt-5 text-[1.05rem] leading-relaxed text-ink/65">
            Choose a time on Google Calendar first. We soft-hold the slot until
            your verification form is submitted.
          </p>

          <div className="mt-10 border border-ink/10 bg-white/60 p-6 md:p-8">
            <p className="text-[0.72rem] font-semibold tracking-[0.1em] text-ink/45 uppercase">
              Google Calendar
            </p>
            <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/70">
              Opens in a new tab. After you pick a slot, return here and note the
              time so we can hold it against your application.
            </p>
            <button
              type="button"
              onClick={openCalendar}
              className="mt-6 inline-flex w-full items-center justify-center bg-brass px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:bg-brass-bright sm:w-auto"
            >
              Open booking calendar
            </button>
            <p className="mt-3 text-[0.85rem] text-ink/45">
              <a
                href={CALENDAR_BOOKING_URL}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-ink/20 underline-offset-2 hover:text-ink"
              >
                calendar.app.google/a7RVc2v3mZ226Sd89
              </a>
            </p>
          </div>

          <form onSubmit={onContinue} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="calendar_slot"
                className="block text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase"
              >
                Calendar slot (soft-hold)
              </label>
              <input
                id="calendar_slot"
                name="calendar_slot"
                type="text"
                value={slot}
                onChange={(e) => {
                  setSlot(e.target.value)
                  setError('')
                }}
                placeholder="e.g. Tue 30 Sep · 14:00 AST"
                className="mt-2 w-full border border-ink/15 bg-white/70 px-4 py-3.5 text-[1rem] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-brass"
              />
              <p className="mt-2 text-[0.85rem] text-ink/45">
                If a return link includes a slot query param, it is captured
                automatically.
              </p>
            </div>

            {error && (
              <p className="text-[0.9rem] text-red-800" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                className="inline-flex items-center justify-center bg-ink px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:bg-ink-soft"
              >
                Continue to verification
              </button>
              <Link
                to="/"
                className="text-center text-[0.85rem] text-ink/50 transition-colors hover:text-ink sm:text-left"
              >
                Back to home
              </Link>
            </div>
          </form>
        </div>
      </main>
      <Footer />
    </>
  )
}

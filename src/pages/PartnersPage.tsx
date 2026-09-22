import { useState, type FormEvent } from 'react'
import { MarketingLayout } from '../components/MarketingLayout'
import { PARTNER_CATEGORIES, PARTNER_EMAIL } from '../content/marketing'

const RULES = [
  {
    n: '01',
    title: 'Annual',
    body: 'A seat runs for a year. It is not renewed by a checkout on this site.',
  },
  {
    n: '02',
    title: 'Three only',
    body: 'When three seats are filled, the year is closed. There is no waiting list published here.',
  },
  {
    n: '03',
    title: 'Finance first',
    body: 'The seat is for a firm on the rails of a deal. A general logo sponsorship is not the point.',
  },
  {
    n: '04',
    title: 'Still gated',
    body: 'A partner does not receive the directory and does not message members around admin.',
  },
]

export function PartnersPage() {
  return (
    <MarketingLayout path="/partners">
      <header className="mx-auto max-w-7xl px-5 pt-12 md:px-10 md:pt-20">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
          Ecosystem partners
        </p>
        <h1 className="max-w-3xl font-display text-[clamp(2.5rem,5.5vw,4.4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          Three seats a year.
        </h1>
        <p className="mt-6 max-w-2xl text-[1.08rem] leading-relaxed text-ink/65">
          Board Arabia offers three partner seats a year. They are offered,
          not sold from this page, to firms on the finance rails of a
          transaction. There is no fee schedule here, and there is no
          directory of partner names.
        </p>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-10 md:py-20">
        <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {RULES.map((rule) => (
            <li key={rule.n} className="border-t border-ink/10 pt-5">
              <span className="font-display text-[0.78rem] font-semibold tracking-[0.18em] text-brass">
                {rule.n}
              </span>
              <h2 className="mt-3 font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-ink">
                {rule.title}
              </h2>
              <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/65">
                {rule.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-ink/10 bg-white/40">
        <div className="mx-auto max-w-7xl px-5 py-16 md:px-10 md:py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold tracking-[-0.03em] text-ink">
              Fifteen categories.
            </h2>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-ink/65">
              A summary of the lanes a seat can occupy. All of them are
              finance. We do not fill this list by scraping firms, and we do
              not print who holds a seat.
            </p>
          </div>
          <ol className="mt-12 grid gap-x-12 sm:grid-cols-2">
            {PARTNER_CATEGORIES.map((category, index) => (
              <li
                key={category.name}
                className="grid grid-cols-[2.5rem_1fr] gap-3 border-t border-ink/10 py-4"
              >
                <span className="font-display text-[0.78rem] font-semibold tracking-[0.12em] text-brass">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-display text-[1.12rem] font-semibold tracking-[-0.02em] text-ink">
                    {category.name}
                  </h3>
                  <p className="mt-1 text-[0.95rem] text-ink/55">{category.gloss}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <InterestForm />
    </MarketingLayout>
  )
}

function InterestForm() {
  const [name, setName] = useState('')
  const [firm, setFirm] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [opened, setOpened] = useState(false)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setOpened(false)
    if (!name.trim() || !firm.trim() || !category) {
      setError('Name, firm, and category are required.')
      return
    }
    setError('')
    const subject = `Partner interest — ${firm.trim().replace(/[\r\n]/g, ' ')}`
    const body = [
      `Name: ${name.trim()}`,
      `Firm: ${firm.trim()}`,
      `Category: ${category}`,
      '',
      note.trim() || '(no note)',
    ].join('\n')
    window.location.href = `mailto:${PARTNER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setOpened(true)
  }

  return (
    <section id="interest" className="bg-stone py-20 md:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 md:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div>
          <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
            Interest
          </p>
          <h2 className="font-display text-[clamp(2rem,4vw,3.2rem)] font-bold leading-[1.05] tracking-[-0.035em] text-balance text-ink">
            Partner with us.
          </h2>
          <p className="mt-5 text-[1.05rem] leading-relaxed text-ink/65">
            Tell us the firm and the lane. This opens a draft in your mail
            app. We do not store the note on this site, and sending it does
            not reserve a seat.
          </p>
          <p className="mt-5 text-[0.98rem] text-ink/55">
            Or write directly to{' '}
            <a className="border-b border-brass text-ink" href={`mailto:${PARTNER_EMAIL}`}>
              {PARTNER_EMAIL}
            </a>
            .
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field id="partner_name" label="Your name" value={name} onChange={setName} />
          <Field id="partner_firm" label="Firm" value={firm} onChange={setFirm} />
          <div>
            <label
              htmlFor="partner_category"
              className="block text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase"
            >
              Category
            </label>
            <select
              id="partner_category"
              name="partner_category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value)
                setError('')
              }}
              className="mt-2 w-full border border-ink/15 bg-white/80 px-4 py-3.5 text-[1rem] text-ink outline-none focus:border-brass"
            >
              <option value="">Select a finance category</option>
              {PARTNER_CATEGORIES.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="partner_note"
              className="block text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase"
            >
              Note
            </label>
            <textarea
              id="partner_note"
              name="partner_note"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="The lane you work, and why a seat would be useful."
              className="mt-2 w-full resize-y border border-ink/15 bg-white/80 px-4 py-3.5 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass"
            />
          </div>
          {error && (
            <p className="text-[0.9rem] text-red-800" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex items-center justify-center bg-ink px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:bg-ink-soft"
          >
            Partner with us
          </button>
          {opened && (
            <p className="text-[0.92rem] leading-relaxed text-ink/60">
              A mail draft should be open. If it is not, write to {PARTNER_EMAIL}.
              Nothing was saved on this website.
            </p>
          )}
        </form>
      </div>
    </section>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
        className="mt-2 w-full border border-ink/15 bg-white/80 px-4 py-3.5 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass"
      />
    </div>
  )
}

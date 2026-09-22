import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { FaqList } from '../components/FaqList'
import { MarketingLayout } from '../components/MarketingLayout'
import { PROCESS_STEPS, REVIEW_SLA } from '../content/marketing'
import { HOW_IT_WORKS_FAQ } from '../content/seo'

const REFUSALS = [
  'No public calendar, and no booking link anywhere on these pages.',
  'No payment, and no fee schedule.',
  'No instant account. Admission follows review and a conversation.',
  'No published list of who applied, who was declined, or who was admitted.',
]

export function HowItWorksPage() {
  return (
    <MarketingLayout path="/how-it-works">
      <header className="mx-auto max-w-7xl px-5 pt-12 md:px-10 md:pt-20">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
          How it works
        </p>
        <h1 className="max-w-3xl font-display text-[clamp(2.5rem,5.5vw,4.4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          Apply. Review. Invite.
        </h1>
        <p className="mt-6 max-w-2xl text-[1.08rem] leading-relaxed text-ink/65">
          Board Arabia admission is credentials-first: submit a pre-vet form,
          await personal review, and — if accepted — receive a private booking
          link by email before joining the member dashboard. {REVIEW_SLA}
        </p>
        <p className="mt-4">
          <a href="#faq" className="border-b border-brass text-ink">
            Common questions
          </a>
        </p>
      </header>

      <ol className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
        {PROCESS_STEPS.map((step) => (
          <li
            key={step.n}
            id={step.title.toLowerCase().replace(/\s+/g, '-')}
            className="grid gap-4 border-t border-ink/10 py-10 md:grid-cols-[8rem_16rem_1fr] md:gap-8 md:py-12"
          >
            <span className="font-display text-[0.85rem] font-semibold tracking-[0.18em] text-brass">
              {step.n}
            </span>
            <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink">
              {step.title}
            </h2>
            <p className="max-w-xl text-[1.05rem] leading-relaxed text-ink/70">
              {step.detail}
            </p>
          </li>
        ))}
      </ol>

      <section className="bg-ink py-20 text-pearl md:py-24">
        <div className="mx-auto max-w-7xl px-5 md:px-10">
          <h2 className="font-display text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold tracking-[-0.03em]">
            What this site will not do
          </h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {REFUSALS.map((item) => (
              <li key={item} className="border border-pearl/15 px-5 py-4 text-[1.02rem] text-stone/85">
                {item}
              </li>
            ))}
          </ul>
          <Link
            to="/apply"
            className="mt-10 inline-flex items-center justify-center bg-brass px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-ink uppercase hover:bg-brass-bright"
          >
            Apply for consideration
          </Link>
        </div>
      </section>

      <FaqList items={HOW_IT_WORKS_FAQ} />

      <CtaBand
        eyebrow="The form"
        title="Start with the pre-vet."
        body="Name, email, LinkedIn, titles, companies, and turnover or family-office size. Review follows. A calendar does not."
      />
    </MarketingLayout>
  )
}

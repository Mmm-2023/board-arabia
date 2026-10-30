import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { FaqList } from '../components/FaqList'
import { MarketingLayout } from '../components/MarketingLayout'
import { HOW_IT_WORKS_FAQ, publicHref } from '../content/seo'
import { CONSIDERATION_NOTE, howItWorksHeading, instantAccountLine, publicProcessSteps } from '../content/twoTierCopy'
import { publicConsiderationCta } from '../lib/twoTierRegister'
import { trackApplyClick } from '../lib/tracking/browser'

const FORM_CLOSING =
  'Name, email, LinkedIn, titles, companies, and turnover or family-office size. Review follows. A calendar does not.'

export function HowItWorksPage() {
  const cta = publicConsiderationCta()
  const steps = publicProcessSteps()
  const refusals = [
    'No public calendar, and no booking link anywhere on these pages.',
    'No payment, and no fee schedule.',
    instantAccountLine(),
    'No published list of who applied, who was declined, or who was admitted.',
  ]
  return (
    <MarketingLayout path="/how-it-works">
      <header className="mx-auto max-w-7xl px-5 pt-12 md:px-10 md:pt-20">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
          How it works
        </p>
        <h1 className="max-w-3xl font-display text-[clamp(2.5rem,5.5vw,4.4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          {howItWorksHeading()}
        </h1>
        <p className="mt-6 max-w-2xl text-[1.08rem] leading-relaxed text-ink/70">
          {CONSIDERATION_NOTE}
        </p>
        <p className="mt-4">
          <a href="#faq" className="inline-flex min-h-11 items-center border-b border-brass text-[1rem] text-ink">
            Common questions
          </a>
        </p>
      </header>

      <ol className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
        {steps.map((step, index) => (
          <li
            key={step.n}
            id={step.title.toLowerCase().replace(/\s+/g, '-')}
            className="grid gap-4 border-t border-ink/10 py-10 md:grid-cols-[8rem_1fr] md:gap-8 md:py-12"
          >
            <span className="font-display text-[1rem] font-semibold text-brass">
              {index + 1}
            </span>
            <p className="max-w-xl text-[1.05rem] leading-relaxed text-ink/80">
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
            {refusals.map((item) => (
              <li key={item} className="border border-pearl/15 px-5 py-4 text-[1.02rem] text-stone/85">
                {item}
              </li>
            ))}
          </ul>
          <Link
            to={publicHref(cta.to)}
            className="ba-primary ba-apply mt-10 inline-flex items-center justify-center"
            data-consideration-cta="public"
            onClick={() => trackApplyClick('section-how-it-works', cta.label)}
          >
            {cta.label}
          </Link>
          <p className="mt-3 max-w-md text-[1rem] leading-relaxed text-[#E8E4F7]">{CONSIDERATION_NOTE}</p>
        </div>
      </section>

      <FaqList items={HOW_IT_WORKS_FAQ} />

      <CtaBand
        eyebrow="The form"
        body={FORM_CLOSING}
        note={CONSIDERATION_NOTE}
        location="section-how-it-works-close"
      />
    </MarketingLayout>
  )
}

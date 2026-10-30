import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { FaqList } from '../components/FaqList'
import { MarketingLayout } from '../components/MarketingLayout'
import { WhoRunsTheDesk } from '../components/WhoRunsTheDesk'
import { AUDIENCE_LINE } from '../content/marketing'
import { faqFor, publicHref } from '../content/seo'
import { CONSIDERATION_NOTE, publicProcessSteps } from '../content/twoTierCopy'

export function AboutPage() {
  return (
    <MarketingLayout path="/about">
      <article className="mx-auto max-w-3xl px-5 pt-12 pb-8 md:px-10 md:pt-20">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
          About
        </p>
        <h1 className="font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          A founding membership, stated plainly.
        </h1>
        <div className="mt-8 space-y-5 text-[1.08rem] leading-relaxed text-ink/70">
          <p>
            Board Arabia is a founding membership for {AUDIENCE_LINE} in Saudi
            Arabia and the GCC, and for international counterparts who work
            with Saudi capital, family offices, and foreign direct investment.
          </p>
          <p>
            The first hundred places are held evenly: fifty Saudi, fifty
            international. Founding places are complimentary. We ask for time,
            judgment and introductions in return. Seats are not priced on this
            site.
          </p>
          <p>
            Admission is by review. There is no fixed response time. A named
            person reads every application. If you are accepted, we email you a
            private link. Your account is created then, not before. We never
            publish that link here. If you are not accepted, you receive a decline.
          </p>
          <ol className="space-y-4">
            {publicProcessSteps().map((step, index) => (
              <li key={step.n} className="text-[1.05rem] leading-relaxed text-ink/80">
                <span className="font-semibold text-ink">{index + 1}. </span>
                {step.detail}
              </li>
            ))}
          </ol>
          <p>
            The tools (a private directory, availability, warm introductions,
            a mandate inbox, deal rooms, and a quarterly majlis) are the standard
            of the room as it opens. This website describes them. It does not
            display members, and it does not invent them.
          </p>
          <p>
            <Link to={publicHref('/how-it-works')} className="inline-flex min-h-11 items-center border-b border-brass text-[1rem] text-ink">
              Read the sequence
            </Link>
          </p>
        </div>
        <WhoRunsTheDesk />
      </article>
      <FaqList items={faqFor('/about') ?? []} heading="About Board Arabia" />
      <CtaBand location="section-about" note={CONSIDERATION_NOTE} />
    </MarketingLayout>
  )
}

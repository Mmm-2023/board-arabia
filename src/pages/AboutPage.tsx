import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { MarketingLayout } from '../components/MarketingLayout'
import { WhoRunsTheDesk } from '../components/WhoRunsTheDesk'
import { AUDIENCE_LINE } from '../content/marketing'

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
            Admission is by review. There is no fixed response time. Every
            application is reviewed personally. If you are accepted, you get a
            private invite email. We never publish it here. If you are not
            accepted, you receive a decline.
          </p>
          <p>
            The tools (a private directory, availability, warm introductions,
            a mandate inbox, deal rooms, and a quarterly majlis) are the standard
            of the room as it opens. This website describes them. It does not
            display members, and it does not invent them.
          </p>
          <p>
            <Link to="/how-it-works" className="border-b border-brass text-ink">
              Read the sequence
            </Link>
          </p>
        </div>
        <WhoRunsTheDesk />
      </article>
      <CtaBand location="section-about" />
    </MarketingLayout>
  )
}

import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { MarketingLayout } from '../components/MarketingLayout'

export function AboutPage() {
  return (
    <MarketingLayout title="About — Board Arabia">
      <article className="mx-auto max-w-3xl px-5 pt-12 pb-8 md:px-10 md:pt-20">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
          About
        </p>
        <h1 className="font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          A founding membership, stated plainly.
        </h1>
        <div className="mt-8 space-y-5 text-[1.08rem] leading-relaxed text-ink/70">
          <p>
            Board Arabia is a founding membership for chairpersons and board
            advisors in Saudi Arabia, and for international counterparts who
            work with Saudi capital and companies.
          </p>
          <p>
            The first hundred places are held evenly: fifty Saudi, fifty
            international. Founding membership is complimentary, pending
            contribution — presence, judgment, and introductions made with
            care. Seats are not priced on this site.
          </p>
          <p>
            Admission is by review. Michael reads every application. If you
            are accepted, a private booking link is emailed to you. If you
            are not, you receive a decline. The link is never published here.
          </p>
          <p>
            The tools — a private directory, availability, warm introductions,
            a mandate inbox, deal rooms, a quarterly majlis — are the standard
            of the room as it opens. This website describes them. It does not
            display members, and it does not invent them.
          </p>
          <p>
            <Link to="/how-it-works" className="border-b border-brass text-ink">
              Read the sequence
            </Link>
          </p>
        </div>
      </article>
      <CtaBand />
    </MarketingLayout>
  )
}

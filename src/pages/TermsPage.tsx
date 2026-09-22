import { Link } from 'react-router-dom'
import { MarketingLayout } from '../components/MarketingLayout'

export function TermsPage() {
  return (
    <MarketingLayout path="/terms">
      <article className="mx-auto max-w-3xl px-5 pt-12 pb-20 md:px-10 md:pt-20">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
          Terms
        </p>
        <h1 className="font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          What these pages promise.
        </h1>
        <div className="mt-8 space-y-5 text-[1.08rem] leading-relaxed text-ink/70">
          <p>
            These pages describe Board Arabia. Reading them does not admit
            you, reserve a Founding 100 place, or reserve a Founding Ecosystem
            Partner seat. They are not a signed agreement.
          </p>
          <h2 className="pt-4 font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink">
            Admission
          </h2>
          <p>
            Consideration is a pre-vet. There is no fixed response time. Every
            application is reviewed personally. Acceptance, if it comes, is a
            private email. Decline is a clear note. Neither outcome is
            published, and neither is a public booking.
          </p>
          <h2 className="pt-4 font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink">
            No price on this site
          </h2>
          <p>
            Founding membership is described as complimentary, pending
            contribution to the room. That sentence is not a checkout and not
            a fee schedule. Partner seats are not sold from these pages.
          </p>
          <h2 className="pt-4 font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink">
            No public room
          </h2>
          <p>
            The site does not publish members, partner logos, or a calendar.
            Do not treat the tool descriptions as a live directory. A mandate,
            an introduction, and a deal room stay behind admin.
          </p>
          <p>
            How personal details are handled is on the{' '}
            <Link to="/privacy" className="border-b border-brass text-ink">
              privacy
            </Link>{' '}
            page. To request consideration, use{' '}
            <Link to="/apply" className="border-b border-brass text-ink">
              the pre-vet
            </Link>
            .
          </p>
        </div>
      </article>
    </MarketingLayout>
  )
}

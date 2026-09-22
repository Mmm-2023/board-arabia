import { Link } from 'react-router-dom'
import { MarketingLayout } from '../components/MarketingLayout'
import { PARTNER_EMAIL } from '../content/marketing'

export function PrivacyPage() {
  return (
    <MarketingLayout path="/privacy">
      <article className="mx-auto max-w-3xl px-5 pt-12 pb-20 md:px-10 md:pt-20">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
          Privacy
        </p>
        <h1 className="font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          What this site collects.
        </h1>
        <div className="mt-8 space-y-5 text-[1.08rem] leading-relaxed text-ink/70">
          <p>
            Board Arabia collects the credentials you choose to submit for
            admission review. This site does not publish a member directory,
            does not sell personal information, and does not open a public
            calendar.
          </p>
          <h2 className="pt-4 font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink">
            The pre-vet
          </h2>
          <p>
            The consideration form asks for your name, email, phone if you
            give it, LinkedIn URL, job titles, companies, turnover or
            family-office size, and an optional investable capacity in US
            dollars. Those details are used to review the application. They
            are not shown on these pages as individual figures.
          </p>
          <p>
            If you leave the public-totals box checked, a verified capacity
            figure can be added into a platform sum after you are admitted.
            The public site shows that sum only. It does not show your name,
            your company, or your amount. You can turn the choice off later
            in your profile.
          </p>
          <h2 className="pt-4 font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink">
            Partner interest
          </h2>
          <p>
            The partner form opens a draft in your mail app to {PARTNER_EMAIL}.
            The note is not stored on this website, and sending it does not
            reserve a Founding Ecosystem Partner seat.
          </p>
          <h2 className="pt-4 font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink">
            What is not collected here
          </h2>
          <p>
            There is no public booking page, so these pages do not take a
            calendar slot. There is no checkout, so these pages do not take a
            card. Sign-in is for admitted members and staff. These pages do not create accounts.
          </p>
          <p>
            A privacy question about a submission can be sent to{' '}
            <a className="border-b border-brass text-ink" href={`mailto:${PARTNER_EMAIL}`}>
              {PARTNER_EMAIL}
            </a>
            . Read the{' '}
            <Link to="/terms" className="border-b border-brass text-ink">
              terms
            </Link>{' '}
            for what these pages do and do not promise.
          </p>
        </div>
      </article>
    </MarketingLayout>
  )
}

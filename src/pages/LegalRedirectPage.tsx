import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MarketingLayout } from '../components/MarketingLayout'

/** Old public address. Sends the reader to the Terms page. */
export function LegalRedirectPage() {
  useEffect(() => {
    window.location.replace('/terms/')
  }, [])

  return (
    <MarketingLayout path="/legal">
      <article className="mx-auto max-w-3xl px-5 pt-12 pb-16 md:px-10 md:pt-20" data-page="legal-redirect">
        <h1 className="font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          Terms
        </h1>
        <p className="mt-6 text-[1.08rem] leading-relaxed text-ink/75">
          Board Arabia terms are on the Terms page. This address sends you there.
        </p>
        <p className="mt-8">
          <Link to="/terms/" className="border-b border-brass text-ink">
            Terms
          </Link>
        </p>
      </article>
    </MarketingLayout>
  )
}

import { Link } from 'react-router-dom'
import { BrandLockup } from './BrandLockup'
import { MEMBER_LOGIN } from '../content/marketing'
import { CONSENT_COPY } from '../content/privacyNotice'
import { publicConsiderationCta } from '../lib/twoTierRegister'
import { ANALYTICS_CONFIG } from '../lib/tracking/flags'
import { trackApplyClick, trackLoginClick } from '../lib/tracking/browser'

function footerLinks() {
  const cta = publicConsiderationCta()
  return [
    { label: 'Log in', to: MEMBER_LOGIN, consideration: false },
    { label: 'For members', to: '/for-members', consideration: false },
    { label: 'For capital', to: '/for-capital', consideration: false },
    { label: 'How it works', to: '/how-it-works', consideration: false },
    { label: 'About', to: '/about', consideration: false },
    { label: 'Partners', to: '/partners', consideration: false },
    { label: cta.label, to: cta.to, consideration: true },
    { label: 'Privacy', to: '/privacy', consideration: false },
    { label: 'Terms', to: '/terms', consideration: false },
  ]
}

export function Footer() {
  const links = footerLinks()
  return (
    <footer className="border-t border-ink/10 bg-pearl">
      <div className="mx-auto grid max-w-7xl gap-3 px-5 py-4 md:grid-cols-[1.4fr_1fr] md:gap-6 md:px-10 md:py-8">
        <div>
          <BrandLockup to="/" tone="on-light" subline={false} />
          <p className="mt-2 max-w-sm text-[0.875rem] leading-snug text-[var(--ba-muted)]">
            A selective founding membership for Saudi and international
            Chairpersons, Board members, and C-suite executives.
          </p>
          <p className="mt-2 text-[0.8125rem] text-[var(--ba-muted)]">
            No public calendar. Admission by review.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-6">
            {links.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className="ba-footer-link"
                  data-consideration-cta={item.consideration ? 'public' : undefined}
                  onClick={() => {
                    if (item.consideration) trackApplyClick('footer', item.label)
                    if (item.to === MEMBER_LOGIN) trackLoginClick('footer')
                  }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            {ANALYTICS_CONFIG.enabled ? (
              <li>
                <button
                  type="button"
                  className="ba-footer-link"
                  onClick={() => window.dispatchEvent(new Event('ba-open-consent'))}
                >
                  {CONSENT_COPY.settings}
                </button>
              </li>
            ) : null}
          </ul>
          <p className="mt-2 text-[0.8125rem] text-[var(--ba-muted)]">
            © {new Date().getFullYear()} Board Arabia
          </p>
        </nav>
      </div>
    </footer>
  )
}

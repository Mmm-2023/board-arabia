import { Link } from 'react-router-dom'
import { BrandLockup } from './BrandLockup'
import { MEMBER_LOGIN } from '../content/marketing'

const LINKS = [
  { label: 'Log in', to: MEMBER_LOGIN },
  { label: 'For members', to: '/for-members' },
  { label: 'For capital', to: '/for-capital' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'About', to: '/about' },
  { label: 'Partners', to: '/partners' },
  { label: 'Apply for consideration', to: '/apply' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
]

export function Footer() {
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
            {LINKS.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="ba-footer-link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.8125rem] text-[var(--ba-muted)]">
            © {new Date().getFullYear()} Board Arabia
          </p>
        </nav>
      </div>
    </footer>
  )
}

import { Link } from 'react-router-dom'

const LINKS = [
  { label: 'For members', to: '/for-members' },
  { label: 'For capital', to: '/for-capital' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'About', to: '/about' },
  { label: 'Partners', to: '/partners' },
  { label: 'Request consideration', to: '/apply' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
]

export function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-pearl">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr] md:px-10 md:py-16">
        <div>
          <p className="font-display text-[1.4rem] font-bold tracking-[-0.03em] text-ink">
            Board Arabia
          </p>
          <p className="mt-3 max-w-sm text-[0.98rem] leading-relaxed text-ink/55">
            A selective founding membership for Saudi and international
            chairpersons and board advisors.
          </p>
          <p className="mt-6 text-[0.8rem] tracking-wide text-ink/40">
            No public calendar. Admission by review.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3">
            {LINKS.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="text-[0.95rem] text-ink/70 transition-colors hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-[0.8rem] tracking-wide text-ink/40">
            © {new Date().getFullYear()} Board Arabia
          </p>
        </nav>
      </div>
    </footer>
  )
}

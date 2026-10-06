import { Link } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { useNoIndex } from '../lib/usePageTitle'

export function NotFoundPage() {
  useNoIndex('Page not found | Board Arabia')
  return (
    <>
      <Nav />
      <main className="ba-marketing min-h-dvh bg-pearl pt-16 md:pt-20">
        <article className="mx-auto max-w-3xl px-5 pt-16 pb-20 md:px-10 md:pt-24" data-screen="not-found">
          <h1 className="font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.04em] text-ink">
            Page not found
          </h1>
          <p className="mt-6 max-w-xl text-[1.08rem] leading-relaxed text-ink/70">
            This address is not a Board Arabia page.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)]"
            >
              Home
            </Link>
            <Link
              to="/apply"
              className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)]"
            >
              Apply
            </Link>
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)]"
            >
              Log in
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  )
}

import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-pearl">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 md:flex-row md:items-end md:justify-between md:px-10">
        <div>
          <p className="font-display text-[1.4rem] font-bold tracking-[-0.03em] text-ink">
            Board Arabia
          </p>
          <p className="mt-2 max-w-sm text-[0.95rem] text-ink/55">
            A selective membership for Saudi and GCC chairpersons, board
            advisors, and aspiring NEDs.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link
            to="/apply"
            className="font-serif text-[1.05rem] italic text-ink/70 transition-colors hover:text-ink"
          >
            Apply for review
          </Link>
          <p className="text-[0.8rem] tracking-wide text-ink/40">
            © {new Date().getFullYear()} Board Arabia
          </p>
        </div>
      </div>
    </footer>
  )
}

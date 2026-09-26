import { Link } from 'react-router-dom'

type Tone = 'on-dark' | 'on-light'

const toneClass: Record<Tone, { name: string; line: string }> = {
  'on-dark': {
    name: 'text-[var(--ba-porcelain)]',
    line: 'text-[var(--ba-lavender-mist)]',
  },
  'on-light': {
    name: 'text-[var(--ba-ink)]',
    line: 'text-[var(--ba-muted)]',
  },
}

/** Serif wordmark plus the Najdi C3 mark. Subtitle is the membership line. */
export function BrandLockup({
  to = '/',
  tone,
  markOnly = false,
}: {
  to?: string
  tone: Tone
  markOnly?: boolean
}) {
  const colors = toneClass[tone]
  return (
    <Link to={to} aria-label="Board Arabia" className="flex min-h-11 min-w-0 items-center gap-2.5">
      <img
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0"
      />
      {!markOnly && (
        <span className="min-w-0">
          <span className={`block truncate font-serif text-[1.35rem] leading-none ${colors.name}`}>
            Board Arabia
          </span>
          <span
            className={`mt-1 block truncate text-[0.62rem] font-semibold tracking-[0.16em] uppercase ${colors.line}`}
          >
            Founding membership
          </span>
        </span>
      )}
    </Link>
  )
}

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

/** Syne ExtraBold stacked wordmark plus the Najdi C3 mark. Subtitle is the membership line. */
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
        className="h-8 w-8 shrink-0 self-start"
      />
      {!markOnly && (
        <span className="min-w-0">
          <span
            className={`ba-wordmark block font-display text-[1.02rem] leading-[0.9] font-extrabold tracking-[-0.03em] sm:text-[1.12rem] ${colors.name}`}
          >
            <span className="block">Board</span>
            <span className="block">Arabia</span>
          </span>
          <span
            className={`mt-0.5 block truncate text-[0.56rem] leading-none font-semibold tracking-[0.12em] uppercase sm:mt-1 sm:text-[0.62rem] sm:tracking-[0.16em] ${colors.line}`}
          >
            Founding membership
          </span>
        </span>
      )}
    </Link>
  )
}

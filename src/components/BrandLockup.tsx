import { Link } from 'react-router-dom'

type Tone = 'on-dark' | 'on-light'
type Size = 'nav' | 'hero'

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

const sizeClass: Record<
  Size,
  { root: string; mark: string; name: string; line: string; clip: string; px: number }
> = {
  nav: {
    root: 'min-h-11 gap-2.5',
    mark: 'h-8 w-8',
    name: 'text-[1.35rem]',
    line: 'mt-1 text-[0.62rem]',
    clip: 'truncate',
    px: 32,
  },
  hero: {
    // Same ratios as nav: mark 32, name 1.35rem, line 0.62rem, gap 10px.
    // Mobile is 1.55x so the tracked subtitle stays inside a 390px column.
    root: 'gap-3 md:gap-8',
    mark: 'h-12 w-12 md:h-24 md:w-24',
    name: 'font-normal text-[2.0925rem] md:text-[4.05rem]',
    line: 'mt-1.5 text-[0.961rem] md:mt-3 md:text-[1.86rem]',
    clip: 'whitespace-nowrap',
    px: 96,
  },
}

/** Serif wordmark plus the Najdi C3 mark. Subtitle is the membership line. */
export function BrandLockup({
  to = '/',
  tone,
  markOnly = false,
  size = 'nav',
  heading = false,
}: {
  to?: string
  tone: Tone
  markOnly?: boolean
  size?: Size
  heading?: boolean
}) {
  const colors = toneClass[tone]
  const box = sizeClass[size]
  const NameTag = heading ? 'h1' : 'span'
  const LineTag = heading ? 'p' : 'span'

  const body = (
    <>
      <img
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt=""
        width={box.px}
        height={box.px}
        className={`${box.mark} shrink-0`}
      />
      {!markOnly && (
        <span className="min-w-0">
          <NameTag
            className={`block font-serif leading-none ${box.clip} ${box.name} ${colors.name}`}
          >
            Board Arabia
          </NameTag>
          <LineTag
            className={`block font-semibold tracking-[0.16em] uppercase ${box.clip} ${box.line} ${colors.line}`}
          >
            Founding membership
          </LineTag>
        </span>
      )}
    </>
  )

  const className = `flex min-w-0 items-center ${box.root}`
  if (heading) {
    return <div className={className}>{body}</div>
  }
  return (
    <Link to={to} aria-label="Board Arabia" className={className}>
      {body}
    </Link>
  )
}

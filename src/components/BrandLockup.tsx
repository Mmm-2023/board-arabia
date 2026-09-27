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
    root: 'gap-3.5 md:gap-5',
    mark: 'h-14 w-14 md:h-20 md:w-20',
    name: 'font-normal text-[clamp(2.15rem,4.6vw,3.375rem)]',
    line: 'mt-2 text-[clamp(0.72rem,1.35vw,1.05rem)]',
    clip: 'whitespace-nowrap',
    px: 80,
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

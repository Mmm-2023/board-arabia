import type { ReactNode } from 'react'

type Tone = 'dark' | 'light' | 'brass'

const eyebrowColor: Record<Tone, string> = {
  dark: 'text-[var(--ba-muted)]',
  light: 'text-[#E8E4F7]',
  brass: 'text-brass-bright/90',
}

const headingColor: Record<Exclude<Tone, 'brass'>, string> = {
  dark: 'text-ink',
  light: 'text-pearl',
}

export function Eyebrow({
  children,
  tone = 'dark',
  className = '',
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <p
      className={`mb-3 font-serif text-[1.05rem] italic md:text-[1.15rem] ${eyebrowColor[tone]} ${className}`}
    >
      {children}
    </p>
  )
}

export function DisplayHeading({
  children,
  className = '',
  tone = 'dark',
  id,
  compact = false,
}: {
  children: ReactNode
  className?: string
  tone?: Exclude<Tone, 'brass'>
  id?: string
  compact?: boolean
}) {
  const size = compact
    ? 'text-[clamp(1.65rem,3vw,2.15rem)]'
    : 'text-[clamp(2.2rem,5vw,3.85rem)]'
  return (
    <h2
      id={id}
      className={`font-display font-bold leading-[1.08] tracking-[-0.035em] text-balance ${size} ${headingColor[tone]} ${className}`}
    >
      {children}
    </h2>
  )
}

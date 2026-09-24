import type { ReactNode } from 'react'

type Tone = 'dark' | 'light' | 'brass'

const eyebrowColor: Record<Tone, string> = {
  dark: 'text-[var(--ba-muted)]',
  light: 'text-stone/85',
  brass: 'text-brass-bright/90',
}

const headingColor: Record<Exclude<Tone, 'brass'>, string> = {
  dark: 'text-ink',
  light: 'text-pearl',
}

export function Eyebrow({
  children,
  tone = 'dark',
}: {
  children: ReactNode
  tone?: Tone
}) {
  return (
    <p
      className={`mb-4 font-serif text-[1.15rem] italic md:text-[1.25rem] ${eyebrowColor[tone]}`}
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
}: {
  children: ReactNode
  className?: string
  tone?: Exclude<Tone, 'brass'>
  id?: string
}) {
  return (
    <h2
      id={id}
      className={`font-display text-[clamp(2.2rem,5vw,3.85rem)] font-bold leading-[1.05] tracking-[-0.035em] text-balance ${headingColor[tone]} ${className}`}
    >
      {children}
    </h2>
  )
}

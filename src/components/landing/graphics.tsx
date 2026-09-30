import { useEffect, useRef, type ReactNode } from 'react'
import { HELD_FOR_LINE } from '../../content/marketing'
import { armMotionRoot, motionAllowed, usePendingReveal } from '../Reveal'

export { HELD_FOR_LINE }

export function ConnectionGraphic() {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = ref.current
    if (!svg || !motionAllowed()) return
    svg.classList.add('ba-draw')
  }, [])

  return (
    <svg
      ref={ref}
      className="ba-g1"
      viewBox="0 0 440 180"
      width="440"
      height="180"
      aria-hidden="true"
    >
      <path className="ba-g1-arc" d="M110 78 C 175 18, 265 18, 330 78" fill="none" stroke="#E8E4F7" strokeWidth="1.5" pathLength="100" />
      <path className="ba-g1-arc" d="M110 78 H330" fill="none" stroke="#E8E4F7" strokeWidth="1.5" pathLength="100" />
      <path className="ba-g1-arc" d="M110 78 C 175 138, 265 138, 330 78" fill="none" stroke="#E8E4F7" strokeWidth="1.5" pathLength="100" />
      <g fill="#E8E4F7">
        <rect x="216" y="30" width="8" height="8" transform="rotate(45 220 34)" />
        <rect x="216" y="74" width="8" height="8" transform="rotate(45 220 78)" />
        <rect x="216" y="118" width="8" height="8" transform="rotate(45 220 122)" />
      </g>
      <g transform="translate(110 78) rotate(45)">
        <rect x="-28" y="-28" width="56" height="56" fill="#4B3F9A" />
        <rect x="-16" y="-16" width="32" height="32" fill="#1C1343" />
        <rect x="-6" y="-6" width="12" height="12" fill="#B8896A" />
      </g>
      <g transform="translate(330 78) rotate(45)">
        <rect x="-28" y="-28" width="56" height="56" fill="none" stroke="#E8E4F7" strokeWidth="3" />
        <rect x="-14" y="-14" width="28" height="28" fill="none" stroke="#E8E4F7" strokeWidth="2" />
      </g>
      <text x="110" y="162" fill="#F6F5FB" fontSize="13" textAnchor="middle" fontFamily="Figtree, sans-serif">
        Saudi Arabia
      </text>
      <text x="330" y="162" fill="#F6F5FB" fontSize="13" textAnchor="middle" fontFamily="Figtree, sans-serif">
        International
      </text>
    </svg>
  )
}

export function IconCapital() {
  return (
    <svg className="ba-icon" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <rect x="0.5" y="0.5" width="43" height="43" rx="10" fill="#FFFFFF" stroke="#E8E4F7" />
      <path d="M22 31 L30 22 L22 13 L14 22 Z" fill="none" stroke="#1C1343" strokeWidth="1.6" />
      <path d="M22 26 V16 M18.5 19.5 L22 16 L25.5 19.5" fill="none" stroke="#4B3F9A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconRelationships() {
  return (
    <svg className="ba-icon" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <rect x="0.5" y="0.5" width="43" height="43" rx="10" fill="#FFFFFF" stroke="#E8E4F7" />
      <path d="M14 28 L20 22 L14 16 L8 22 Z" fill="none" stroke="#1C1343" strokeWidth="1.6" />
      <path d="M30 28 L36 22 L30 16 L24 22 Z" fill="none" stroke="#1C1343" strokeWidth="1.6" />
      <path d="M20 22 H24" stroke="#4B3F9A" strokeWidth="1.6" />
    </svg>
  )
}

export function IconDoors() {
  return (
    <svg className="ba-icon" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <rect x="0.5" y="0.5" width="43" height="43" rx="10" fill="#FFFFFF" stroke="#E8E4F7" />
      <path d="M15 32 V13 H28 V32" fill="none" stroke="#1C1343" strokeWidth="1.6" />
      <path d="M22 13 L31 16.5 V32" fill="#E8E4F7" stroke="#4B3F9A" strokeWidth="1.6" />
      <circle cx="27" cy="23" r="1.5" fill="#B8896A" />
    </svg>
  )
}

export function DiamondGrid({ filled }: { filled: number }) {
  const ref = usePendingReveal<HTMLUListElement>()
  const count = Math.max(0, Math.min(50, filled))
  return (
    <ul ref={ref} className="ba-diamonds" aria-hidden="true">
      {Array.from({ length: 50 }, (_, index) => (
        <li key={index} data-on={index < count ? '1' : '0'} />
      ))}
    </ul>
  )
}

export function HeroEnter({
  children,
  index,
  className = '',
}: {
  children: ReactNode
  index: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !motionAllowed()) return
    armMotionRoot()
    el.style.animationDelay = `${Math.min(4, index) * 80}ms`
    el.classList.add('ba-hero-enter')
  }, [index])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

import {
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'

export function motionAllowed(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof IntersectionObserver !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function mostlyInView(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.height <= 0) return true
  const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
  return visible >= Math.min(rect.height, window.innerHeight) * 0.15
}

/** Scroll reveal. Content stays visible until JS confirms motion is allowed. */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !motionAllowed()) return
    const stagger = Math.min(4, Math.max(0, Math.round(delay < 5 ? delay * 1000 : delay) / 60))
    el.style.transitionDelay = `${stagger * 60}ms`
    const reveal = () => el.classList.add('is-in')
    if (mostlyInView(el)) {
      reveal()
      return
    }
    el.classList.add('ba-reveal')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting && entry.intersectionRatio >= 0.15) {
          reveal()
          observer.disconnect()
        }
      },
      { threshold: [0, 0.15, 0.35] },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [delay])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

export function usePendingReveal<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !motionAllowed()) return
    el.classList.add('ba-pending')
    const reveal = () => el.classList.add('is-in')
    if (mostlyInView(el)) {
      reveal()
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting && entry.intersectionRatio >= 0.15) {
          reveal()
          observer.disconnect()
        }
      },
      { threshold: [0, 0.15, 0.35] },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}

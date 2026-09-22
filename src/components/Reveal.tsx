import { motion } from 'motion/react'
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

function useInViewOnce<T extends HTMLElement>(margin = '-12%') {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: margin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [margin])

  return { ref, visible }
}

export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const { ref, visible } = useInViewOnce<HTMLDivElement>()

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 1, y: 18 }}
      animate={{ opacity: 1, y: visible ? 0 : 18 }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

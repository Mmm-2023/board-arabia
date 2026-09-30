import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { trackApplyClick } from '../../lib/tracking/browser'

export function StickyApply({ menuOpen }: { menuOpen: boolean }) {
  const [narrow, setNarrow] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const apply = () => setNarrow(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (!narrow) return
    const hero = document.getElementById('hero-apply')
    const closing = document.getElementById('closing')
    const footer = document.querySelector('footer')
    if (!hero || !closing || typeof IntersectionObserver === 'undefined') return
    let heroOn = true
    let closingOn = false
    let footerOn = false
    const update = () => setShow(!heroOn && !closingOn && !footerOn && !menuOpen)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === hero) heroOn = entry.isIntersecting
          if (entry.target === closing) closingOn = entry.isIntersecting
          if (footer && entry.target === footer) footerOn = entry.isIntersecting
        }
        update()
      },
      { threshold: 0 },
    )
    observer.observe(hero)
    observer.observe(closing)
    if (footer) observer.observe(footer)
    update()
    return () => observer.disconnect()
  }, [narrow, menuOpen])

  if (!narrow) return null
  const open = show && !menuOpen
  return (
    <div className="ba-sticky" data-state={open ? 'shown' : 'hidden'}>
      <Link
        to="/apply"
        className="ba-primary ba-sticky-btn"
        tabIndex={open ? undefined : -1}
        aria-hidden={open ? undefined : true}
        onClick={() => trackApplyClick('sticky-mobile', 'Apply for consideration')}
      >
        Apply for consideration
      </Link>
    </div>
  )
}

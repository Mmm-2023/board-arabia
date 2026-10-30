import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export const MAIN_ID = 'main'

export const mainLandmarkProps = {
  id: MAIN_ID,
  tabIndex: -1 as const,
}

/** Gives the first main a focus target when a locked screen cannot set it. */
export function ensureMainLandmark(root: ParentNode = document) {
  const main = root.querySelector('main')
  if (!(main instanceof HTMLElement)) return null
  if (!main.id) main.id = MAIN_ID
  if (!main.hasAttribute('tabindex')) main.tabIndex = -1
  return main
}

export function SkipLink() {
  const { pathname } = useLocation()

  useEffect(() => {
    ensureMainLandmark()
  }, [pathname])

  return (
    <a
      className="ba-skip"
      href={`#${MAIN_ID}`}
      data-skip-link=""
      onClick={(event) => {
        const main = ensureMainLandmark()
        if (!main) return
        event.preventDefault()
        main.focus()
      }}
    >
      Skip to content
    </a>
  )
}

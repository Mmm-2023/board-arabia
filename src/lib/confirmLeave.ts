import { useEffect } from 'react'

export const UNSAVED_PROFILE_MESSAGE = 'Leave this page? Your profile changes are not saved.'

/** Asks before an in-app link or a tab close while a profile draft is open. */
export function useConfirmLeave(when: boolean, message = UNSAVED_PROFILE_MESSAGE) {
  useEffect(() => {
    if (!when || typeof window === 'undefined') return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a')
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target && anchor.target !== '_self') return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      let next: URL
      try {
        next = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (next.origin !== window.location.origin) return
      if (next.pathname === window.location.pathname && next.search === window.location.search) return
      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [when, message])
}

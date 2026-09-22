import { useEffect } from 'react'

function upsertMeta(name: string, content: string) {
  let el = document.head.querySelector(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/** Staff routes. Not for marketing pages. */
export function useNoIndex(title: string) {
  useEffect(() => {
    document.title = title
    upsertMeta('robots', 'noindex, nofollow')
  }, [title])
}

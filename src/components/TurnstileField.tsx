import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'light'
    },
  ) => string
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function turnstileSiteKey() {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || ''
}

export function TurnstileField({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string) => void
  resetKey?: number
}) {
  const siteKey = turnstileSiteKey()
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!siteKey || !holder.current) return
    let widgetId = ''
    let cancelled = false
    const node = holder.current

    function mount() {
      if (cancelled || !window.turnstile || !node) return
      widgetId = window.turnstile.render(node, {
        sitekey: siteKey,
        theme: 'light',
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      })
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`)
    if (window.turnstile) {
      mount()
    } else if (existing) {
      existing.addEventListener('load', mount, { once: true })
    } else {
      const script = document.createElement('script')
      script.src = SCRIPT
      script.async = true
      script.addEventListener('load', mount, { once: true })
      document.head.appendChild(script)
    }

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [onToken, resetKey, siteKey])

  if (!siteKey) {
    return (
      <p className="min-h-16 border border-[var(--ba-line)] bg-white px-3 py-3 text-[0.95rem] text-ink/70" data-turnstile="missing">
        The security check could not load. Try again later.
      </p>
    )
  }

  return <div ref={holder} className="min-h-16" data-turnstile="live" />
}

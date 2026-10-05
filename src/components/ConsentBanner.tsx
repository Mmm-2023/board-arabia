import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CONSENT_COPY } from '../content/privacyNotice'
import { ANALYTICS_CONFIG } from '../lib/tracking/flags'
import { shouldAsk } from '../lib/tracking/consent'
import { commitConsent } from '../lib/tracking/commitConsent'

/**
 * Consent banner. It is ordinary markup: no reveal class, no motion root,
 * and no opacity hide. It stays visible with JavaScript motion off and
 * with reduced motion. English only.
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(() => {
    if (typeof document === 'undefined') return true
    return shouldAsk(document.cookie, Date.now())
  })

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('ba-open-consent', onOpen)
    return () => window.removeEventListener('ba-open-consent', onOpen)
  }, [])

  if (!ANALYTICS_CONFIG.enabled || !open) return null

  async function choose(choice: 'accept' | 'reject') {
    setOpen(false)
    await commitConsent(choice, 'en')
  }

  return (
    <section
      className="ba-consent"
      data-consent-banner="open"
      lang="en"
      dir="ltr"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ba-consent-label"
    >
      <div className="ba-consent-inner">
        <p id="ba-consent-label" className="ba-consent-kicker">
          {CONSENT_COPY.label}
        </p>
        <p className="ba-consent-body">{CONSENT_COPY.body}</p>
        <div className="ba-consent-actions">
          <button type="button" className="ba-consent-choice" onClick={() => void choose('accept')}>
            {CONSENT_COPY.accept}
          </button>
          <button type="button" className="ba-consent-choice" onClick={() => void choose('reject')}>
            {CONSENT_COPY.reject}
          </button>
          <Link className="ba-consent-notice" to="/privacy">
            {CONSENT_COPY.notice}
          </Link>
        </div>
      </div>
    </section>
  )
}

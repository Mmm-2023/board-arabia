import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CONSENT_COPY } from '../content/privacyNotice'
import { ANALYTICS_CONFIG } from '../lib/tracking/flags'
import { shouldAsk } from '../lib/tracking/consent'
import { commitConsent } from '../lib/tracking/commitConsent'
import { useSiteLanguage, type SiteLang } from './SiteLanguage'

/**
 * Consent banner. It is ordinary markup: no reveal class, no motion root,
 * and no opacity hide. It stays visible with JavaScript motion off and
 * with reduced motion.
 */
export function ConsentBanner() {
  const { lang, setLang } = useSiteLanguage()
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

  const copy = CONSENT_COPY[lang]
  const noticeTo = lang === 'ar' ? '/privacy?lang=ar' : '/privacy'

  async function choose(choice: 'accept' | 'reject') {
    setOpen(false)
    await commitConsent(choice, lang)
  }

  return (
    <section
      className="ba-consent"
      data-consent-banner="open"
      lang={lang}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="false"
      aria-labelledby="ba-consent-label"
    >
      <div className="ba-consent-inner">
        <div className="ba-consent-langs">
          <LangButton current={lang} lang="en" label="English" onPick={setLang} />
          <LangButton current={lang} lang="ar" label="العربية" onPick={setLang} />
        </div>
        <p id="ba-consent-label" className="ba-consent-kicker">
          {copy.label}
        </p>
        <p className="ba-consent-body">{copy.body}</p>
        <div className="ba-consent-actions">
          <button type="button" className="ba-consent-choice" onClick={() => void choose('accept')}>
            {copy.accept}
          </button>
          <button type="button" className="ba-consent-choice" onClick={() => void choose('reject')}>
            {copy.reject}
          </button>
          <Link className="ba-consent-notice" to={noticeTo}>
            {copy.notice}
          </Link>
        </div>
      </div>
    </section>
  )
}

function LangButton({
  current,
  lang,
  label,
  onPick,
}: {
  current: SiteLang
  lang: SiteLang
  label: string
  onPick: (lang: SiteLang) => void
}) {
  return (
    <button
      type="button"
      className="ba-consent-lang"
      aria-pressed={current === lang}
      onClick={() => onPick(lang)}
    >
      {label}
    </button>
  )
}

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

export type SiteLang = 'en' | 'ar'

const SiteLanguageContext = createContext<{
  lang: SiteLang
  setLang: (lang: SiteLang) => void
}>({
  lang: 'en',
  setLang: () => undefined,
})

function explicitLang(value: string | null): SiteLang | null {
  if (value === 'ar' || value === 'en') return value
  return null
}

export function SiteLanguageProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const lang = useMemo(() => {
    const chosen = explicitLang(params.get('lang'))
    if (chosen) return chosen
    if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ar')) return 'ar'
    return 'en'
  }, [params])

  function setLang(next: SiteLang) {
    const copy = new URLSearchParams(params)
    copy.set('lang', next)
    setParams(copy, { replace: true })
  }

  return <SiteLanguageContext.Provider value={{ lang, setLang }}>{children}</SiteLanguageContext.Provider>
}

export function useSiteLanguage() {
  return useContext(SiteLanguageContext)
}

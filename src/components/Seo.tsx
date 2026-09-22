import { useEffect } from 'react'
import {
  canonicalUrl,
  MARKETING_PAGES,
  OG_IMAGE,
  pageGraph,
  type MarketingPath,
} from '../content/seo'

const JSON_LD_ID = 'board-arabia-ld'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export function Seo({ path }: { path: MarketingPath }) {
  const page = MARKETING_PAGES[path]

  useEffect(() => {
    const url = canonicalUrl(page.path)
    document.title = page.title
    document.documentElement.lang = 'en'
    upsertMeta('name', 'description', page.description)
    upsertMeta('name', 'robots', 'index, follow')
    upsertLink('canonical', url)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:site_name', 'Board Arabia')
    upsertMeta('property', 'og:locale', 'en_US')
    upsertMeta('property', 'og:title', page.title)
    upsertMeta('property', 'og:description', page.description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', OG_IMAGE)
    upsertMeta('property', 'og:image:alt', 'Riyadh skyline at dusk')
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', page.title)
    upsertMeta('name', 'twitter:description', page.description)
    upsertMeta('name', 'twitter:image', OG_IMAGE)
    upsertMeta('name', 'twitter:image:alt', 'Riyadh skyline at dusk')

    let script = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = JSON_LD_ID
      script.type = 'application/ld+json'
      document.head.appendChild(script)
    }
    script.textContent = JSON.stringify(pageGraph(page))
  }, [page])

  return null
}

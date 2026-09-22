import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import App from './App'
import {
  canonicalUrl,
  MARKETING_PAGES,
  OG_IMAGE,
  pageGraph,
  type MarketingPath,
} from './content/seo'

export function render(url: string) {
  const path = (url === '' ? '/' : url) as MarketingPath
  const page = MARKETING_PAGES[path]
  if (!page) throw new Error(`No SEO record for ${url}`)

  const base = import.meta.env.BASE_URL || '/'
  const basename = base === '/' ? undefined : base.replace(/\/$/, '')
  const entry = basename ? `${basename}${path === '/' ? '/' : path}` : path

  const body = renderToStaticMarkup(
    <MemoryRouter basename={basename} initialEntries={[entry]}>
      <App />
    </MemoryRouter>,
  )

  return {
    body,
    title: page.title,
    description: page.description,
    canonical: canonicalUrl(path),
    jsonLd: JSON.stringify(pageGraph(page)),
    image: OG_IMAGE,
  }
}

/** Exact public credit Michael allowed. Any other nammco spelling still fails. */
export const FOOTER_NAMMCO_CREDIT = 'powered by nammco'

/**
 * Exact registration line allowed on dist/privacy and dist/terms,
 * and on the legal-pages chunk that renders those pages.
 */
export const LEGAL_ENTITY_LINE = 'NAMMCO Holding Co.'
export const LEGAL_ENTITY_CR = '7043252647'

const LEGAL_HTML = new Set(['privacy/index.html', 'terms/index.html'])

export function normalizeArtifactPath(relativePath) {
  return String(relativePath || '')
    .split('\\')
    .join('/')
    .replace(/^\.?\//, '')
    .replace(/^dist\//, '')
}

/** Named allowlist. Every other artifact still fails on these strings. */
export function allowsLegalEntityLine(relativePath) {
  const normalized = normalizeArtifactPath(relativePath)
  if (LEGAL_HTML.has(normalized)) return true
  return /^assets\/legal-pages-[A-Za-z0-9_-]+\.js$/.test(normalized)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripBounded(html, phrase, boundary) {
  const pattern = new RegExp(`(^|${boundary})${escapeRegExp(phrase)}(?=$|${boundary})`, 'g')
  return html.replace(pattern, '$1')
}

/**
 * True when text still contains nammco, or the registration CR, after the
 * exact footer credit is removed. On the named legal artifacts, the exact
 * entity line and CR are removed first. The credit must be a whole phrase:
 * nammco.com, Nammco, and NAMMCO stay banned.
 */
export function strayPublicNammco(value, relativePath = '') {
  const credit = new RegExp(
    `(^|[^A-Za-z0-9])${FOOTER_NAMMCO_CREDIT}(?=$|[^A-Za-z0-9.])`,
    'g',
  )
  let html = String(value).replace(credit, '$1')
  if (allowsLegalEntityLine(relativePath)) {
    html = stripBounded(html, LEGAL_ENTITY_LINE, '[^A-Za-z0-9]')
    html = stripBounded(html, LEGAL_ENTITY_CR, '[^0-9]')
  }
  if (new RegExp(`(^|[^0-9])${LEGAL_ENTITY_CR}(?=$|[^0-9])`).test(html)) return true
  return /nammco/i.test(html)
}

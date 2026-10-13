/** Exact public credit Michael allowed. Any other nammco spelling still fails. */
export const FOOTER_NAMMCO_CREDIT = 'powered by nammco'

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
 * True when text still contains nammco after the exact footer credit is removed.
 * The credit must be a whole phrase: nammco.com, Nammco, and NAMMCO stay banned.
 */
export function strayPublicNammco(value, relativePath = '') {
  const credit = new RegExp(
    `(^|[^A-Za-z0-9])${FOOTER_NAMMCO_CREDIT}(?=$|[^A-Za-z0-9.])`,
    'g',
  )
  const html = String(value).replace(credit, '$1')
  void relativePath
  return /nammco/i.test(html)
}

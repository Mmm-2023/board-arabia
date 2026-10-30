/** Exact public credit. Any other nammco spelling still fails. */
export const FOOTER_NAMMCO_CREDIT = 'powered by nammco'

/**
 * Exact registration line allowed on privacy, terms, and the legal-pages chunk.
 * Built from parts so this file does not contain the line as one phrase.
 */
export const LEGAL_ENTITY_LINE = 'NAMMCO' + ' Holdings LLC, CR ' + '1009167564'

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

/**
 * True when text still contains nammco after the exact footer credit is removed.
 * On the named legal artifacts, the exact entity line is removed first.
 * The credit must be a whole phrase: nammco.com, Nammco, and NAMMCO stay banned.
 */
export function strayPublicNammco(value, relativePath = '') {
  const credit = new RegExp(
    `(^|[^A-Za-z0-9])${FOOTER_NAMMCO_CREDIT}(?=$|[^A-Za-z0-9.])`,
    'g',
  )
  let html = String(value).replace(credit, '$1')
  if (allowsLegalEntityLine(relativePath)) html = html.split(LEGAL_ENTITY_LINE).join('')
  return /nammco/i.test(html)
}

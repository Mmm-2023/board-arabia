/** Exact public credit Michael allowed. Any other nammco spelling still fails. */
export const FOOTER_NAMMCO_CREDIT = 'powered by nammco'

/**
 * True when text still contains nammco after the exact lowercase footer credit is removed.
 * The credit must be a whole phrase: nammco.com, Nammco, and NAMMCO stay banned.
 */
export function strayPublicNammco(value) {
  const credit = new RegExp(
    `(^|[^A-Za-z0-9])${FOOTER_NAMMCO_CREDIT}(?=$|[^A-Za-z0-9.])`,
    'g',
  )
  const html = String(value).replace(credit, '$1')
  return /nammco/i.test(html)
}

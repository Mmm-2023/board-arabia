/** Query and hash stay on Apply. The path is fixed so this cannot leave the site. */
export function applyRedirectTarget(location: { search: string; hash: string }) {
  const search = location.search.startsWith('?') ? location.search : ''
  const hash = location.hash.startsWith('#') ? location.hash : ''
  return { pathname: '/apply', search, hash }
}

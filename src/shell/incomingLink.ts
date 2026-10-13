/** Where a native open should go. The website keeps its own URLs. */

const SITE_HOSTS = new Set(['boardarabia.com', 'www.boardarabia.com'])
const APP_SCHEME = 'com.boardarabia.app'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

export type InAppLink = {
  kind: 'in-app'
  path: string
  search: string
  hash: string
}

export type IncomingLink = InAppLink | { kind: 'external'; href: string } | { kind: 'ignore' }

/** Android back moves through WebView history, then leaves the app. */
export function androidBackAction(canGoBack: boolean): 'back' | 'exit' {
  return canGoBack ? 'back' : 'exit'
}

/**
 * Turn a universal link, app link, or com.boardarabia.app URL into an in-app route.
 * Other http(s) links are external. Anything else is ignored.
 */
export function classifyIncomingUrl(raw: string): IncomingLink {
  if (typeof raw !== 'string') return { kind: 'ignore' }
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 4096) return { kind: 'ignore' }
  if (trimmed.includes('\\') || trimmed.includes('\0') || trimmed.includes('..')) return { kind: 'ignore' }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { kind: 'ignore' }
  }

  if (url.username || url.password) return { kind: 'ignore' }

  const protocol = url.protocol.replace(/:$/, '').toLowerCase()
  if (protocol === 'javascript' || protocol === 'data' || protocol === 'blob' || protocol === 'file') {
    return { kind: 'ignore' }
  }

  if (protocol === 'http' || protocol === 'https') {
    if (url.port) return { kind: 'external', href: url.toString() }
    if (SITE_HOSTS.has(url.hostname) || LOCAL_HOSTS.has(url.hostname)) {
      return inApp(url.pathname, url.search, url.hash)
    }
    return { kind: 'external', href: url.toString() }
  }

  if (protocol === 'capacitor') {
    if (!LOCAL_HOSTS.has(url.hostname)) return { kind: 'ignore' }
    return inApp(url.pathname, url.search, url.hash)
  }

  if (protocol === APP_SCHEME) {
    const host = url.hostname
    if (host.includes('.') && !SITE_HOSTS.has(host) && !LOCAL_HOSTS.has(host)) return { kind: 'ignore' }
    return inApp(customSchemePath(url), url.search, url.hash)
  }

  return { kind: 'ignore' }
}

/** True when an auth email or OAuth return is riding on this route. */
export function carriesAuthCallback(link: InAppLink): boolean {
  const query = new URLSearchParams(link.search.replace(/^\?/, ''))
  const hash = new URLSearchParams(link.hash.replace(/^#/, ''))
  const type = (query.get('type') || hash.get('type') || '').toLowerCase()
  if (query.get('token_hash') || hash.get('token_hash')) return true
  if (query.get('code')) return true
  if (hash.get('access_token') || hash.get('refresh_token')) return true
  return type === 'magiclink' || type === 'invite' || type === 'recovery' || type === 'signup' || type === 'email'
}

function inApp(pathname: string, search: string, hash: string): IncomingLink {
  const path = safePath(pathname)
  if (!path) return { kind: 'ignore' }
  if (search.includes('\\') || hash.includes('\\')) return { kind: 'ignore' }
  return { kind: 'in-app', path, search, hash }
}

/**
 * `com.boardarabia.app://auth/confirm` parses with host `auth` and path `/confirm`.
 * A site host, or localhost, keeps the path only.
 */
function customSchemePath(url: URL): string {
  const host = url.hostname
  if (!host || SITE_HOSTS.has(host) || LOCAL_HOSTS.has(host)) return url.pathname || '/'
  const rest = url.pathname === '/' ? '' : url.pathname
  return `/${host}${rest}`
}

function safePath(pathname: string): string | null {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.includes('://')) return null
  const parts: string[] = []
  for (const part of decoded.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') return null
    parts.push(part)
  }
  return `/${parts.join('/')}`
}

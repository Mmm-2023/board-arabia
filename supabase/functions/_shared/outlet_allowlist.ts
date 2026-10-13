/**
 * Allowlist match for the daily market brief.
 * https only, no credentials, port empty or 443, label-boundary host match.
 * A path prefix must equal the path or be followed by a slash.
 * Disabled outlets never match.
 */

export const BRIEF_GROUPS = ['deals', 'regulation', 'leadership'] as const

export type BriefGroup = (typeof BRIEF_GROUPS)[number]

export type OutletRule = {
  name: string
  domain: string
  pathPrefix: string | null
  enabled: boolean
}

/** Approved starter list. The migration seeds the same rows. */
export const STARTER_OUTLETS: readonly OutletRule[] = [
  { name: 'Saudi Press Agency', domain: 'spa.gov.sa', pathPrefix: null, enabled: true },
  { name: 'Argaam', domain: 'argaam.com', pathPrefix: '/en', enabled: true },
  { name: 'Arab News', domain: 'arabnews.com', pathPrefix: null, enabled: true },
  { name: 'Saudi Gazette', domain: 'saudigazette.com.sa', pathPrefix: null, enabled: true },
  { name: 'Asharq Business with Bloomberg', domain: 'asharqbusiness.com', pathPrefix: '/en', enabled: true },
  { name: 'Zawya', domain: 'zawya.com', pathPrefix: null, enabled: true },
  { name: 'MEED', domain: 'meed.com', pathPrefix: null, enabled: true },
  { name: 'Saudi Exchange (Tadawul) announcements', domain: 'saudiexchange.sa', pathPrefix: null, enabled: true },
  { name: 'Capital Market Authority', domain: 'cma.org.sa', pathPrefix: null, enabled: true },
  { name: 'Ministry of Investment', domain: 'misa.gov.sa', pathPrefix: null, enabled: true },
  { name: 'Vision 2030', domain: 'vision2030.gov.sa', pathPrefix: null, enabled: true },
]

const HOST_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export function isIpHost(host: string): boolean {
  if (host.includes(':') || host.startsWith('[')) return true
  const parts = host.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** Bare hostname. Null when the value has a scheme, path, port, or address. */
export function bareHostname(value: string): string | null {
  const host = value.trim().toLowerCase().replace(/\.+$/, '')
  if (!host || host.length > 253) return null
  if (host.includes('xn--')) return null
  if (!HOST_RE.test(host)) return null
  if (isIpHost(host)) return null
  return host
}

/** Empty becomes null. A bad prefix is the string invalid. */
export function barePathPrefix(value: string | null | undefined): string | null | 'invalid' {
  if (value == null) return null
  const text = value.trim()
  if (!text) return null
  if (!/^\/[a-z0-9][a-z0-9/_-]{0,60}$/.test(text)) return 'invalid'
  if (text.includes('..') || text.endsWith('/') || text.includes('//')) return 'invalid'
  return text
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

function pathMatches(pathname: string, prefix: string | null): boolean {
  if (!prefix) return true
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** The enabled outlet that covers this URL, or null. */
export function outletForUrl(raw: string, outlets: readonly OutletRule[]): OutletRule | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.port !== '' && url.port !== '443') return null
  const host = url.hostname.toLowerCase().replace(/\.+$/, '')
  if (!host || host.includes('xn--') || isIpHost(host)) return null
  const pathname = url.pathname || '/'
  let best: OutletRule | null = null
  let bestScore = -1
  for (const outlet of outlets) {
    if (!outlet.enabled) continue
    const domain = bareHostname(outlet.domain)
    if (!domain) continue
    if (!hostMatches(host, domain)) continue
    const prefix = barePathPrefix(outlet.pathPrefix)
    if (prefix === 'invalid') continue
    if (!pathMatches(pathname, prefix)) continue
    const score = domain.length * 1000 + (prefix ? prefix.length : 0)
    if (score > bestScore) {
      best = { ...outlet, domain, pathPrefix: prefix }
      bestScore = score
    }
  }
  return best
}

/** True when an ISO timestamp or UTC date falls inside the last `hours` and is not in the future. */
export function datedWithinHours(value: string, now: Date, hours: number): boolean {
  const iso = value.trim()
  const parsed = Date.parse(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso)
  if (!Number.isFinite(parsed)) return false
  const age = now.getTime() - parsed
  if (age < -6 * 60 * 60 * 1000) return false
  return age <= hours * 60 * 60 * 1000
}

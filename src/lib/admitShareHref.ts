/** Accept only our first-party share click URL. No flag values live in this file. */
export function safeAdmitShareHref(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    if (!url.hostname.endsWith('.supabase.co')) return null
    if (!url.pathname.endsWith('/admit-li-share-go')) return null
    const token = url.searchParams.get('t') || ''
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null
    return url.toString()
  } catch {
    return null
  }
}

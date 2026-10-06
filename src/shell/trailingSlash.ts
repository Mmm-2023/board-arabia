/**
 * Same-origin path only. Search and hash stay with the caller.
 * A host, scheme, or protocol-relative path is left alone.
 */
export function slashlessPath(pathname: string): string | null {
  if (typeof pathname !== 'string') return null
  if (pathname.length <= 1 || !pathname.endsWith('/')) return null
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return null
  if (pathname.includes('\\') || pathname.includes('://') || pathname.includes('@')) return null
  const next = pathname.replace(/\/+$/, '')
  if (!next.startsWith('/') || next.startsWith('//')) return null
  if (next.includes('?') || next.includes('#') || next.includes(' ')) return null
  return next
}

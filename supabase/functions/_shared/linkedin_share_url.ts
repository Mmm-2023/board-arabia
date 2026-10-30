/** LinkedIn composer URL. The member posts. We never call LinkedIn. */

export function linkedInShareUrl(postBody: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(postBody)}`
}

export function isLinkedInShareUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    if (url.hostname !== 'www.linkedin.com') return false
    if (url.pathname !== '/feed/') return false
    if (url.searchParams.get('shareActive') !== 'true') return false
    return true
  } catch {
    return false
  }
}

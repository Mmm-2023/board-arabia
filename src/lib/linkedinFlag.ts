/** Build-time gate. Unset or any value other than "true" keeps LinkedIn Connect hidden. */
export function linkedInConnectEnabled(flag: unknown): boolean {
  return flag === 'true'
}

export const LINKEDIN_CONNECT_ENABLED = linkedInConnectEnabled(import.meta.env?.VITE_LINKEDIN_CONNECT)

export const LINKEDIN_COPY = {
  section: 'LinkedIn',
  heading: 'Speed up with LinkedIn',
  body: 'Pull your name, headline, company, photo, and profile link. We never see or store your LinkedIn password.',
  connect: 'Connect LinkedIn',
  manual: 'Fill in manually',
  redirect: 'You\u2019ll sign in with LinkedIn, then return here to review what we pull.',
  success: 'LinkedIn details added. Review and save if anything needs a tweak.',
  connected: 'LinkedIn connected',
  refresh: 'Refresh from LinkedIn',
  refreshHelp: 'Updates name, headline, company, photo, and LinkedIn URL. You can still edit after.',
  refreshSuccess: 'Updated from LinkedIn. Review and save if you want to keep changes.',
  cancelled: 'LinkedIn connect was cancelled. You can fill your profile manually or try again.',
  technical: 'Couldn\u2019t reach LinkedIn. Try again in a moment, or fill your profile manually.',
  tryAgain: 'Try again',
  dismiss: 'Dismiss',
  opening: 'Opening\u2026',
} as const

/** Accept only the official LinkedIn authorize URL before the browser leaves this site. */
export function officialLinkedInAuthorizeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    if (url.hostname !== 'www.linkedin.com') return null
    if (url.pathname !== '/oauth/v2/authorization') return null
    return url.toString()
  } catch {
    return null
  }
}

/** Profile return path. Local dev and the public site only. */
export function allowedProfileRedirect(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.pathname !== '/dashboard/profile' || url.search || url.hash) return null
  const host = url.hostname.toLowerCase()
  const local = host === 'localhost' || host === '127.0.0.1'
  if (local) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.origin}/dashboard/profile`
  }
  if (url.protocol !== 'https:') return null
  if (host !== 'boardarabia.com' && host !== 'www.boardarabia.com') return null
  return `${url.origin}/dashboard/profile`
}

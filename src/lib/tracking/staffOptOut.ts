import { readCookie } from './consent.ts'

export const NO_TRACK_COOKIE = 'ba_no_track'
export const TRACK_PREF_COOKIE = 'ba_track_pref'

export type StaffOptOutAction = 'set' | 'keep-off' | 'respect-allow'

/** First staff session on this browser opts out. An explicit allow is kept. */
export function staffOptOutAction(cookies: { noTrack: boolean; pref: 'on' | 'off' | null }): StaffOptOutAction {
  if (cookies.pref === 'on') return 'respect-allow'
  if (cookies.pref === 'off' || cookies.noTrack) return 'keep-off'
  return 'set'
}

export function noTrackCookiePair(enabled: boolean, secure: boolean): string {
  const secureFlag = secure ? '; Secure' : ''
  if (!enabled) {
    return `${NO_TRACK_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secureFlag}`
  }
  return `${NO_TRACK_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${secureFlag}`
}

export function trackPrefCookiePair(pref: 'on' | 'off', secure: boolean): string {
  const secureFlag = secure ? '; Secure' : ''
  return `${TRACK_PREF_COOKIE}=${pref}; Path=/; Max-Age=31536000; SameSite=Lax${secureFlag}`
}

/** Cookie lines to write when a staff session opens /admin. Empty when already set or explicitly allowed. */
export function applyStaffBrowserOptOut(cookieHeader: string, secure: boolean): string[] {
  const noTrack = readCookie(cookieHeader, NO_TRACK_COOKIE) === '1'
  const prefRaw = readCookie(cookieHeader, TRACK_PREF_COOKIE)
  const pref = prefRaw === 'on' || prefRaw === 'off' ? prefRaw : null
  const action = staffOptOutAction({ noTrack, pref })
  if (action === 'respect-allow') return []
  if (action === 'keep-off' && noTrack) return []
  return [noTrackCookiePair(true, secure), trackPrefCookiePair('off', secure)]
}

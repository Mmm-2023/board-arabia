/** Directory soft-gate rules. Live seat counts only. No invented members. */

export const DIRECTORY_COPY = {
  kicker: 'Directory',
  heading: 'Founding 100 is filling',
  body: 'The private directory opens as founding seats are admitted. This is not a public list. Invite peers you trust, and keep your profile ready so they can find you when names go live.',
  progressLoading: 'Founding seats admitted',
  progressError: 'Couldn’t refresh the seat count.',
  retry: 'Retry',
  invite: 'Invite 2',
  complete: 'Complete your profile',
  noInvites: 'No invites left',
  ghostLabel: 'Preview of how peers will appear',
  sector: 'Sector',
  city: 'City',
  role: 'Role',
  seat: 'Seat',
  seatPlaceholder: 'KSA or Intl',
} as const

export const DIRECTORY_GHOST_COUNT = 4
export const DIRECTORY_GHOST_COUNT_MOBILE = 3

const INVITE_CAP = 2

export type ProfileReadyInput = {
  full_name: string | null
  headline: string | null
  location: string | null
} | null

/**
 * Ready when name, headline, and location are filled.
 * Those are the fields a later directory card can show as identity, role, and city.
 * Photo, company, bio, and LinkedIn stay optional.
 */
export function isProfileReady(profile: ProfileReadyInput) {
  if (!profile) return false
  return Boolean(profile.full_name?.trim() && profile.headline?.trim() && profile.location?.trim())
}

export type InviteAction =
  | { type: 'link'; remaining: number; helper: string }
  | { type: 'disabled'; helper: typeof DIRECTORY_COPY.noInvites }

export type DirectoryCtas = {
  primary: 'complete' | 'invite'
  invite: InviteAction
  showComplete: boolean
}

export function directoryCtas(profileReady: boolean, invitesRemaining: number): DirectoryCtas {
  const remaining = normalizeInvites(invitesRemaining)
  const invite: InviteAction =
    remaining > 0
      ? { type: 'link', remaining, helper: `${remaining} of ${INVITE_CAP} invites left` }
      : { type: 'disabled', helper: DIRECTORY_COPY.noInvites }

  if (!profileReady) {
    return { primary: 'complete', invite, showComplete: false }
  }
  return { primary: 'invite', invite, showComplete: true }
}

export function progressLine(admitted: number) {
  return `${admitted} of 100 founding seats admitted`
}

/** Integer from platform_stats only. Null means the caller must show an error, not a guess. */
export function readAdmittedCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return null
}

export async function loadFoundingAdmitted(
  query: () => Promise<{ count: unknown; failed: boolean }>,
): Promise<{ status: 'ready'; admitted: number } | { status: 'error' }> {
  try {
    const result = await query()
    if (result.failed) return { status: 'error' }
    const admitted = readAdmittedCount(result.count)
    if (admitted == null) return { status: 'error' }
    return { status: 'ready', admitted }
  } catch {
    return { status: 'error' }
  }
}

function normalizeInvites(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

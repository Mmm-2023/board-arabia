/** Default picture when a member has no uploaded photo. */

export const AVATAR_STYLES = ['male', 'female'] as const
export type AvatarStyle = (typeof AVATAR_STYLES)[number]

export const DEFAULT_PICTURE_LABEL = 'Default picture when no photo'

export const AVATAR_STYLE_LABEL: Record<AvatarStyle, string> = {
  male: 'Man',
  female: 'Woman',
}

/** Committed SVG only. Same palette and face marks as the example portraits. */
export const AVATAR_ILLUSTRATION: Record<AvatarStyle, string> = {
  male: '/avatars/male.svg',
  female: '/avatars/female.svg',
}

export function normalizeAvatarStyle(value: unknown): AvatarStyle {
  return value === 'female' ? 'female' : 'male'
}

export function avatarStylePatch(value: unknown): { avatar_style: AvatarStyle } | null {
  if (value !== 'male' && value !== 'female') return null
  return { avatar_style: value }
}

/** Writes the column patch, or refuses a value outside male | female. */
export function commitAvatarStyle(
  value: unknown,
  save: (patch: { avatar_style: AvatarStyle }) => void,
): boolean {
  const patch = avatarStylePatch(value)
  if (!patch) return false
  save(patch)
  return true
}

export type AvatarChoice =
  | { kind: 'photo'; src: string }
  | { kind: 'illustration'; style: AvatarStyle }

/**
 * Uploaded photos win. A failed or missing photo falls back to the
 * illustrated default. Unknown styles use male.
 */
export function resolveAvatar(input: {
  photoUrl?: string | null
  photoFailed?: boolean
  style?: unknown
}): AvatarChoice {
  const photo = typeof input.photoUrl === 'string' ? input.photoUrl.trim() : ''
  if (photo && !input.photoFailed) return { kind: 'photo', src: photo }
  return { kind: 'illustration', style: normalizeAvatarStyle(input.style) }
}

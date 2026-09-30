/** Default picture when a member has no uploaded photo. */

export const AVATAR_STYLES = [
  'man-shemagh',
  'man-ghutra',
  'man-suit-beard',
  'man-suit',
  'woman-hijab-black',
  'woman-abaya-black',
  'woman-hijab-navy',
  'woman-shayla',
] as const

export type AvatarStyle = (typeof AVATAR_STYLES)[number]

/** Values still stored until migration 20261112120000 is applied. */
export const LEGACY_AVATAR_STYLES = ['male', 'female'] as const
export type LegacyAvatarStyle = (typeof LEGACY_AVATAR_STYLES)[number]
export type StoredAvatarStyle = AvatarStyle | LegacyAvatarStyle

export const DEFAULT_AVATAR_STYLE: AvatarStyle = 'man-shemagh'

/** Michael's mapping. A shemagh is the red and white check. A ghutra is plain white. */
export const LEGACY_AVATAR_STYLE: Record<LegacyAvatarStyle, AvatarStyle> = {
  male: 'man-shemagh',
  female: 'woman-hijab-black',
}

export const DEFAULT_PICTURE_LABEL = 'Default picture when no photo'
export const DEFAULT_PICTURE_NOTE = 'An uploaded photo is shown instead of this picture.'

export const AVATAR_STYLE_LABEL: Record<AvatarStyle, string> = {
  'man-shemagh': 'Man in red shemagh',
  'man-ghutra': 'Man in white ghutra',
  'man-suit-beard': 'Man in a suit with a beard',
  'man-suit': 'Man in a suit',
  'woman-hijab-black': 'Woman in a black hijab',
  'woman-abaya-black': 'Woman in a black abaya',
  'woman-hijab-navy': 'Woman in a navy hijab',
  'woman-shayla': 'Woman in a black shayla',
}

export const AVATAR_WIDTHS = [96, 256] as const

/** Largest webp, used when a browser ignores srcset. */
export const AVATAR_ILLUSTRATION: Record<AvatarStyle, string> = {
  'man-shemagh': '/avatars/man-shemagh-256.webp',
  'man-ghutra': '/avatars/man-ghutra-256.webp',
  'man-suit-beard': '/avatars/man-suit-beard-256.webp',
  'man-suit': '/avatars/man-suit-256.webp',
  'woman-hijab-black': '/avatars/woman-hijab-black-256.webp',
  'woman-abaya-black': '/avatars/woman-abaya-black-256.webp',
  'woman-hijab-navy': '/avatars/woman-hijab-navy-256.webp',
  'woman-shayla': '/avatars/woman-shayla-256.webp',
}

export function avatarSrcSet(style: AvatarStyle, ext: 'webp' | 'avif'): string {
  return AVATAR_WIDTHS.map((width) => `/avatars/${style}-${width}.${ext} ${width}w`).join(', ')
}

export function isAvatarStyle(value: unknown): value is AvatarStyle {
  return typeof value === 'string' && (AVATAR_STYLES as readonly string[]).includes(value)
}

export function isStoredAvatarStyle(value: unknown): value is StoredAvatarStyle {
  return isAvatarStyle(value) || value === 'male' || value === 'female'
}

export function normalizeAvatarStyle(value: unknown): AvatarStyle {
  if (isAvatarStyle(value)) return value
  if (value === 'female') return LEGACY_AVATAR_STYLE.female
  return DEFAULT_AVATAR_STYLE
}

/** Writes one of the eight keys. Legacy male and female are display-only. */
export function avatarStylePatch(value: unknown): { avatar_style: AvatarStyle } | null {
  if (!isAvatarStyle(value)) return null
  return { avatar_style: value }
}

/** Writes the column patch, or refuses a value outside the eight keys. */
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
 * illustrated default. Legacy male and unknown styles use man-shemagh.
 * Legacy female uses woman-hijab-black.
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

export const AVATAR_BUCKET = 'member-avatars'
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type AvatarContentType = (typeof AVATAR_TYPES)[number]

export function avatarObjectPath(userId: string) {
  return `${userId}/avatar`
}

export function avatarContentType(type: string): AvatarContentType | null {
  const normalized = type === 'image/jpg' ? 'image/jpeg' : type
  return AVATAR_TYPES.find((item) => item === normalized) ?? null
}

export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!avatarContentType(file.type) || file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    return 'Use a JPG, PNG, or WebP under 2 MB.'
  }
  return null
}

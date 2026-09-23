export const AVATAR_BUCKET = 'member-avatars'
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024

const AVATAR_TYPES = ['image/jpeg', 'image/png'] as const

export type AvatarContentType = (typeof AVATAR_TYPES)[number]

export const AVATAR_COPY = {
  section: 'Photo',
  add: 'Add photo',
  change: 'Change photo',
  remove: 'Remove photo',
  helper: 'Shown to founding peers when the private directory opens.',
  uploadError: 'Couldn’t upload that photo. Try a JPG or PNG under 5 MB.',
  tryAgain: 'Try again',
  removeTitle: 'Remove photo?',
  removeBody: 'Your profile will show the empty photo placeholder until you add another.',
  cancel: 'Cancel',
} as const

export function avatarObjectPath(userId: string) {
  return `${userId}/avatar`
}

export function avatarContentType(type: string): AvatarContentType | null {
  const normalized = type === 'image/jpg' ? 'image/jpeg' : type
  return AVATAR_TYPES.find((item) => item === normalized) ?? null
}

export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!avatarContentType(file.type) || file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    return AVATAR_COPY.uploadError
  }
  return null
}

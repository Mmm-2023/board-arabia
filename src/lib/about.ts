/** About (profiles.bio). Shown on the expanded card and the intro request. */

export const ABOUT_MAX = 400

export const ABOUT_HELPER = 'Shown on your expanded card and when you ask for an introduction.'

export const ABOUT_CONTACT_WARNING = 'Do not add contact details here.'

const CONTACT = /@|\+?[0-9][\s0-9()-]{7,}/

export function aboutLengthError(value: string): string {
  if (value.trim().length > ABOUT_MAX) return 'About can be 400 characters at most.'
  return ''
}

/** Warning only. Saving is still allowed. */
export function aboutHasContact(value: string): boolean {
  return CONTACT.test(value)
}

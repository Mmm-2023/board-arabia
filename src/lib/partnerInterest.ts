export const PARTNER_INTEREST_BUSY = 'We have had a lot of requests today. Please try again tomorrow.'

export const PARTNER_INTEREST_THANKS = 'Thanks, our admin team will be in touch if it is a fit.'

/** busy_today is an error. A repeat for the same firm looks like the normal thanks line. */
export function partnerInterestError(message: string): string | null {
  if (message.includes('busy_today')) return PARTNER_INTEREST_BUSY
  if (message.includes('already_sent')) return null
  return 'Could not save that note. Try again.'
}

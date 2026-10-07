export const PARTNER_INTEREST_BUSY = 'We have had a lot of requests today. Please try again tomorrow.'

export function partnerInterestError(message: string): string {
  if (message.includes('busy_today')) return PARTNER_INTEREST_BUSY
  if (message.includes('already_sent')) return 'We already have a note for this firm.'
  return 'Could not save that note. Try again.'
}

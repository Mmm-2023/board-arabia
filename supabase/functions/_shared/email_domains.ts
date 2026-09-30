/** Disposable and free-webmail domains. example.com is never on either list. */

export const DISPOSABLE_EMAIL_DOMAINS = [
  '10minutemail.com',
  '10minutemail.net',
  'discard.email',
  'discardmail.com',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'jetable.org',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailnesia.com',
  'mailnull.com',
  'mintemail.com',
  'mohmal.com',
  'mytemp.email',
  'notmailinator.com',
  'sharklasers.com',
  'spam4.me',
  'spamgourmet.com',
  'temp-mail.org',
  'tempail.com',
  'tempinbox.com',
  'tempmail.com',
  'tempr.email',
  'throwawaymail.com',
  'tmpmail.net',
  'tmpmail.org',
  'trash-mail.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.io',
  'trashmail.me',
  'trashmail.net',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.gq',
  'yopmail.net',
  'yopmail.org',
] as const

export const FREE_WEBMAIL_DOMAINS = [
  'aol.com',
  'fastmail.com',
  'gmail.com',
  'gmx.com',
  'gmx.net',
  'googlemail.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'mac.com',
  'mail.com',
  'me.com',
  'msn.com',
  'outlook.com',
  'pm.me',
  'proton.me',
  'protonmail.com',
  'yahoo.com',
  'ymail.com',
  'zoho.com',
] as const

export function emailDomain(email: string) {
  const at = email.lastIndexOf('@')
  if (at < 0) return ''
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
}

/** Parent domains, excluding a bare TLD. mail.mailinator.com matches mailinator.com. */
export function domainSuffixes(domain: string) {
  const labels = domain.split('.').filter(Boolean)
  const suffixes: string[] = []
  for (let index = 0; index < labels.length - 1; index += 1) {
    suffixes.push(labels.slice(index).join('.'))
  }
  return suffixes
}

export function domainListed(domain: string, list: readonly string[]) {
  const blocked = new Set(list)
  return domainSuffixes(domain).some((suffix) => blocked.has(suffix))
}

export function disposableDomain(email: string) {
  return domainListed(emailDomain(email), DISPOSABLE_EMAIL_DOMAINS)
}

export function isFreeWebmail(email: string) {
  return domainListed(emailDomain(email), FREE_WEBMAIL_DOMAINS)
}

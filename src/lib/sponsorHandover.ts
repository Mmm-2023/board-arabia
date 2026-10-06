import { SPONSOR_LABEL } from './sponsorLabel.ts'

/** Plain sign-in steps. No password, code, token, or link. */
export function sponsorSignInSteps(): string {
  return [
    `${SPONSOR_LABEL} sign-in steps`,
    '1. Open the Board Arabia sign-in page.',
    '2. Enter the email address our admin team gave you.',
    '3. Set a password when the page asks for one.',
    'This invite is not emailed. Hand these steps over yourself.',
  ].join('\n')
}

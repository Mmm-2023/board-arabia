/**
 * Phase 1 trust copy. Ship only lines the claim gate allows.
 * The due diligence 30-day sentence is not in this list: the page
 * adds it only when read_dd_retention_copy() returns true.
 * No company name. No em dash. English only.
 */

export const SECURITY_PATH = '/security'

export const SECURITY_H1 = 'Trust and privacy'

export const SECURITY_LEAD =
  'Board Arabia is built for people whose names, companies and plans should stay private. Here is how we protect what you share with us, in plain words.'

export const PRIVATE_BY_DESIGN = [
  'Board Arabia is by application only. Every application is reviewed personally, and the member area opens only after you are admitted and signed in.',
  'The member directory is visible only to signed-in members. It never shows your email, phone number or turnover or assets band.',
  'Contact details are shared only between the two members in an introduction, and only after it is accepted.',
  "Each member's records are walled off at the database level, so one member cannot open another member's data.",
  'We do not sell personal data.',
] as const

export const WHERE_DATA_LIVES = [
  'Your account, application and member data are stored in Frankfurt, Germany, in the European Union.',
  'Data is encrypted in transit and at rest by our hosting provider.',
  'AI tools send the content you choose to analyse to a specialist AI provider for processing.',
] as const

export const FILES_AND_AI = [
  'Files you upload are kept in private storage that only your account can open, unless you choose to share it with admin.',
  'You can delete any AI result or upload at any time.',
  'AI tool uploads and their results are deleted automatically after 30 days.',
] as const

/** Shown on /security only when the signed-in DD retention flag reads true. */
export const DD_RETENTION_LINE = 'Due diligence uploads are deleted automatically after 30 days.'

export const SIGNING_IN = [
  'Sign-in is protected by email verification, and sign-up and application forms are protected against automated abuse.',
  'Admin access is limited to named staff and checked on our servers, not only in the browser.',
  'Two-step sign-in with an authenticator app is required for admin and available to every member.',
] as const

export const KEEPING_IT_RUNNING =
  'Data we no longer need is deleted on a published schedule. See our Privacy Notice.'

export const COOKIES_AND_ANALYTICS =
  'We do not use advertising trackers. If we measure visits, analytics cookies are set only after you choose Accept, and Reject is just as easy.'

export const IF_SOMETHING_GOES_WRONG =
  'If a data breach is likely to affect you, we will tell you and the Saudi Data and AI Authority as the law requires.'

export const YOUR_RIGHTS_LEAD =
  'You can ask to see, copy, correct or delete your data, and withdraw consent, under the Saudi Personal Data Protection Law.'

export const YOUR_RIGHTS_PANEL =
  'Members can also manage visibility and download their data from Your privacy.'

export const ISO_FOOTNOTE =
  'Board Arabia does not hold an ISO 27001 or SOC 2 certification of its own. Our hosting provider is independently audited.'

export const LANDING_STRIP_LEAD =
  'Private by design. Members only, stored in Frankfurt, encrypted throughout.'

export const LANDING_STRIP_LINK = 'How we protect your data'

export const APPLY_STRIP =
  'Your application is seen only by Board Arabia admin. It is stored in Frankfurt, encrypted, and never shown publicly.'

export const APPLY_STRIP_LINK = 'Privacy Notice'

export const REGISTER_STRIP =
  'We use your details only to consider your membership. Accounts that never complete a request are deleted after 120 days.'

/** Register trust line. Empty unless the two-tier flag is on. */
export function registerStrip(enabled: boolean): string {
  return enabled ? REGISTER_STRIP : ''
}

export const AI_UPLOAD_HINT =
  'Confidential. Only your account can open this file. You can delete it at any time. Deleted automatically after 30 days.'

export const UPLOAD_HANDLING_SUMMARY = 'How is this handled?'

export const UPLOAD_HANDLING =
  'Your file is stored in Frankfurt and sent to a specialist AI provider only to produce your result. It is not shown to other members.'

export const DD_PRIVATE_LINE =
  'Only your account can open this deck, unless you choose to share it with admin.'

export const TRUST_COPY = [
  SECURITY_H1,
  SECURITY_LEAD,
  ...PRIVATE_BY_DESIGN,
  ...WHERE_DATA_LIVES,
  ...FILES_AND_AI,
  DD_RETENTION_LINE,
  ...SIGNING_IN,
  KEEPING_IT_RUNNING,
  COOKIES_AND_ANALYTICS,
  IF_SOMETHING_GOES_WRONG,
  YOUR_RIGHTS_LEAD,
  YOUR_RIGHTS_PANEL,
  ISO_FOOTNOTE,
  LANDING_STRIP_LEAD,
  LANDING_STRIP_LINK,
  APPLY_STRIP,
  APPLY_STRIP_LINK,
  REGISTER_STRIP,
  AI_UPLOAD_HINT,
  UPLOAD_HANDLING_SUMMARY,
  UPLOAD_HANDLING,
  DD_PRIVATE_LINE,
]

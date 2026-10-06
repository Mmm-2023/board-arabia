import { BANNER_VERSION, NOTICE_VERSION } from '../../supabase/functions/_shared/consent_versions.ts'

export const NOTICE_VERSION_LABEL = NOTICE_VERSION
export const BANNER_VERSION_LABEL = BANNER_VERSION

export type NoticeBlock = {
  heading: string
  paragraphs: string[]
}

export type PrivacyNotice = {
  kicker: string
  title: string
  version: string
  intro: string
  sections: NoticeBlock[]
  unchanged: string[]
}

const PLACEHOLDER_ENTITY = '[BOARD ARABIA LEGAL ENTITY]'
const PLACEHOLDER_CONFIRM = '[TO CONFIRM]'
const PLACEHOLDER_TRANSFER = '[TRANSFER SAFEGUARDS TO CONFIRM]'

export const PRIVACY_NOTICE_EN: PrivacyNotice = {
  kicker: 'Privacy',
  title: 'Privacy notice.',
  version: `Notice version ${NOTICE_VERSION}. Dated 30 September 2026.`,
  intro:
    'This notice explains what Board Arabia collects, why, and how long it is kept. The legal entity name, commercial registration, address, privacy contact, and transfer wording below stay as placeholders until they are confirmed.',
  sections: [
    {
      heading: 'Who controls this data',
      paragraphs: [
        `Controller: ${PLACEHOLDER_ENTITY}.`,
        `Commercial registration: ${PLACEHOLDER_CONFIRM}.`,
        `Address: ${PLACEHOLDER_CONFIRM}.`,
        `Privacy contact: ${PLACEHOLDER_CONFIRM}.`,
        `Data protection officer: ${PLACEHOLDER_CONFIRM}.`,
      ],
    },
    {
      heading: 'What we collect',
      paragraphs: [
        'Application and member data: name, email, LinkedIn, title, company, turnover or AUM band, optional phone, commercial registration number, sector tags, statement, first-touch campaign values, and referrer host.',
        'If you open an account for consideration, we keep that account: your name, work email, role, region, and the credentials you save for our admin team. We also keep which link brought you here. You can delete that account yourself from Account after you confirm. Deleting it removes those credentials and the sign-in. It does not remove a full member record.',
        'Site analytics: pages, engaged time, scroll depth, coarse location taken from an IP address that is not stored, campaign source, and named events.',
        'Site analytics are not the membership file. Cookies for analytics run only after you choose Accept. Before that, visits are counted without an identifier that could tie one visit to the next.',
        'If you leave the public-totals box checked, a verified capacity figure can be added into a platform sum after you are admitted. The public site shows that sum only. It does not show your name, your company, or your amount.',
      ],
    },
    {
      heading: 'Why we use it',
      paragraphs: [
        'We use this data to assess applications, run membership, and measure and improve the site and campaigns.',
      ],
    },
    {
      heading: 'Legal basis',
      paragraphs: [
        'Consent: analytics cookies and tracking after you choose Accept.',
        'Legitimate interest: anonymous aggregate visit counts before a choice, with no identifier.',
        'Contract, or steps before a contract: processing an application.',
      ],
    },
    {
      heading: 'Who receives it',
      paragraphs: [
        'PostHog processes site analytics. Supabase hosts application and member data. We do not sell personal data.',
      ],
    },
    {
      heading: 'Where it is processed',
      paragraphs: [
        'Application data and site analytics are stored and processed in Frankfurt, Germany (European Union).',
        PLACEHOLDER_TRANSFER,
      ],
    },
    {
      heading: 'How long we keep it',
      paragraphs: [
        'An account that opens for consideration and never submits a membership request is deleted at 120 days. One reminder is sent at 90 days. A sign-up that never confirms its email is deleted after 7 days.',
        'Rejected, declined, withdrawn, or closed requests, and legacy applications, are deleted 12 months after the decision.',
        'Members who leave are deleted or anonymised within 24 months of exit, unless a legal hold applies.',
        'Analytics events are kept for 13 months maximum. The consent log is kept for 13 months. The marketing stats cache is kept for 24 hours.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'You can ask to be informed, to access your data, to obtain a copy, to correct it, and to have it destroyed. You can withdraw consent at any time. You can complain to SDAIA (the Saudi Data and AI Authority).',
        'From Account, you can delete an account that has not become a full member. Confirming that deletion destroys the credentials on the account and the sign-in.',
        `To exercise these rights, write to the privacy contact in the first section once it is published. Until then the contact remains ${PLACEHOLDER_CONFIRM}.`,
      ],
    },
    {
      heading: 'Date and changes',
      paragraphs: [
        'This version is dated 30 September 2026. When the notice changes, the version and date on this page change with it. A new banner version asks you to choose again.',
      ],
    },
  ],
  unchanged: [
    'This site does not publish a member directory, does not sell personal information, and does not open a public calendar.',
    'There is no checkout on these pages, so they do not take a card.',
  ],
}

export const CONSENT_COPY = {
  body: 'We use analytics to understand how boardarabia.com is used and to improve it. With your permission we set cookies to measure visits, time on page and which campaigns brought you here. Without it we only count anonymous visits. Data is hosted in Frankfurt, Germany.',
  accept: 'Accept',
  reject: 'Reject',
  notice: 'Privacy notice',
  settings: 'Cookie settings',
  label: 'Analytics cookies',
} as const

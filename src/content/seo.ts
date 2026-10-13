import { LEGAL_PENDING, legalField } from '../config/legal.ts'
import { ACCOUNT_FLOW_APPLY_ANSWER } from './twoTierCopy.ts'
import { isTwoTierRegisterEnabled, publicConsiderationCta } from '../lib/twoTierRegister.ts'

export const SITE_ORIGIN = 'https://boardarabia.com'

export const OG_TITLE = 'Board Arabia'

export const HOME_SHARE_TITLE = 'Board Arabia | Saudi boardrooms meet international capital'

export const OG_DESCRIPTION =
  'Board Arabia is a selective founding membership linking Saudi Chairpersons, board members and C-suite executives with international capital.'

export const OG_IMAGE = `${SITE_ORIGIN}/og-board-arabia.png`

export const OG_IMAGE_ALT = 'Board Arabia stacked wordmark and Najdi diamond mark on Night Indigo'

export const OG_IMAGE_WIDTH = '1200'

export const OG_IMAGE_HEIGHT = '630'

export const OG_IMAGE_TYPE = 'image/png'

export const THEME_COLOR = '#1C1343'

export const MARKETING_PATHS = [
  '/',
  '/apply',
  '/for-members',
  '/for-capital',
  '/partners',
  '/how-it-works',
  '/about',
  '/privacy',
  '/account-deletion',
  '/legal',
  '/security',
  '/terms',
] as const

export type MarketingPath = (typeof MARKETING_PATHS)[number]

export type MarketingPage = {
  path: MarketingPath
  title: string
  description: string
  faq?: boolean
}

export const MARKETING_PAGES: Record<MarketingPath, MarketingPage> = {
  '/': {
    path: '/',
    title: HOME_SHARE_TITLE,
    description: OG_DESCRIPTION,
    faq: true,
  },
  '/for-members': {
    path: '/for-members',
    title: 'For members: directory, mandates, majlis | Board Arabia',
    description:
      'What Board Arabia members get: a private directory, reviewed intros and mandates, majlis events, deal rooms and Vision 2030 tags.',
    faq: true,
  },
  '/for-capital': {
    path: '/for-capital',
    title: 'For capital: family offices, FDI, PE, VC | Board Arabia',
    description:
      'Family offices, FDI, PE and VC reach Board Arabia members through mandates our admin team reviews. No open directory, no cold outreach.',
  },
  '/partners': {
    path: '/partners',
    title: 'Partners: three annual partner seats | Board Arabia',
    description:
      'Board Arabia offers three annual partner seats, led by finance and deal-execution firms. Register partner interest through the form.',
  },
  '/how-it-works': {
    path: '/how-it-works',
    title: 'How Board Arabia works: apply, review, invite',
    description:
      'Apply with credentials, receive a personal review, then a private email invite if accepted. Members then use the Board Arabia dashboard.',
    faq: true,
  },
  '/apply': {
    path: '/apply',
    title: 'Apply for founding membership | Board Arabia',
    description:
      'Apply to Board Arabia with your credentials. Every application gets a personal review, and a private invite follows by email if accepted.',
  },
  '/about': {
    path: '/about',
    title: 'About Board Arabia | Founding 100 membership',
    description:
      'Board Arabia is a founding membership for Chairpersons and board members: 50 places in Saudi Arabia, 50 international. Admission is by review.',
    faq: true,
  },
  '/privacy': {
    path: '/privacy',
    title: 'Privacy notice | Board Arabia',
    description:
      'How Board Arabia collects, uses, stores and deletes your data, how analytics consent works, and how to ask for access or deletion.',
  },
  '/account-deletion': {
    path: '/account-deletion',
    title: 'Delete your account | Board Arabia',
    description:
      'How a Board Arabia member deletes an account from Your privacy, and how to ask for deletion when sign-in is not available. The profile, directory listing, introductions, notifications and event replies are removed. Deal room files and AI tool uploads are not removed by that step.',
  },
  '/legal': {
    path: '/legal',
    title: 'Terms | Board Arabia',
    description:
      'This Board Arabia address sends you to the Terms page. Membership, admission and the private network are set out there. The Privacy notice is a separate page.',
  },
  '/security': {
    path: '/security',
    title: 'Trust and security | Board Arabia',
    description:
      'How Board Arabia protects applications and member data: members-only directory, private storage, encryption and two-step sign-in.',
  },
  '/terms': {
    path: '/terms',
    title: 'Terms of use | Board Arabia',
    description:
      'The terms for using Board Arabia: admission by personal review, member conduct, partners, events, AI tools and liability.',
  },
}

export type FaqItem = {
  question: string
  answer: string
  to?: string
  toLabel?: string
}

const APPLY_FAQ: FaqItem = {
  question: 'How do I apply?',
  answer:
    'Submit the pre-vet form with your credentials (LinkedIn, titles, companies, turnover or family-office AUM). Applications are reviewed personally; accepted candidates receive a private invite email.',
  to: '/apply',
  toLabel: 'Apply for consideration',
}

const CALENDAR_FAQ: FaqItem = {
  question: 'Is there a public calendar or open booking link?',
  answer:
    'No. Visitors never see an open calendar. A private invite email is sent only after acceptance.',
  to: '/how-it-works',
  toLabel: 'How admission works',
}

const FOUNDING_FAQ: FaqItem = {
  question: 'What is the Founding 100?',
  answer:
    'A capped founding cohort: 50 Saudi and 50 international seats. Founding places are complimentary. We ask for time, judgment and introductions in return.',
}

const NAMES_FAQ: FaqItem = {
  question: 'Are there public member names or reviews?',
  answer: 'No. The site does not publish invented member lists, photos, or reviews.',
}

/** Home FAQ. Five questions. Answer text is also the FAQPage JSON-LD. */
export const FAQ: FaqItem[] = [
  {
    question: 'What is Board Arabia?',
    answer:
      'Board Arabia is a selective founding membership that connects Saudi Arabia’s boardrooms with international counterparts for Chairpersons, Board members, and C-suite executives. Access to capital, business relationships, and opening doors happen in reviewed rooms. Growth and governance stay in the frame. It is not an open directory. It is a board network for Saudi and international rooms, kept off the open web.',
  },
  {
    question: 'Who is it for?',
    answer:
      'Chairpersons, Board members, and C-suite executives. Saudi, GCC, and international candidates in the Founding 100.',
  },
  APPLY_FAQ,
  CALENDAR_FAQ,
  {
    question: 'How do family offices or FDI engage?',
    answer:
      'Capital (FDI, family offices, PE, VC) engages through mandates our admin team reviews. There is no open outbound to members.',
    to: '/for-capital',
    toLabel: 'For capital',
  },
]

/** Moved off the home page onto /for-members. */
export const MEMBERS_FAQ: FaqItem[] = [
  FOUNDING_FAQ,
  {
    question: 'What do members get?',
    answer:
      'Mandates admin reviews, a private Directory, Intros, Invites, Deal rooms, Real estate, Majlis, and AI tools: AI Due Diligence, CFO check and Deal readiness memo. AI tools are not legal, financial or investment advice.',
  },
  NAMES_FAQ,
  {
    question: 'What do the platform totals mean?',
    answer:
      'Platform totals show aggregate investment capability, family office assets, and business turnover. Founding seats are the count of admitted members. Names, photos, and individual amounts are never shown. Figures reflect the network\'s represented capacity. Individual amounts are never shown.',
  },
]

/** /how-it-works keeps apply, calendar, Founding 100, and public names, plus admission. */
export const HOW_IT_WORKS_FAQ: FaqItem[] = [
  APPLY_FAQ,
  CALENDAR_FAQ,
  FOUNDING_FAQ,
  NAMES_FAQ,
  {
    question: 'What happens after I am admitted?',
    answer:
      'After admission, members use the Board Arabia dashboard: the private directory, the member tools, and availability controls.',
    to: '/for-members',
    toLabel: 'Member tools',
  },
]

const ABOUT_FAQ: FaqItem[] = [
  {
    question: 'What is Board Arabia?',
    answer:
      "Board Arabia is a selective founding membership for Chairpersons, board members and C-suite executives, connecting Saudi Arabia's boardrooms with international capital.",
  },
  {
    question: 'Who can join?',
    answer:
      'Chairpersons, board members and C-suite executives. The Founding 100 has 50 places for Saudi Arabia and the GCC and 50 for international members.',
  },
  {
    question: 'How do I join?',
    answer:
      'Apply at boardarabia.com/apply/. Each application gets a personal review. If accepted, you receive a private invite by email. There is no open signup or public calendar.',
  },
  {
    question: 'How do investors engage members?',
    answer:
      'Family offices, FDI, PE and VC engage members through mandates our admin team reviews. The member directory is private.',
  },
  {
    question: 'How do I contact Board Arabia?',
    answer: '',
  },
]

/** Configured contact mailbox, or null when the legal env is unset. Never a hardcoded address. */
export function publishedContactEmail(): string | null {
  const value = legalField('contactEmail').trim()
  if (!value || value === LEGAL_PENDING.en || !value.includes('@')) return null
  return value
}

function contactAnswer(): string {
  const email = publishedContactEmail()
  if (!email) return 'Use the contact email published for Board Arabia.'
  return `Email ${email}.`
}

function aboutFaqItems(): FaqItem[] {
  return ABOUT_FAQ.map((item) =>
    item.question === 'How do I contact Board Arabia?' ? { ...item, answer: contactAnswer() } : item,
  )
}

export function faqFor(path: string): FaqItem[] | null {
  if (path === '/') return FAQ
  if (path === '/how-it-works') return HOW_IT_WORKS_FAQ
  if (path === '/for-members') return MEMBERS_FAQ
  if (path === '/about') return aboutFaqItems()
  return null
}

/** Apply FAQ link follows the consideration CTA. The account-flow answer is flag-on only. */
export function publicFaqItems(items: FaqItem[], enabled = isTwoTierRegisterEnabled()): FaqItem[] {
  const cta = publicConsiderationCta(enabled)
  return items.map((item) => {
    if (item.question !== 'How do I apply?') return item
    return {
      ...item,
      answer: enabled ? ACCOUNT_FLOW_APPLY_ANSWER : item.answer,
      to: cta.to,
      toLabel: cta.label,
    }
  })
}

const HOW_IT_WORKS_TITLE_ON = 'How Board Arabia works: register, complete, review'

/** Page title follows the flag. Off keeps the pre-TT-4 title. */
export function publicMarketingTitle(page: MarketingPage, enabled = isTwoTierRegisterEnabled()): string {
  if (page.path === '/how-it-works' && enabled) return HOW_IT_WORKS_TITLE_ON
  return page.title
}

export function canonicalUrl(path: string) {
  if (path === '/' || path === '') return `${SITE_ORIGIN}/`
  const clean = path.startsWith('/') ? path : `/${path}`
  const withSlash = clean.endsWith('/') ? clean : `${clean}/`
  return `${SITE_ORIGIN}${withSlash}`
}

/** Public marketing href. Directory routes keep the trailing slash GitHub Pages serves. */
export function publicHref(to: string): string {
  if (!to.startsWith('/') || to.startsWith('//')) return to
  const cut = to.search(/[?#]/)
  const path = cut === -1 ? to : to.slice(0, cut)
  const suffix = cut === -1 ? '' : to.slice(cut)
  if (path === '/' || path === '') return `/${suffix}`
  const bare = path.endsWith('/') ? path.slice(0, -1) : path
  if (!(MARKETING_PATHS as readonly string[]).includes(bare)) return to
  return `${bare}/${suffix}`
}

export function pageGraph(page: MarketingPage) {
  const url = canonicalUrl(page.path)
  const contact = publishedContactEmail()
  const organization: Record<string, unknown> = {
    '@type': 'Organization',
    '@id': `${SITE_ORIGIN}/#organization`,
    name: 'Board Arabia',
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/favicon.svg`,
    image: OG_IMAGE,
    description:
      "A selective founding membership connecting Saudi Arabia's Chairpersons, board members and C-suite executives with international capital.",
    areaServed: ['Saudi Arabia', 'GCC', 'International'],
  }
  if (contact) {
    organization.email = contact
    organization.contactPoint = {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: contact,
      availableLanguage: 'en',
    }
  }
  const graph: Record<string, unknown>[] = [
    organization,
    {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      name: 'Board Arabia',
      url: `${SITE_ORIGIN}/`,
      inLanguage: 'en',
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      inLanguage: 'en',
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      about: { '@id': `${SITE_ORIGIN}/#organization` },
    },
  ]

  if (page.path !== '/') {
    const crumbs = [
      { name: 'Board Arabia', item: `${SITE_ORIGIN}/` },
      { name: page.title.split('|')[0].trim(), item: url },
    ]
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: crumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: crumb.item,
      })),
    })
  }

  const faqs = faqFor(page.path)
  if (faqs) {
    const shown = publicFaqItems(faqs)
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      url,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      mainEntity: shown.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    })
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}

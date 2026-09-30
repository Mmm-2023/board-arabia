export const SITE_ORIGIN = 'https://boardarabia.com'

export const OG_TITLE = 'Board Arabia'

export const OG_DESCRIPTION =
  'A selective founding membership for Chairpersons, Board members, and C-suite executives connecting Saudi Arabia’s boardrooms with international counterparts. Access to capital, business relationships, and opening doors in trusted rooms.'

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
    title: 'Board Arabia | Saudi boardrooms meet international counterparts',
    description:
      'A selective founding membership for Chairpersons, Board members, and C-suite executives connecting Saudi Arabia’s boardrooms with international counterparts. Access to capital, business relationships, and opening doors in trusted rooms.',
    faq: true,
  },
  '/for-members': {
    path: '/for-members',
    title: 'Member tools: directory, mandates, majlis | Board Arabia',
    description:
      'Board Arabia members use a private directory, admin-gated mandates and intros, availability controls, founding badge, quarterly majlis, invite vouchers, Vision 2030 tags, and deal rooms.',
    faq: true,
  },
  '/for-capital': {
    path: '/for-capital',
    title: 'For capital: FDI, family offices, PE & VC | Board Arabia',
    description:
      'Family offices, FDI, PE, and VC engage Board Arabia members through admin-gated mandates. No open scrape of the directory. Apply for consideration remains the public gate.',
  },
  '/partners': {
    path: '/partners',
    title: 'Ecosystem partners: 3 annual seats | Board Arabia',
    description:
      'Board Arabia offers three annual Founding Ecosystem Partner seats, prioritising finance and deal-rail categories. Partner interest is by form or email. There is no public calendar.',
  },
  '/how-it-works': {
    path: '/how-it-works',
    title: 'How Board Arabia works: apply, review, invite',
    description:
      'Apply with credentials, personal review, then a private invite by email if accepted. No open calendar. After admission, members use the Board Arabia dashboard.',
    faq: true,
  },
  '/apply': {
    path: '/apply',
    title: 'Apply for consideration | Board Arabia',
    description:
      'Submit credentials for Board Arabia founding membership review. LinkedIn, titles, companies, turnover or family-office AUM, and optional investable capacity. Private next step by email if accepted. There is no public calendar.',
  },
  '/about': {
    path: '/about',
    title: 'About Board Arabia | Founding membership',
    description:
      'Board Arabia is a founding membership for chairpersons and NEDs: fifty places in Saudi Arabia and fifty international. Admission is by review, not by open signup.',
  },
  '/privacy': {
    path: '/privacy',
    title: 'Privacy | Board Arabia',
    description:
      'Board Arabia collects the credentials you submit for a personal review. This site does not publish a member directory, sell personal information, or open a public calendar.',
  },
  '/terms': {
    path: '/terms',
    title: 'Terms | Board Arabia',
    description:
      'These Board Arabia pages are informational. They do not reserve a Founding 100 place, price a seat, or open a public calendar. Admission follows a personal review.',
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
    'Submit the pre-vet form with your credentials (LinkedIn, titles, companies, turnover or family-office AUM). Applications are reviewed personally; accepted candidates receive a private next-step email.',
  to: '/apply',
  toLabel: 'Apply for consideration',
}

const CALENDAR_FAQ: FaqItem = {
  question: 'Is there a public calendar or open booking link?',
  answer:
    'No. Visitors never see an open calendar. A private booking link is emailed only after acceptance.',
  to: '/how-it-works',
  toLabel: 'How admission works',
}

const FOUNDING_FAQ: FaqItem = {
  question: 'What is the Founding 100?',
  answer:
    'A capped founding cohort: 50 Saudi and 50 international seats, with complimentary founding terms pending contribution as set by the desk.',
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
      'Board Arabia is a selective founding membership that connects Saudi Arabia’s boardrooms with international counterparts for Chairpersons, Board members, and C-suite executives. Access to capital, business relationships, and opening doors happen in reviewed rooms. Growth and governance stay in the frame. It is not an open directory.',
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
      'Capital (FDI, family offices, PE, VC) engages through admin-gated mandates. There is no open outbound to members.',
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
      'Access to capital through an admin-gated mandate inbox; business relationships through a private directory, Majlis, and warm intros; opening doors through deal rooms and peer vouchers; plus founding badge, sector and Vision 2030 tags, and AI Due Diligence for public-source governance support.',
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

export function faqFor(path: string): FaqItem[] | null {
  if (path === '/') return FAQ
  if (path === '/how-it-works') return HOW_IT_WORKS_FAQ
  if (path === '/for-members') return MEMBERS_FAQ
  return null
}

export function canonicalUrl(path: string) {
  if (path === '/' || path === '') return `${SITE_ORIGIN}/`
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

export function pageGraph(page: MarketingPage) {
  const url = canonicalUrl(page.path)
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': `${SITE_ORIGIN}/#organization`,
      name: 'Board Arabia',
      url: `${SITE_ORIGIN}/`,
      description:
        'A selective founding membership for Chairpersons, Board members, and C-suite executives connecting Saudi Arabia’s boardrooms with international counterparts.',
      email: 'partners@boardarabia.com',
      areaServed: ['Saudi Arabia', 'GCC', 'International'],
      knowsAbout: [
        'Chairperson',
        'Board member',
        'C-suite executive',
        'founding membership',
        'Founding 100',
        'family office',
        'FDI',
        'Vision 2030',
        'private directory',
        'mandate inbox',
        'Saudi Arabia',
        'Gulf Cooperation Council (GCC)',
        'private equity',
        'venture capital',
        'ecosystem partner',
      ],
    },
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
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      url,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      mainEntity: faqs.map((item) => ({
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

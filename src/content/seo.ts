export const SITE_ORIGIN = 'https://boardarabia.com'

export const OG_IMAGE =
  'https://images.unsplash.com/photo-1586724237569-f3d0c1dee8c6?auto=format&fit=crop&w=1200&h=630&q=80'

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
    title:
      'Board Arabia — Selective founding board membership | Saudi, GCC & international',
    description:
      'Board Arabia is a reviewed founding membership for chairpersons, board advisors, and aspiring NEDs across Saudi Arabia, the GCC, and internationally. Apply for consideration — no public calendar.',
    faq: true,
  },
  '/for-members': {
    path: '/for-members',
    title: 'Member tools — directory, mandates, majlis | Board Arabia',
    description:
      'Board Arabia members use a private directory, admin-gated mandates and intros, availability controls, founding badge, quarterly majlis, invite vouchers, Vision 2030 tags, and deal rooms.',
  },
  '/for-capital': {
    path: '/for-capital',
    title: 'For capital — FDI, family offices, PE & VC | Board Arabia',
    description:
      'Family offices, FDI, PE, and VC engage Board Arabia members through admin-gated mandates. No open scrape of the directory. Apply for consideration remains the public gate.',
  },
  '/partners': {
    path: '/partners',
    title: 'Ecosystem partners — 3 annual seats | Board Arabia',
    description:
      'Board Arabia offers three annual Founding Ecosystem Partner seats, prioritising finance and deal-rail categories. Partner interest is by form or email — no public calendar.',
  },
  '/how-it-works': {
    path: '/how-it-works',
    title: 'How Board Arabia works — apply, review, invite',
    description:
      'Apply with credentials, personal review, then a private invite by email if accepted. No open calendar. After admission, members use the Board Arabia dashboard.',
    faq: true,
  },
  '/apply': {
    path: '/apply',
    title: 'Apply for consideration — Board Arabia',
    description:
      'Submit credentials for Board Arabia founding membership review. LinkedIn, titles, companies, and turnover or family-office AUM. Private next step by email if accepted — no public calendar.',
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

/** Home FAQ. Answer text is also the FAQPage JSON-LD. */
export const FAQ: FaqItem[] = [
  {
    question: 'What is Board Arabia?',
    answer:
      'Board Arabia is a reviewed founding membership connecting chairpersons, board advisors, and aspiring NEDs with peers and capital proximity in Saudi Arabia, the GCC, and internationally — not an open directory.',
  },
  {
    question: 'Who is it for?',
    answer:
      'Chairpersons, board advisors, and aspiring non-executive directors (NEDs), including Saudi, GCC, and international candidates in the Founding 100.',
    to: '/for-members',
    toLabel: 'Member tools',
  },
  {
    question: 'How do I apply?',
    answer:
      'Submit the pre-vet form at /apply with credentials (LinkedIn, titles, companies, turnover or family-office AUM). Applications are reviewed personally; accepted candidates receive a private next-step email.',
    to: '/apply',
    toLabel: 'Apply for consideration',
  },
  {
    question: 'Is there a public calendar or open booking link?',
    answer:
      'No. Visitors never see an open calendar. A private booking link is emailed only after acceptance.',
    to: '/how-it-works',
    toLabel: 'How admission works',
  },
  {
    question: 'What is the Founding 100?',
    answer:
      'A capped founding cohort: 50 Saudi and 50 international seats, with complimentary founding terms pending contribution as set by the desk.',
  },
  {
    question: 'What do members get?',
    answer:
      'Private directory, admin-gated mandate inbox and warm intros, availability controls, founding badge and LinkedIn announce, quarterly majlis, peer invite vouchers, sector and Vision 2030 tags, and deal rooms — details on /for-members.',
    to: '/for-members',
    toLabel: 'See the tools',
  },
  {
    question: 'How do family offices or FDI engage?',
    answer:
      'Capital (FDI, family offices, PE, VC) engages through admin-gated mandates — not open outbound to members. See /for-capital; the public CTA remains Apply for consideration.',
    to: '/for-capital',
    toLabel: 'For capital',
  },
  {
    question: 'Are there public member names or reviews?',
    answer:
      'No. The site does not publish invented member lists, photos, or reviews.',
  },
]

/** /how-it-works reuses home questions 3–5 and 8, plus admission. */
export const HOW_IT_WORKS_FAQ: FaqItem[] = [
  FAQ[2],
  FAQ[3],
  FAQ[4],
  FAQ[7],
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
        'Selective founding board membership for chairpersons, board advisors, and aspiring NEDs (Saudi Arabia, GCC, international).',
      email: 'partners@boardarabia.com',
      areaServed: ['Saudi Arabia', 'GCC', 'International'],
      knowsAbout: [
        'chairperson',
        'board advisor',
        'non-executive director (NED)',
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

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
    title: 'Board Arabia | Founding membership for chairs and NEDs',
    description:
      'Board Arabia is a selective founding membership for chairpersons, NEDs, and board advisors: fifty places in Saudi Arabia and the GCC, fifty international. Request consideration.',
    faq: true,
  },
  '/for-members': {
    path: '/for-members',
    title: 'Member directory and tools | Board Arabia',
    description:
      'Admitted Board Arabia members use a private directory, availability controls, warm introductions, a founding badge, and Vision 2030 tags. Not a public list.',
  },
  '/for-capital': {
    path: '/for-capital',
    title: 'Mandates for family offices and FDI | Board Arabia',
    description:
      'Family offices, private equity, venture, and foreign direct investors reach Board Arabia members only by an admin-gated mandate. No public directory.',
  },
  '/partners': {
    path: '/partners',
    title: 'Founding Ecosystem Partner seats | Board Arabia',
    description:
      'Board Arabia offers three annual Founding Ecosystem Partner seats to finance firms on the rails of a deal. Fifteen categories. Interest by email. No fee on this site.',
  },
  '/how-it-works': {
    path: '/how-it-works',
    title: 'How Board Arabia admission works | Board Arabia',
    description:
      'Board Arabia admission runs pre-vet, then a personal review with no fixed response time, then accept and a private email. No public calendar.',
  },
  '/apply': {
    path: '/apply',
    title: 'Request consideration | Board Arabia',
    description:
      'Request consideration for Board Arabia. The pre-vet is credentials only. Every application is reviewed personally, with no fixed response time. Acceptance is a private email.',
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

export const FAQ: FaqItem[] = [
  {
    question: 'What is Board Arabia?',
    answer:
      'Board Arabia is a selective founding membership for chairpersons, non-executive directors (NEDs), and board advisors in Saudi Arabia and the GCC, together with international peers. It is not an open directory.',
  },
  {
    question: 'Who is Board Arabia for?',
    answer:
      'It is for chairs, NEDs, and board advisors who work in Saudi Arabia or the wider GCC, and for international counterparts who work with Saudi companies, family offices, and foreign direct investment.',
    to: '/for-members',
    toLabel: 'What members use',
  },
  {
    question: 'What is the Founding 100?',
    answer:
      'The Founding 100 is one hundred places, split evenly: 50 Saudi and 50 international. Founding membership is complimentary, pending contribution to the room. Seats are not priced on this site.',
  },
  {
    question: 'How does someone request consideration?',
    answer:
      'Submit a pre-vet: name, email, LinkedIn, titles, companies, and turnover or family-office size. There is no fixed response time. Every application is reviewed personally. The form does not reserve a time, and this site has no public calendar.',
    to: '/apply',
    toLabel: 'Request consideration',
  },
  {
    question: 'What happens after an application is accepted?',
    answer:
      'Accepted candidates receive a private email to arrange a conversation. That message is sent only by email and is not published on this website. Admission to the member dashboard follows the conversation. A decline is sent as a clear note.',
    to: '/how-it-works',
    toLabel: 'See the sequence',
  },
  {
    question: 'How do family offices and FDI reach members?',
    answer:
      'Family offices, private equity, venture capital, and foreign direct investors reach members by a mandate. Admin reads the mandate before it is delivered. There is no export of the directory and no scraped contact list.',
    to: '/for-capital',
    toLabel: 'How capital engages',
  },
  {
    question: 'What are Vision 2030 tags?',
    answer:
      'Sector and Vision 2030 tags sit inside the membership. They tell admin where a member works so a relevant mandate can be matched. They are not a public profile.',
    to: '/for-members#tags',
    toLabel: 'Sector tags',
  },
  {
    question: 'How do the three partner seats work?',
    answer:
      'Board Arabia offers three annual Founding Ecosystem Partner seats to firms on the finance rails of a deal. Interest is sent by email. A seat is not a logo placement, not a checkout, and it does not bypass admin.',
    to: '/partners',
    toLabel: 'Partner seats',
  },
]

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
      description: MARKETING_PAGES['/'].description,
      email: 'partners@boardarabia.com',
      areaServed: ['Saudi Arabia', 'GCC', 'International'],
      knowsAbout: [
        'chairpersons',
        'non-executive directors',
        'board advisors',
        'Founding 100',
        'family offices',
        'foreign direct investment',
        'Vision 2030',
        'Saudi Arabia',
        'GCC',
        'international board practice',
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

  if (page.faq) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      url,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      mainEntity: FAQ.map((item) => ({
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

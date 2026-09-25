import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { MarketingLayout } from '../components/MarketingLayout'

const TOOLS = [
  {
    id: 'directory',
    title: 'Private directory',
    paragraphs: [
      'The directory is the list of admitted members. It opens after you are inside the membership.',
      'It is not a public profile, not a download, and not a page this site will print. Names stay in the room.',
    ],
  },
  {
    id: 'inbox',
    title: 'Mandate inbox',
    paragraphs: [
      'Capital writes a mandate. Admin reads it before a member sees it. You do not receive a cold approach from this site.',
      'Family offices, funds, and foreign investors meet the same gate. The capital page explains that side of the room.',
    ],
  },
  {
    id: 'availability',
    title: 'Availability',
    paragraphs: [
      'You set whether you can be approached. The setting is yours: open to a relevant introduction, or not.',
      'Admin and the mandate inbox follow that setting. Availability is a control, not a status badge for the public web.',
    ],
  },
  {
    id: 'intros',
    title: 'Warm introductions',
    paragraphs: [
      'An introduction is proposed with a reason. Admin releases it, or does not. There is no open thread between members and outsiders.',
      'A voucher can start a name. It cannot skip the release.',
    ],
  },
  {
    id: 'badge',
    title: 'Founding badge',
    paragraphs: [
      'Admitted founding members receive a mark of the hundred. You may announce it, including on LinkedIn, and add it to your profile when you choose.',
      'The site does not sign you in with LinkedIn, and it does not post on your behalf.',
    ],
  },
  {
    id: 'majlis',
    title: 'Quarterly majlis',
    paragraphs: [
      'Four salons a year. Small enough to be a conversation, held in person, and kept off the public record.',
      'Dates are circulated to members. They are not listed here.',
    ],
  },
  {
    id: 'vouchers',
    title: 'Peer invite vouchers',
    paragraphs: [
      'Each member holds a limited number of invitations. You may extend one to a chair or advisor you would sit with.',
      'The nominee still submits a pre-vet and still faces review. A voucher is a recommendation, not an admission.',
    ],
  },
  {
    id: 'tags',
    title: 'Sector and Vision 2030 tags',
    paragraphs: [
      'Tags say where you sit: a sector, a Vision 2030 theme, the kind of board work you actually do.',
      'They help admin match a mandate to members who are available. They are not a public biography.',
    ],
  },
  {
    id: 'rooms',
    title: 'Deal rooms',
    paragraphs: [
      'A deal room opens for a live mandate, and only by admin. It closes when the work ends.',
      'It is not a public data room, and it is not listed on this website.',
    ],
  },
]

export function ForMembersPage() {
  return (
    <MarketingLayout path="/for-members">
      <header className="mx-auto max-w-7xl px-5 pt-12 pb-4 md:px-10 md:pt-20">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">
          For members
        </p>
        <h1 className="max-w-3xl font-display text-[clamp(2.5rem,5.5vw,4.4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          Built for founding members
        </h1>
        <p className="mt-6 max-w-2xl text-[1.08rem] leading-relaxed text-ink/65">
          Founding members of Board Arabia access tools designed for
          board-level discretion: a private peer directory, structured mandate
          inbox, warm intros under admin oversight, and quarterly majlis. This
          is not an open marketplace.
        </p>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              <a
                href={`#${tool.id}`}
                className="text-[0.75rem] font-semibold tracking-[0.1em] text-ink/45 uppercase hover:text-ink"
              >
                {tool.title}
              </a>
            </li>
          ))}
        </ul>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16" aria-labelledby="dashboard-preview">
        <h2
          id="dashboard-preview"
          className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold tracking-[-0.03em] text-ink"
        >
          Dashboard, as a preview
        </h2>
        <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-ink/60">
          The frame shows the shape of the member dashboard. It contains no
          names, no photographs, and no mandates.
        </p>
        <DashboardPreview />
      </section>

      <div className="mx-auto max-w-7xl px-5 pb-8 md:px-10">
        {TOOLS.map((tool) => (
          <article
            key={tool.id}
            id={tool.id}
            className="grid gap-6 border-t border-ink/10 py-12 md:grid-cols-[16rem_1fr] md:gap-16 md:py-16"
          >
            <h2 className="font-display text-[1.7rem] font-semibold tracking-[-0.03em] text-ink">
              {tool.title}
            </h2>
            <div className="max-w-2xl space-y-4">
              {tool.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-[1.05rem] leading-relaxed text-ink/70">
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        ))}

        <article className="grid gap-6 border-t border-ink/10 py-12 md:grid-cols-[16rem_1fr] md:gap-16 md:py-16">
          <h2 className="font-display text-[1.7rem] font-semibold tracking-[-0.03em] text-ink">
            Capital, from the member side
          </h2>
          <div className="max-w-2xl space-y-4 text-[1.05rem] leading-relaxed text-ink/70">
            <p>
              The mandate inbox and deal rooms above are how capital reaches
              you. Both are admin-gated. You see a mandate when you are
              available and when it fits.
            </p>
            <p>
              <Link to="/for-capital" className="border-b border-brass text-ink">
                How capital engages
              </Link>
            </p>
          </div>
        </article>
      </div>

      <CtaBand />
    </MarketingLayout>
  )
}

function DashboardPreview() {
  const rail = ['Directory', 'Mandate inbox', 'Availability', 'Introductions', 'Majlis']
  const panes = [
    { label: 'Directory', value: 'Members only' },
    { label: 'Inbox', value: 'Empty until admin delivers' },
    { label: 'Availability', value: 'Set by you' },
    { label: 'Founding mark', value: 'After admission' },
  ]

  return (
    <div className="mt-8 overflow-hidden border border-ink/10 bg-white/70">
      <div className="flex items-center justify-between gap-4 border-b border-ink/10 px-5 py-3">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/45 uppercase">
          Member dashboard
        </p>
        <p className="text-[0.72rem] tracking-[0.08em] text-brass uppercase">
          Preview · no live data
        </p>
      </div>
      <div className="grid md:grid-cols-[13.5rem_1fr]">
        <ul className="border-b border-ink/10 md:border-r md:border-b-0">
          {rail.map((item, index) => (
            <li
              key={item}
              className={`px-5 py-3 text-[0.92rem] ${
                index === 0 ? 'ba-primary' : 'text-ink/70'
              }`}
            >
              {item}
            </li>
          ))}
        </ul>
        <div className="p-6 md:p-8">
          <p className="font-display text-[1.45rem] font-semibold tracking-[-0.03em] text-ink">
            Private to admitted members
          </p>
          <p className="mt-3 max-w-lg text-[0.98rem] leading-relaxed text-ink/60">
            A working surface, not a public profile. The panes below are
            labels only.
          </p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            {panes.map((pane) => (
              <div key={pane.label} className="border border-ink/10 px-4 py-4">
                <dt className="text-[0.7rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">
                  {pane.label}
                </dt>
                <dd className="mt-2 font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">
                  {pane.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}

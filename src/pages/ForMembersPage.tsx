import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { DashboardPreview } from '../components/DashboardPreview'
import { FaqList } from '../components/FaqList'
import { MarketingLayout } from '../components/MarketingLayout'
import { MEMBER_TOOLS } from '../content/marketing'
import { MEMBERS_FAQ } from '../content/seo'

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
          <li>
            <a
              href="#due-diligence"
              className="text-[0.75rem] font-semibold tracking-[0.1em] text-ink/45 uppercase hover:text-ink"
            >
              AI Due Diligence
            </a>
          </li>
        </ul>
      </header>

      <DashboardPreview />

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
              <ToolLead id={tool.id} />
              {tool.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-[1.05rem] leading-relaxed text-ink/70">
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        ))}

        <DiligenceArticle />

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

      <FaqList items={MEMBERS_FAQ} heading="Membership questions" />
      <CtaBand />
    </MarketingLayout>
  )
}

function ToolLead({ id }: { id: string }) {
  const line = MEMBER_TOOLS.find((tool) => tool.id === id)?.home
  if (!line) return null
  return <p className="text-[1.05rem] leading-relaxed text-ink/70">{line}</p>
}

function DiligenceArticle() {
  const tool = MEMBER_TOOLS.find((item) => item.id === 'due-diligence')
  if (!tool) return null
  return (
    <article
      id={tool.id}
      className="grid gap-6 border-t border-ink/10 py-12 md:grid-cols-[16rem_1fr] md:gap-16 md:py-16"
    >
      <h2 className="font-display text-[1.7rem] font-semibold tracking-[-0.03em] text-ink">
        {tool.title}
      </h2>
      <p className="max-w-2xl text-[1.05rem] leading-relaxed text-ink/70">{tool.home}</p>
    </article>
  )
}

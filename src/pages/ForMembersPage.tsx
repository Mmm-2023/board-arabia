import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { DashboardPreview } from '../components/DashboardPreview'
import { FaqList } from '../components/FaqList'
import { MarketingLayout } from '../components/MarketingLayout'
import { LANDING_AI_SCOPE } from '../content/landingFeatures'
import { MEMBER_TOOLS } from '../content/marketing'
import { MEMBERS_FAQ } from '../content/seo'
import { SIGNING_IN } from '../content/trust'

const TOOLS = [
  {
    id: 'directory',
    title: 'Directory',
    paragraphs: [
      'The directory is the list of admitted members. It opens after you are signed in.',
      'You can hide yourself from the directory. Names are not published on this site.',
    ],
  },
  {
    id: 'intros',
    title: 'Intros',
    paragraphs: [
      'You ask with a short reason. The other member accepts or declines. Admin can make the introduction if you ask.',
      'You may also see up to two suggested introductions a week, from shared sectors, themes or region.',
    ],
  },
  {
    id: 'vouchers',
    title: 'Invites',
    paragraphs: [
      'Each member has a small number of peer invites.',
      'The person you invite still applies and still faces review. An invite is not an admission.',
    ],
  },
  {
    id: 'mandates',
    title: 'Mandates',
    paragraphs: [
      'See capital briefs in outline. Request an intro, and admin unlocks the full brief if approved.',
      'You do not receive a cold approach from this site.',
    ],
  },
  {
    id: 'rooms',
    title: 'Deal rooms',
    paragraphs: [
      'Members open a private room for a deal and invite the people they choose. Admin can see every room.',
      'A room does not hold documents or messages, and it is not listed on this website.',
    ],
  },
  {
    id: 'real-estate',
    title: 'Real estate',
    paragraphs: [
      'Browse opportunities. The counterparty opens after admin approves your intro.',
      'Board and non-executive seats on developer and property company boards. The organisation and the seat open after admin approves your intro.',
      'Request an intro to a partner firm. Admin reviews it before any outreach.',
      'Set your ticket band, places, asset classes and capital role. Admin can use that when matching real estate intros.',
      'Express interest to co-invest on an opportunity. Admin may then open a club deal room. This does not message other members.',
    ],
  },
  {
    id: 'majlis',
    title: 'Majlis',
    paragraphs: [
      'Members can host a majlis; our admin team reviews each one. Join one, join a waitlist, or add one to your calendar.',
    ],
  },
  {
    id: 'ai-tools',
    title: 'AI tools',
    paragraphs: [
      LANDING_AI_SCOPE,
      'AI Due Diligence. AI reads a PDF or PPTX, lists its claims and suggests questions. Public source checks may be limited.',
      'CFO check. An AI first read of your accounts or model: runway, margins and red flags. Not accounting or audit.',
      'Deal readiness memo. An AI first read of a real estate teaser or information memorandum. Indicative only, not advice.',
    ],
  },
  {
    id: 'privacy',
    title: 'Your privacy',
    paragraphs: [
      'Hide yourself from the directory, download your data, and delete uploads and AI results at any time.',
      SIGNING_IN[2],
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
          Founding members use a private Directory, Mandates, Intros, Invites, Deal rooms, Real estate, and Majlis. This is not an open marketplace.
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

        <article className="grid gap-6 border-t border-ink/10 py-12 md:grid-cols-[16rem_1fr] md:gap-16 md:py-16">
          <h2 className="font-display text-[1.7rem] font-semibold tracking-[-0.03em] text-ink">
            Capital, from the member side
          </h2>
          <div className="max-w-2xl space-y-4 text-[1.05rem] leading-relaxed text-ink/70">
            <p>
              Mandates and deal rooms are how a live matter stays inside the membership. Admin reviews mandate intros. Members open a deal room and invite the people they choose.
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
      <CtaBand location="section-for-members" />
    </MarketingLayout>
  )
}

function ToolLead({ id }: { id: string }) {
  const line = MEMBER_TOOLS.find((tool) => tool.id === id)?.home
  if (!line) return null
  return <p className="text-[1.05rem] leading-relaxed text-ink/70">{line}</p>
}

import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import {
  DIGEST_SECTION_ORDER,
  type DigestDiaryItem,
  type DigestNamedPerson,
  type DigestNewsItem,
  type DigestSectionId,
  type DigestSourceLink,
} from '../../../supabase/functions/_shared/weekly_digest_copy.ts'
import { ExampleMark } from '../ExampleMark'
import {
  digestHttpUrl,
  digestIsEmpty,
  digestLinkedinUrl,
  digestReadMinutes,
  visibleDigestSections,
  type WeeklyDigestModel,
} from '../../lib/weeklyDigest'
import { toneClasses } from '../../shell/ViewState'

export const DIGEST_CONTACT_EMAIL = 'contact@boardarabia.com'
export const DIGEST_FOOTER_CREDIT = 'powered by nammco'
export const DIGEST_CTA_LABEL = "Review this week's mandates"
const MANDATES_HREF = '/dashboard/deals/mandates'

export function WeeklyDigestView({
  digest,
  introNote = null,
}: {
  digest: WeeklyDigestModel
  introNote?: string | null
}) {
  const styles = toneClasses('member')
  if (digestIsEmpty(digest)) {
    return (
      <p className={`max-w-xl text-[1rem] ${styles.muted}`} data-digest="empty">
        Nothing new this week.
      </p>
    )
  }

  const shown = new Set(visibleDigestSections(digest))
  const opening = digest.opening?.trim() || 'What changed for members this week.'
  const minutes = digestReadMinutes(digest)
  const masthead = [digest.issueNumber ? `Issue ${digest.issueNumber}` : '', digest.issueDate ?? '', `${minutes} min read`]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="flex flex-col gap-8" data-digest="full">
      <header data-digest-masthead="">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">{masthead}</p>
        <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/80">{opening}</p>
        <p className="mt-5 text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">In this issue</p>
        <ol className="mt-2 flex flex-col gap-1">
          {DIGEST_SECTION_ORDER.filter((section) => shown.has(section.id)).map((section) => (
            <li key={section.id}>
              <a href={`#digest-${section.id}`} className="text-[0.95rem] text-ink/75">
                {section.number} {section.title}
              </a>
            </li>
          ))}
        </ol>
      </header>

      {DIGEST_SECTION_ORDER.map((section) => (
        <Fragment key={section.id}>
          {shown.has(section.id) ? (
            <section id={`digest-${section.id}`} aria-labelledby={`digest-h-${section.id}`} data-section={section.id}>
              <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass">{section.number}</p>
              <h2
                id={`digest-h-${section.id}`}
                className="mt-1 font-display text-[1.45rem] font-semibold tracking-[-0.03em]"
              >
                {section.title}
              </h2>
              <div className="mt-4">{sectionBody(section.id, digest, introNote, styles.panel)}</div>
            </section>
          ) : null}
          {section.id === 'database' ? (
            <p>
              <Link
                to={MANDATES_HREF}
                data-digest-cta="mandates"
                className="inline-flex min-h-11 items-center bg-ink px-4 text-[0.95rem] font-semibold text-pearl"
              >
                {DIGEST_CTA_LABEL}
              </Link>
            </p>
          ) : null}
        </Fragment>
      ))}

      <div data-digest-signoff="">
        <p className="font-display text-[1.15rem] font-semibold">Board Arabia</p>
        <p className="mt-2">
          <a className="text-[0.95rem] text-ink/80 underline" href={`mailto:${DIGEST_CONTACT_EMAIL}`}>
            {DIGEST_CONTACT_EMAIL}
          </a>
        </p>
      </div>
      <footer data-digest-footer="">
        <p className="text-[0.75rem] text-ink/50">{DIGEST_FOOTER_CREDIT}</p>
      </footer>
    </div>
  )
}

function sectionBody(
  id: DigestSectionId,
  digest: WeeklyDigestModel,
  introNote: string | null,
  panel: string,
) {
  if (id === 'boardroom') return <NewsList items={digest.boardroom ?? []} panel={panel} />
  if (id === 'deals') return <NewsList items={digest.deals ?? []} panel={panel} />
  if (id === 'platform') return <PlatformBlock digest={digest} introNote={introNote} panel={panel} />
  if (id === 'database') return <DatabaseBlock digest={digest} panel={panel} />
  if (id === 'majlis') return <MajlisBlock digest={digest} panel={panel} />
  return <PartnerBlock digest={digest} panel={panel} />
}

function NewsList({ items, panel }: { items: DigestNewsItem[]; panel: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={`${item.headline}-${index}`} className={`${panel} px-4 py-3`}>
          <p className="font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{item.headline}</p>
          {item.sentences.map((sentence) => (
            <p key={sentence} className="mt-2 text-[0.95rem] leading-relaxed text-ink/75">
              {sentence}
            </p>
          ))}
          {item.boardLens ? (
            <p className="mt-3 text-[0.95rem] text-ink/80" data-board-lens="">
              Board lens: {item.boardLens}
            </p>
          ) : null}
          {item.people.length > 0 ? (
            <p className="mt-3 text-[0.95rem] text-ink/75">
              {item.people.map((person, personIndex) => (
                <Fragment key={`${person.name}-${personIndex}`}>
                  {personIndex > 0 ? ', ' : null}
                  <PersonName person={person} />
                </Fragment>
              ))}
            </p>
          ) : null}
          <SourceList links={item.sources} />
        </li>
      ))}
    </ul>
  )
}

function PersonName({ person }: { person: DigestNamedPerson }) {
  const href = person.linkedinUrl ? digestLinkedinUrl(person.linkedinUrl) : ''
  if (!href) return <span>{person.name}</span>
  return (
    <a href={href} className="underline" rel="noreferrer">
      {person.name}
    </a>
  )
}

function SourceList({ links }: { links: DigestSourceLink[] }) {
  const safe = links.flatMap((link) => {
    const href = digestHttpUrl(link.url)
    return href ? [{ ...link, url: href }] : []
  })
  if (safe.length === 0) return null
  return (
    <ul className="mt-3 flex flex-col gap-1">
      {safe.map((link) => (
        <li key={link.url}>
          <a href={link.url} className="text-[0.85rem] break-all text-brass underline" rel="noreferrer">
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

function PlatformBlock({
  digest,
  introNote,
  panel,
}: {
  digest: WeeklyDigestModel
  introNote: string | null
  panel: string
}) {
  const bullets = digest.platformBullets ?? []
  return (
    <div className="flex flex-col gap-4">
      {bullets.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {bullets.map((bullet) => (
            <li key={bullet} className="text-[0.95rem] text-ink/80">
              {bullet}
            </li>
          ))}
        </ul>
      ) : null}
      {digest.featureTip ? (
        <p className={`${panel} px-4 py-3 text-[0.95rem] text-ink/80`}>
          <span className="font-semibold">Tip. </span>
          {digest.featureTip}
        </p>
      ) : null}
      {(digest.notes ?? []).length > 0 ? (
        <ul className="flex flex-col gap-3">
          {(digest.notes ?? []).map((note) => (
            <li key={note.text} className={`${panel} px-4 py-3 text-[0.95rem] text-ink/80`}>
              {note.text}
            </li>
          ))}
        </ul>
      ) : null}
      {digest.introductions.length > 0 ? (
        <div>
          {introNote ? <p className="text-[0.95rem] text-ink/60">{introNote}</p> : null}
          <ul className="mt-3 flex flex-col gap-3">
            {digest.introductions.map((intro) => (
              <li key={`${intro.fullName}-${intro.reason}`} className={`${panel} px-4 py-3`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{intro.fullName}</p>
                  {intro.example ? <ExampleMark /> : null}
                </div>
                {intro.headline ? <p className="mt-1 text-[0.95rem] text-ink/70">{intro.headline}</p> : null}
                {intro.company ? <p className="mt-1 text-[0.85rem] text-ink/50">{intro.company}</p> : null}
                {intro.reason ? <p className="mt-2 text-[0.95rem] text-ink/75">{intro.reason}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function DatabaseBlock({ digest, panel }: { digest: WeeklyDigestModel; panel: string }) {
  const members = [
    ...digest.newMembers.map((member) => ({ ...member, mark: member.key ? 'Key' : 'New' })),
    ...(digest.keyMembers ?? []).map((member) => ({ ...member, mark: 'Key' })),
  ]
  return (
    <div className="flex flex-col gap-4">
      {digest.newMandates.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {digest.newMandates.map((mandate) => (
            <li key={`${mandate.sector}-${mandate.oneLiner}`} className={`${panel} px-4 py-3`}>
              <p className="font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{mandate.dealType}</p>
              <p className="mt-2 text-[0.85rem] text-ink/60">
                {[mandate.sector, mandate.geography, mandate.stage].filter(Boolean).join(', ')}
              </p>
              <p className="mt-2 text-[0.95rem] text-ink/75">{mandate.oneLiner}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {members.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <li key={`${member.mark}-${member.fullName}-${member.company}`} className={`${panel} px-4 py-3`}>
              <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">{member.mark}</p>
              <p className="mt-1 font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{member.fullName}</p>
              {member.headline ? <p className="mt-1 text-[0.95rem] text-ink/70">{member.headline}</p> : null}
              {member.company ? <p className="mt-1 text-[0.85rem] text-ink/50">{member.company}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function MajlisBlock({ digest, panel }: { digest: WeeklyDigestModel; panel: string }) {
  return (
    <div className="flex flex-col gap-4">
      {digest.upcomingEvents.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {digest.upcomingEvents.map((event) => (
            <li key={`${event.title}-${event.when}`} className={`${panel} px-4 py-3`}>
              <p className="font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{event.title}</p>
              <p className="mt-1 text-[0.95rem] text-ink/70">
                {event.when ? `${event.when}. ` : ''}
                {event.region}
              </p>
              <p className="mt-1 text-[0.85rem] text-ink/50">{event.hostName}</p>
              {event.venueAddress ? <p className="mt-1 text-[0.85rem] text-ink/50">{event.venueAddress}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {(digest.diary ?? []).length > 0 ? (
        <ul className="flex flex-col gap-3">
          {(digest.diary ?? []).map((item) => (
            <DiaryRow key={`${item.when}-${item.title}`} item={item} panel={panel} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function DiaryRow({ item, panel }: { item: DigestDiaryItem; panel: string }) {
  return (
    <li className={`${panel} px-4 py-3`}>
      <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">{item.when}</p>
      <p className="mt-1 font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{item.title}</p>
      <SourceList links={item.sources} />
    </li>
  )
}

function PartnerBlock({ digest, panel }: { digest: WeeklyDigestModel; panel: string }) {
  const insight = digest.partnerInsight
  if (!insight) return null
  return (
    <div className={`${panel} px-4 py-3`} data-partner-content="">
      <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">{insight.label}</p>
      {insight.sentences.map((sentence) => (
        <p key={sentence} className="mt-2 text-[0.95rem] leading-relaxed text-ink/75">
          {sentence}
        </p>
      ))}
      <SourceList links={[insight.source]} />
    </div>
  )
}

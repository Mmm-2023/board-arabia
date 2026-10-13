import { Link } from 'react-router-dom'
import { ExampleMark } from '../ExampleMark'
import { digestIsEmpty, type WeeklyDigestModel } from '../../lib/weeklyDigest'
import { toneClasses } from '../../shell/ViewState'

const linkClass =
  'mt-3 inline-flex min-h-11 min-w-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase'

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

  return (
    <div className="flex flex-col gap-8" data-digest="full">
      {digest.newMembers.length > 0 ? (
        <section aria-label="New members">
          <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">New members</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {digest.newMembers.map((member) => (
              <li key={`${member.fullName}-${member.company}`} className={`${styles.panel} px-4 py-3`}>
                <p className="font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{member.fullName}</p>
                {member.headline ? <p className="mt-1 text-[0.95rem] text-ink/70">{member.headline}</p> : null}
                {member.company ? <p className="mt-1 text-[0.85rem] text-ink/50">{member.company}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.newMandates.length > 0 ? (
        <section aria-label="New mandates">
          <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">New mandates</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {digest.newMandates.map((mandate) => (
              <li key={`${mandate.sector}-${mandate.oneLiner}`} className={`${styles.panel} px-4 py-3`}>
                <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">{mandate.sector}</p>
                <p className="mt-2 font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{mandate.dealType}</p>
                <p className="mt-1 text-[0.92rem] text-ink/65">
                  {mandate.ticketBand}
                  <span aria-hidden="true"> · </span>
                  {mandate.geography}
                </p>
                <p className="mt-2 text-[0.95rem] text-ink/75">{mandate.oneLiner}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.upcomingEvents.length > 0 ? (
        <section aria-label="Upcoming Majlis">
          <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">Upcoming Majlis</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {digest.upcomingEvents.map((event) => (
              <li key={`${event.title}-${event.when}`} className={`${styles.panel} px-4 py-3`}>
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
        </section>
      ) : null}

      {(digest.notes ?? []).length > 0 ? (
        <section aria-label="Notes">
          <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">Notes</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {(digest.notes ?? []).map((note) => (
              <li key={note.text} className={`${styles.panel} px-4 py-3`}>
                <p className="text-[0.95rem] text-ink/80">{note.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.introductions.length > 0 ? (
        <section aria-label="Introductions">
          <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">Introductions</h2>
          {introNote ? <p className={`mt-2 text-[0.95rem] ${styles.muted}`}>{introNote}</p> : null}
          <ul className="mt-3 flex flex-col gap-3">
            {digest.introductions.map((intro) => (
              <li key={`${intro.fullName}-${intro.reason}`} className={`${styles.panel} px-4 py-3`}>
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
          <Link to="/dashboard/people/intros" className={linkClass}>
            Open introductions
          </Link>
        </section>
      ) : null}
    </div>
  )
}

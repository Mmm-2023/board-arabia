import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatMajlisWhen } from '../../../supabase/functions/_shared/majlis.ts'
import {
  introStatusLine,
  NO_PACKAGE,
  slotLine,
  sponsorPackageFace,
  type SponsorDesk,
} from '../../lib/sponsorDesk'

export function SponsorshipView({ desk, portrait = null }: { desk: SponsorDesk; portrait?: ReactNode }) {
  const face = sponsorPackageFace(desk.package)
  return (
    <div className="max-w-3xl" data-sponsorship="">
      <div className="flex items-start gap-4">
        {portrait}
        <div className="min-w-0">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Sponsorship</p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Sponsorship</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
        What this seat includes, and what has been used.
      </p>
        </div>
      </div>

      <section className="mt-8 border border-[var(--ba-line)] bg-white px-5 py-5">
        <h2 className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Package</h2>
        {face.kind === 'set' ? (
          <>
            <p className="mt-3 font-display text-[1.5rem] font-semibold tracking-[-0.03em]">{face.name}</p>
            <p className="mt-3 text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Price</p>
            <p className="mt-1 text-[1rem] text-ink/80">{face.price}</p>
          </>
        ) : (
          <>
            <p className="mt-3 font-display text-[1.5rem] font-semibold tracking-[-0.03em]">{face.heading}</p>
            {desk.package ? null : (
              <p className="mt-3 text-[1rem] text-ink/70">{NO_PACKAGE} Admin attaches one from Settings.</p>
            )}
          </>
        )}
        <p className="mt-5 text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Seat category</p>
        <p className="mt-1 text-[1rem] text-ink/80">{desk.category?.name ?? 'No category yet.'}</p>
      </section>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        <Metric
          label="Majlis slots"
          value={slotLine(desk.majlis.used, desk.majlis.entitled)}
          note="Gatherings that list you as Presented by."
        />
        <Metric label="Approved intros" value={introStatusLine(desk.intros.approved, desk.intros.pending, desk.intros.declined)} />
        <Metric
          label="Intro credits"
          value={desk.credits ? slotLine(desk.credits.intro_used, desk.credits.intro_entitled) : NO_PACKAGE}
          note="An approved intro uses one credit."
        />
        <Metric
          label="Room credits"
          value={desk.credits ? slotLine(desk.credits.room_used, desk.credits.room_entitled) : NO_PACKAGE}
          note="Rooms you opened."
        />
      </ul>

      <section className="mt-8">
        <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">Presented by you</h2>
        {desk.majlis.events.length === 0 ? (
          <p className="mt-3 text-[1rem] text-ink/65">No majlis lists you as Presented by yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {desk.majlis.events.map((event) => (
              <li key={event.id} className="border border-[var(--ba-line)] bg-white px-4 py-4">
                <h3 className="font-display text-[1.15rem] font-semibold">{event.title}</h3>
                {event.presented_by ? (
                  <p className="mt-1 text-[0.88rem] text-[var(--ba-muted)]">Presented by {event.presented_by}</p>
                ) : null}
                <p className="mt-2 text-[0.95rem] text-ink/75">
                  {event.region}. {formatMajlisWhen(event.starts_at, event.ends_at)}
                </p>
                {event.status === 'hidden' ? (
                  <p className="mt-2 text-[0.92rem] text-ink/60">Not on the member list.</p>
                ) : (
                  <Link
                    to={`/dashboard/majlis#majlis-${event.id}`}
                    className="mt-3 inline-flex min-h-11 items-center font-semibold text-[var(--ba-indigo)] underline"
                  >
                    Open on Majlis
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li className="border border-[var(--ba-line)] bg-white px-4 py-4">
      <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">{label}</p>
      <p className="mt-2 text-[1.05rem] leading-snug text-ink">{value}</p>
      {note ? <p className="mt-2 text-[0.88rem] text-ink/55">{note}</p> : null}
    </li>
  )
}

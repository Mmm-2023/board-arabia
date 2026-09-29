import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExampleMark } from '../../components/ExampleMark'
import { formatActivityWhen, type HomeModel } from '../../lib/homeSnapshot'
import { ErrorBanner, HomeSkeleton, toneClasses } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'

const styles = toneClasses('member')

export function HomeSnapshotView({
  model,
  onRetry,
  sponsorBadge = null,
  seatCaption,
  seatValue,
}: {
  model: HomeModel
  onRetry?: () => void
  sponsorBadge?: ReactNode
  seatCaption?: string
  seatValue?: string
}) {
  const pulseVisible = model.pulse.length > 0 || model.majlis != null
  const teaserVisible =
    model.teasers.directory.length > 0 ||
    model.teasers.mandates.length > 0 ||
    model.teasers.rooms.length > 0 ||
    model.teasers.majlis.length > 0

  return (
    <div className="max-w-3xl" data-home-snapshot="">
      <section aria-label="Identity" className={`${styles.panel} px-4 py-4 md:px-5`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Photo initials={model.identity.initials} url={model.identity.photoUrl} />
          <div className="min-w-0 flex-1">
            <p className="hidden text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase md:block">
              Home
            </p>
            <h1 className="font-display text-2xl font-bold tracking-[-0.04em] text-balance md:mt-1 md:text-[2.4rem]">
              {model.identity.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {sponsorBadge ?? (
                <span
                  data-membership-badge={model.identity.badge}
                  className="inline-flex min-h-7 items-center border border-[var(--ba-copper)] bg-[var(--ba-indigo-deep)] px-2 text-[0.68rem] font-semibold tracking-[0.12em] text-[var(--ba-porcelain)] uppercase"
                >
                  {model.identity.badge}
                </span>
              )}
              <span className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
                {seatCaption ?? (model.identity.founding ? 'Founding seat' : 'Seat')}
              </span>
              <span className="text-[0.95rem] text-ink/70">{seatValue ?? model.identity.seatLabel}</span>
            </div>
            {model.identity.profileNeedsWork ? (
              <Link
                to={model.identity.profileTo}
                className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
              >
                Complete profile
              </Link>
            ) : (
              <p className="mt-3 text-[0.95rem] text-ink/60">Profile complete</p>
            )}
          </div>
        </div>
      </section>

      {model.attention.length > 0 && (
        <section aria-label="Needs attention" className="mt-5 space-y-3 md:mt-8">
          <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
            Needs attention
          </h2>
          <ul className="space-y-3">
            {model.attention.map((item) => (
              <li key={item.title} className={`${styles.panel} px-4 py-3 md:py-4`}>
                <p className="text-[1rem] text-ink">{item.title}</p>
                <p className={`mt-1 text-[0.95rem] ${styles.muted}`}>{item.body}</p>
                <Link
                  to={item.to}
                  className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                >
                  {item.cta}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {model.partialError && onRetry ? (
        <div className="mt-5">
          <ErrorBanner
            tone="member"
            message={MEMBER_VIEWS.home.error}
            onRetry={onRetry}
            retryLabel={MEMBER_VIEWS.home.retry}
          />
        </div>
      ) : null}

      {model.loading ? (
        <div className="mt-5">
          <HomeSkeleton tone="member" cards={3} />
        </div>
      ) : (
        <>
          {pulseVisible ? (
            <section aria-label="Your pulse" className="mt-5 md:mt-8">
              <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
                Your pulse
              </h2>
              {model.pulse.length > 0 ? (
                <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {model.pulse.map((item) => (
                    <li key={item.id} className={`${styles.panel} px-4 py-3 md:py-4`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
                          {item.label}
                        </p>
                        {item.example ? <ExampleMark /> : null}
                      </div>
                      <p className="mt-2 font-display text-[1.7rem] font-semibold tracking-[-0.03em]">
                        {item.value}
                      </p>
                      <p className={`mt-1 text-[0.95rem] ${styles.muted}`}>{item.body}</p>
                      <Link
                        to={item.to}
                        className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                      >
                        Details
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {model.majlis ? (
                <article className={`${styles.panel} mt-3 px-4 py-3 md:py-4`}>
                  <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
                    Next majlis
                  </p>
                  <p className="mt-2 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">
                    {model.majlis.title}
                  </p>
                  <p className={`mt-1 text-[0.95rem] ${styles.muted}`}>{model.majlis.body}</p>
                  <Link
                    to={model.majlis.to}
                    className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                  >
                    Details
                  </Link>
                </article>
              ) : null}
            </section>
          ) : null}

          <section aria-label="Next actions" className="mt-5 md:mt-8">
            <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
              Next actions
            </h2>
            {model.cta ? (
              <Link
                to={model.cta.to}
                data-home-cta={model.cta.id}
                className={`mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.primary}`}
              >
                {model.cta.label}
              </Link>
            ) : (
              <p className={`mt-3 max-w-xl text-[1rem] ${styles.muted}`}>Nothing needs you right now.</p>
            )}
          </section>

          <section aria-label="Platform snapshot" className="mt-8 border-t border-ink/10 pt-8">
            <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
              Platform snapshot
            </h2>
            {model.platform.fill ? (
              <div className="mt-4">
                <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
                  Founding 100
                </p>
                <p className="mt-2 font-display text-[1.8rem] font-semibold tracking-[-0.03em]">
                  {model.platform.fill.label}
                </p>
                <div
                  className="mt-3 h-1.5 bg-[var(--ba-lavender-mist)]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={model.platform.fill.admitted}
                  aria-label="Founding 100 fill"
                >
                  <div
                    className="h-1.5 bg-[var(--ba-indigo)]"
                    style={{ width: `${model.platform.fill.admitted}%` }}
                  />
                </div>
                <p className={`mt-3 text-[0.95rem] ${styles.muted}`}>{model.platform.fill.split}</p>
                <p className={`mt-1 text-[0.95rem] ${styles.muted}`}>
                  {model.platform.fill.personal
                    ? 'Seats admitted.'
                    : 'Platform count. Not your seat allocation.'}
                </p>
                {model.platform.capacityNote ? (
                  <p className={`mt-2 text-[0.95rem] ${styles.muted}`}>{model.platform.capacityNote}</p>
                ) : null}
              </div>
            ) : (
              <p className={`mt-3 text-[0.95rem] ${styles.muted}`}>
                Founding fill is not available yet.
              </p>
            )}

            {model.platform.regionsKnown && model.platform.regions.length > 0 ? (
              <div className="mt-6">
                <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">
                  Majlis regions
                </h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {model.platform.regions.map((region) => (
                    <li key={region.region}>
                      <Link
                        to={region.to}
                        className="inline-flex min-h-11 items-center text-[0.98rem] text-ink/80"
                      >
                        {region.region}
                        <span className="ms-2 text-ink/50">
                          {region.count} upcoming
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {model.platform.regionsKnown && model.platform.regions.length === 0 ? (
              <p className={`mt-4 text-[0.95rem] ${styles.muted}`}>No upcoming gathering is published.</p>
            ) : null}

            {model.platform.fill && model.platform.money.length === 0 ? (
              <p className={`mt-4 text-[0.95rem] ${styles.muted}`}>Platform totals are not published yet.</p>
            ) : null}

            {model.platform.money.length > 0 ? (
              <div className="mt-6">
                <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">
                  Platform totals
                </h3>
                <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {model.platform.money.map((line) => (
                    <li key={line.label} className={`${styles.panel} px-4 py-3`}>
                      <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
                        {line.label}
                      </p>
                      <p className="mt-2 font-display text-[1.45rem] font-semibold tracking-[-0.03em]">
                        {line.value}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className={`mt-3 text-[0.92rem] ${styles.muted}`}>
                  Figures are platform sums from members who opted in. Individual amounts are never shown.
                </p>
              </div>
            ) : null}

            {model.platform.partners.length > 0 ? (
              <div className="mt-6">
                <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">
                  Trusted Partners
                </h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {model.platform.partners.map((partner) => (
                    <li key={partner.id} className={`${styles.panel} flex items-center gap-3 px-4 py-3`}>
                      <span
                        aria-hidden="true"
                        className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--ba-copper)] bg-[var(--ba-indigo-deep)] font-display text-[0.85rem] text-[var(--ba-porcelain)]"
                      >
                        {partner.monogram}
                      </span>
                      <span className="min-w-0 flex-1 text-[1rem] text-ink">{partner.name}</span>
                      {partner.example ? <ExampleMark /> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {model.updatedLabel ? (
              <p className="mt-4 text-[0.85rem] text-ink/45">{model.updatedLabel}</p>
            ) : null}
          </section>

          <section aria-label="From the room" className="mt-8 border-t border-ink/10 pt-8">
            <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
              From the room
            </h2>
            {teaserVisible ? (
              <div className="mt-4 flex flex-col gap-6">
                {model.teasers.directory.length > 0 ? (
                  <TeaserGroup title="Directory" to="/dashboard/directory">
                    {model.teasers.directory.map((card) => (
                      <article key={card.id} className={`${styles.panel} px-4 py-3`}>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-[1.15rem] font-semibold tracking-[-0.03em]">
                            {card.name}
                          </h3>
                          {card.example ? <ExampleMark /> : null}
                        </div>
                        {card.headline ? <p className="mt-1 text-[0.95rem] text-ink/70">{card.headline}</p> : null}
                        <p className="mt-1 text-[0.85rem] text-ink/50">{card.seat}</p>
                      </article>
                    ))}
                  </TeaserGroup>
                ) : null}
                {model.teasers.mandates.length > 0 ? (
                  <TeaserGroup title="Mandates" to="/dashboard/mandates">
                    {model.teasers.mandates.map((card) => (
                      <article key={card.id} className={`${styles.panel} px-4 py-3`}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
                            {card.sector}
                          </p>
                          {card.example ? <ExampleMark /> : null}
                        </div>
                        <h3 className="mt-2 font-display text-[1.15rem] font-semibold tracking-[-0.03em]">
                          {card.dealType}
                        </h3>
                        <p className="mt-1 text-[0.92rem] text-ink/65">
                          {card.ticketBand}
                          <span aria-hidden="true"> · </span>
                          {card.geography}
                        </p>
                        <p className="mt-2 text-[0.95rem] text-ink/75">{card.oneLiner}</p>
                      </article>
                    ))}
                  </TeaserGroup>
                ) : null}
                {model.teasers.rooms.length > 0 ? (
                  <TeaserGroup title="Rooms" to="/dashboard/rooms">
                    {model.teasers.rooms.map((room) => (
                      <article key={room.id} className={`${styles.panel} px-4 py-3`}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
                            {room.sector}
                          </p>
                          {room.example ? <ExampleMark /> : null}
                        </div>
                        <h3 className="mt-2 font-display text-[1.15rem] font-semibold tracking-[-0.03em]">
                          {room.name}
                        </h3>
                        <p className="mt-1 text-[0.85rem] text-ink/50">{room.stage}</p>
                      </article>
                    ))}
                  </TeaserGroup>
                ) : null}
                {model.teasers.majlis.length > 0 ? (
                  <TeaserGroup title="Majlis" to="/dashboard/majlis">
                    {model.teasers.majlis.map((event) => (
                      <article key={event.id} className={`${styles.panel} px-4 py-3`}>
                        <h3 className="font-display text-[1.15rem] font-semibold tracking-[-0.03em]">
                          {event.title}
                        </h3>
                        <p className="mt-1 text-[0.95rem] text-ink/70">
                          {event.region}. {event.when}
                        </p>
                      </article>
                    ))}
                  </TeaserGroup>
                ) : null}
              </div>
            ) : (
              <p className={`mt-3 max-w-xl text-[1rem] ${styles.muted}`}>
                Directory, mandates, rooms, and majlis have nothing to preview yet.
              </p>
            )}
          </section>

          <section aria-label="Activity" className="mt-8 border-t border-ink/10 pt-8">
            <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
              Activity
            </h2>
            {model.activityStatus === 'loading' ? (
              <p className={`mt-3 text-[0.95rem] ${styles.muted}`}>Loading activity…</p>
            ) : null}
            {model.activityStatus === 'error' ? (
              <p className={`mt-3 text-[0.95rem] ${styles.muted}`}>Could not load activity.</p>
            ) : null}
            {model.activityStatus === 'unavailable' ? (
              <p className={`mt-3 text-[0.95rem] ${styles.muted}`}>Activity is not available yet.</p>
            ) : null}
            {model.activityStatus === 'empty' || (model.activityStatus === 'ready' && model.activity.length === 0) ? (
              <p className={`mt-3 max-w-xl text-[1rem] ${styles.muted}`}>
                No activity yet. Your intro requests and majlis registrations show here.
              </p>
            ) : null}
            {model.activityStatus === 'ready' && model.activity.length > 0 ? (
              <ol className="mt-3 space-y-3">
                {model.activity.map((event) => (
                  <li key={event.id} className={`${styles.panel} px-4 py-3`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[1rem] text-ink">{event.label}</p>
                      {event.example ? <ExampleMark /> : null}
                    </div>
                    <p className={`mt-1 text-[0.95rem] ${styles.muted}`}>{event.detail}</p>
                    <p className="mt-1 text-[0.85rem] text-ink/45">{formatActivityWhen(event.happenedAt)}</p>
                    <Link
                      to={event.href}
                      className="mt-2 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                    >
                      Details
                    </Link>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}

function Photo({ initials, url }: { initials: string; url: string | null }) {
  if (url) {
    return <img src={url} alt="Profile photo" className="h-16 w-16 shrink-0 rounded-full object-cover" />
  }
  return (
    <div
      aria-hidden="true"
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--ba-lavender-mist)] font-display text-[1rem] font-semibold text-[var(--ba-indigo)]"
    >
      {initials}
    </div>
  )
}

function TeaserGroup({
  title,
  to,
  children,
}: {
  title: string
  to: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">{title}</h3>
        <Link
          to={to}
          className="inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
        >
          Open
        </Link>
      </div>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </div>
  )
}

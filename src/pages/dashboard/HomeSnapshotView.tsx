import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { ExampleMark } from '../../components/ExampleMark'
import { PartnerLogo } from '../../components/TrustedPartners'
import { formatActivityWhen, type HomeModel } from '../../lib/homeSnapshot'
import {
  buildNeedsYou,
  homePrimaryAction,
  liveHomePartners,
  NEEDS_YOU_SUBTITLE,
  NEEDS_YOU_TITLE,
  SEE_LESS_LABEL,
  SEE_MORE_ACCESSIBLE,
  SEE_MORE_LABEL,
  THIS_WEEK_SEE_ALL,
  type NeedsYouItem,
} from '../../lib/homeNeeds'
import { FORMING_TOTALS } from '../../lib/platformFloors'
import { ErrorBanner, HomeSkeleton, toneClasses } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { adviserGalleryRows, partnerGalleryRows } from '../../lib/trustedPartners'

const styles = toneClasses('member')

export type DigestHomeNotice = {
  title: string
  href: string
}

export function HomeSnapshotView({
  model,
  onRetry,
  sponsorBadge = null,
  seatCaption,
  seatValue,
  figuresAsOf = null,
  userId = 'member',
  shareSlot = null,
  digestNotice = null,
  needsYou = null,
  weekLines = [],
  dailyBriefSlot = null,
  staff = false,
}: {
  model: HomeModel
  onRetry?: () => void
  sponsorBadge?: ReactNode
  seatCaption?: string
  seatValue?: string
  figuresAsOf?: string | null
  userId?: string
  shareSlot?: ReactNode
  digestNotice?: DigestHomeNotice | null
  needsYou?: NeedsYouItem[] | null
  weekLines?: string[]
  dailyBriefSlot?: ReactNode
  staff?: boolean
}) {
  const homePartners = model.platform.partners.map((partner) => ({ ...partner, is_demo: partner.example }))
  const partnerRows = liveHomePartners(partnerGalleryRows(homePartners))
  const adviserRows = adviserGalleryRows(homePartners)
  const livePulse = model.pulse.filter((item) => !item.example)
  const pulseVisible = livePulse.length > 0 || model.majlis != null
  const nextAction = model.cta && !model.cta.to.includes('#password') ? model.cta : null
  const primary = homePrimaryAction(nextAction)
  const [exampleSeen, setExampleSeen] = useState(() => readExampleSeen(userId))
  const [moreOpen, setMoreOpen] = useState(false)
  const hasExample =
    model.pulse.some((item) => item.example) ||
    model.teasers.directory.some((card) => card.example) ||
    model.teasers.mandates.some((card) => card.example) ||
    model.teasers.rooms.some((card) => card.example)
  const membershipLabel = sponsorBadge ? null : model.identity.founding ? 'Founding' : seatCaption || model.identity.badge
  const teaserVisible =
    model.teasers.directory.length > 0 ||
    model.teasers.mandates.length > 0 ||
    model.teasers.rooms.length > 0 ||
    model.teasers.majlis.length > 0
  const needsItems = (needsYou ?? buildNeedsYou({
    twoStepOff: false,
    profileGaps: 0,
    invites: [],
    suggestionCount: 0,
    attention: model.attention,
  })).filter((item) => !(staff && item.id === 'profile'))

  return (
    <div className="max-w-3xl" data-home-snapshot="">
      <section aria-label="Identity" className="flex items-center gap-3 py-1">
        <Avatar src={model.identity.photoUrl} avatarStyle={model.identity.avatarStyle} size={40} alt="Profile photo" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[1.35rem] font-bold tracking-[-0.03em] md:text-[1.7rem]">
            {model.identity.name}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink/70">
            {sponsorBadge}
            {membershipLabel ? (
              <span data-membership-badge={model.identity.badge}>{membershipLabel}</span>
            ) : null}
            <span className="ms-2">{seatValue ?? model.identity.seatLabel}</span>
          </p>
        </div>
      </section>

      {needsItems.length > 0 ? (
        <section aria-label="Needs you" className="mt-4" data-home-needs="">
          <div className={`${styles.panel} px-4 py-3`}>
            <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.03em]">{NEEDS_YOU_TITLE}</h2>
            <p className={`mt-1 text-[0.95rem] leading-snug ${styles.muted}`}>{NEEDS_YOU_SUBTITLE}</p>
            <ul className="mt-1">
              {needsItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 border-t border-ink/10"
                  data-needs-item={item.id}
                >
                  <p className="text-[1rem] text-ink">{item.label}</p>
                  <Link
                    to={item.to}
                    data-needs-action={item.id}
                    className="inline-flex min-h-11 shrink-0 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)] underline"
                  >
                    {item.action}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section aria-label="This week" className="mt-4" data-home-digest="">
        <div className={`${styles.panel} px-4 py-3`}>
          <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">This week</h2>
          {weekLines.length > 0 ? (
            <ul className="mt-3 space-y-2" data-home-week="">
              {weekLines.map((line, index) => (
                <li key={`${index}:${line}`} className="text-[1rem] text-ink">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className={`mt-2 text-[0.95rem] ${styles.muted}`}>
              New members, new mandates, upcoming Majlis, and your introductions.
            </p>
          )}
          {digestNotice ? (
            <article className="mt-3 border-t border-ink/10 pt-3" data-digest-notice="">
              <p className="text-[1rem] text-ink">{digestNotice.title}</p>
              <Link
                to={digestNotice.href}
                data-tap="digest-notice"
                className="mt-2 inline-flex min-h-11 min-w-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)] underline"
              >
                Open
              </Link>
            </article>
          ) : null}
          <Link
            to="/dashboard/digest"
            data-tap="digest"
            className="mt-3 inline-flex min-h-11 min-w-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)] underline"
          >
            {THIS_WEEK_SEE_ALL}
          </Link>
        </div>
      </section>

      {hasExample && !exampleSeen ? (
        <div className="mt-4 border border-dashed border-[var(--ba-indigo)] bg-white px-4 py-3" role="status">
          <p className="text-[0.8125rem] leading-relaxed text-ink/80">
            Cards marked Example are samples. They step aside when real items arrive.
          </p>
          <button
            type="button"
            data-tap="got-it"
            className="mt-2 inline-flex min-h-11 min-w-11 items-center text-[0.8125rem] font-semibold text-[var(--ba-indigo)]"
            onClick={() => {
              writeExampleSeen(userId)
              setExampleSeen(true)
            }}
          >
            Got it
          </button>
        </div>
      ) : null}

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
          <section aria-label="Next action" className="mt-4" data-home-next="">
            <h2 className="text-[0.8125rem] font-semibold text-ink/70">Next action</h2>
            <Link
              to={primary.to}
              data-home-cta={primary.id}
              className={`mt-3 inline-flex min-h-11 items-center px-4 text-[0.8125rem] font-semibold ${styles.primary}`}
            >
              {primary.label}
            </Link>
          </section>
          {shareSlot ? <div className="mt-4">{shareSlot}</div> : null}

          <section aria-label="Activity" className="mt-8 border-t border-ink/10 pt-8" data-home-activity="">
            <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">Activity</h2>
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
                      data-tap="details"
                      className="mt-2 inline-flex min-h-11 min-w-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                    >
                      Details
                    </Link>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>

          <section className="mt-8 border-t border-ink/10 pt-6" data-home-more="">
            <details
              onToggle={(event) => {
                setMoreOpen(event.currentTarget.open)
              }}
            >
              <summary
                aria-label={SEE_MORE_ACCESSIBLE}
                className="inline-flex min-h-11 cursor-pointer list-none items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)] [&::-webkit-details-marker]:hidden"
              >
                {moreOpen ? SEE_LESS_LABEL : SEE_MORE_LABEL}
              </summary>
              <div>
                {pulseVisible ? (
                  <section aria-label="Your pulse" className="mt-5 md:mt-8">
                    <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">Your pulse</h2>
                    {livePulse.length > 0 ? (
                      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {livePulse.map((item) => (
                          <li key={item.id} className={`${styles.panel} px-4 py-3 md:py-4`}>
                            <p className="text-[0.8125rem] font-semibold text-ink/70">{item.label}</p>
                            <p className="mt-2 font-display text-[1.7rem] font-semibold tracking-[-0.03em]">{item.value}</p>
                            <p className={`mt-1 text-[0.95rem] ${styles.muted}`}>{item.body}</p>
                            <Link
                              to={item.to}
                              data-tap="details"
                              className="mt-3 inline-flex min-h-11 min-w-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
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
                        <p className="mt-2 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">{model.majlis.title}</p>
                        <p className={`mt-1 text-[0.95rem] ${styles.muted}`}>{model.majlis.body}</p>
                        <Link
                          to={model.majlis.to}
                          data-tap="details"
                          className="mt-3 inline-flex min-h-11 min-w-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                        >
                          Details
                        </Link>
                      </article>
                    ) : null}
                  </section>
                ) : null}

                <section aria-label="Platform snapshot" className="mt-8 border-t border-ink/10 pt-8">
                  <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">Platform snapshot</h2>
                  {model.platform.fill ? (
                    <div className="mt-4">
                      <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>Founding 100</p>
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
                        <div className="h-1.5 bg-[var(--ba-indigo)]" style={{ width: `${model.platform.fill.admitted}%` }} />
                      </div>
                      <p className={`mt-3 text-[0.95rem] ${styles.muted}`}>{model.platform.fill.split}</p>
                      <p className={`mt-1 text-[0.95rem] ${styles.muted}`}>
                        {model.platform.fill.personal ? 'Seats admitted.' : 'Platform count. Not your seat allocation.'}
                      </p>
                      {model.platform.capacityNote ? (
                        <p className={`mt-2 text-[0.95rem] ${styles.muted}`}>{model.platform.capacityNote}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className={`mt-3 text-[0.95rem] ${styles.muted}`}>Founding fill is not available yet.</p>
                  )}

                  {model.platform.regionsKnown && model.platform.regions.length > 0 ? (
                    <div className="mt-6">
                      <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">Majlis regions</h3>
                      <ul className="mt-3 flex flex-col gap-2">
                        {model.platform.regions.map((region) => (
                          <li key={region.region}>
                            <Link to={region.to} className="inline-flex min-h-11 items-center text-[0.98rem] text-ink/80">
                              {region.region}
                              <span className="ms-2 text-ink/50">{region.count} upcoming</span>
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
                    <p className={`mt-4 text-[0.95rem] ${styles.muted}`}>{FORMING_TOTALS}</p>
                  ) : null}

                  {model.platform.money.length > 0 ? (
                    <div className="mt-6">
                      <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">Platform totals</h3>
                      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {model.platform.money.map((line) => (
                          <li key={line.label} className={`${styles.panel} px-4 py-3`}>
                            <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
                              {line.label}
                            </p>
                            <p className="mt-2 font-display text-[1.45rem] font-semibold tracking-[-0.03em]">{line.value}</p>
                          </li>
                        ))}
                      </ul>
                      <p className={`mt-3 text-[0.92rem] ${styles.muted}`}>
                        Figures are platform sums from members who opted in. Individual amounts are never shown.
                      </p>
                    </div>
                  ) : null}

                  {partnerRows.length > 0 ? (
                    <div className="mt-6" data-gallery="partners">
                      <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">Partners</h3>
                      <ul className="mt-3 flex flex-col gap-3">
                        {partnerRows.map((partner) => (
                          <li
                            key={partner.id}
                            className={`${styles.panel} flex items-center gap-3 px-4 py-3`}
                            data-partner-name={partner.name}
                          >
                            <PartnerLogo name={partner.name} monogram={partner.monogram} logoPath={partner.logo_path} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[1rem] text-ink">{partner.name}</span>
                              {partner.blurb ? (
                                <span className="mt-1 block text-[0.92rem] text-ink/70">{partner.blurb}</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        to="/dashboard/people/partners"
                        className="mt-3 inline-flex min-h-11 items-center font-semibold text-[var(--ba-indigo)] underline"
                      >
                        Partner showcase
                      </Link>
                    </div>
                  ) : null}
                  {adviserRows.length > 0 ? (
                    <div className="mt-6" data-gallery="advisers">
                      <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">
                        Trusted advisers
                      </h3>
                      <ul className="mt-3 flex flex-col gap-3">
                        {adviserRows.map((partner) => (
                          <li
                            key={partner.id}
                            className={`${styles.panel} flex items-center gap-3 px-4 py-3`}
                            data-adviser-name={partner.name}
                          >
                            <PartnerLogo name={partner.name} monogram={partner.monogram} logoPath={partner.logo_path} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[1rem] text-ink">{partner.name}</span>
                              {partner.blurb ? (
                                <span className="mt-1 block text-[0.92rem] text-ink/70">{partner.blurb}</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {figuresAsOf ? <p className="mt-4 text-[0.8125rem] text-ink/60">{figuresAsOf}</p> : null}
                </section>

                <section aria-label="From the room" className="mt-8 border-t border-ink/10 pt-8">
                  <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">From the room</h2>
                  {teaserVisible ? (
                    <div className="mt-4 flex flex-col gap-6">
                      {model.teasers.directory.length > 0 ? (
                        <TeaserGroup title="Directory" to="/dashboard/people/directory">
                          {model.teasers.directory.map((card) => (
                            <article key={card.id} className={`${styles.panel} px-4 py-3`}>
                              <div className="flex items-start justify-between gap-3">
                                <h3 className="font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{card.name}</h3>
                                {card.example ? <ExampleMark /> : null}
                              </div>
                              {card.headline ? <p className="mt-1 text-[0.95rem] text-ink/70">{card.headline}</p> : null}
                              <p className="mt-1 text-[0.85rem] text-ink/50">{card.seat}</p>
                            </article>
                          ))}
                        </TeaserGroup>
                      ) : null}
                      {model.teasers.mandates.length > 0 ? (
                        <TeaserGroup title="Mandates" to="/dashboard/deals/mandates">
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
                        <TeaserGroup title="Deal rooms" to="/dashboard/deals/rooms">
                          {model.teasers.rooms.map((room) => (
                            <article key={room.id} className={`${styles.panel} px-4 py-3`}>
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
                                  {room.sector}
                                </p>
                                {room.example ? <ExampleMark /> : null}
                              </div>
                              <h3 className="mt-2 font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{room.name}</h3>
                              <p className="mt-1 text-[0.85rem] text-ink/50">{room.stage}</p>
                            </article>
                          ))}
                        </TeaserGroup>
                      ) : null}
                      {model.teasers.majlis.length > 0 ? (
                        <TeaserGroup title="Majlis" to="/dashboard/majlis">
                          {model.teasers.majlis.map((event) => (
                            <article key={event.id} className={`${styles.panel} px-4 py-3`}>
                              <h3 className="font-display text-[1.15rem] font-semibold tracking-[-0.03em]">{event.title}</h3>
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
                {dailyBriefSlot ? <div className="mt-8">{dailyBriefSlot}</div> : null}
              </div>
            </details>
          </section>
        </>
      )}
    </div>
  )
}

function exampleKey(userId: string) {
  return `ba-example-seen:${userId}`
}

function readExampleSeen(userId: string) {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(exampleKey(userId)) === '1'
  } catch {
    return false
  }
}

function writeExampleSeen(userId: string) {
  try {
    window.localStorage.setItem(exampleKey(userId), '1')
  } catch {
    // The explainer can show again if storage is blocked.
  }
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
          data-tap="open"
          className="inline-flex min-h-11 min-w-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
        >
          Open
        </Link>
      </div>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </div>
  )
}

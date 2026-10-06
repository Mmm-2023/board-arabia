import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { MajlisCardTitle } from '../../components/MajlisCardTitle'
import { SignedAvatar } from '../../components/SignedAvatar'
import {
  MAJLIS_REGIONS,
  formatMajlisWhen,
  countPublishedByRegion,
  formatRiyadhStamp,
  googleCalendarUrl,
  isMajlisRegion,
  memberMajlisFeed,
  memberMajlisPast,
  parseFocusTags,
  riyadhWallToUtc,
  rsvpTier,
  validateMajlisApplication,
} from '../../../supabase/functions/_shared/majlis.ts'
import { downloadCsv } from '../../lib/csv'
import { dayKey, monthCells, monthLabel, riyadhDay, shiftMonth } from '../../lib/majlisCalendar'
import { groupMajlisRoster, hostRosterCsv } from '../../lib/majlisRoster'
import {
  applyForMajlis,
  downloadMajlisIcs,
  fetchMajlisEvents,
  fetchMajlisRoster,
  fetchOwnMajlisRsvps,
  fetchSponsorMajlis,
  rsvpMajlis,
  type MajlisEventRow,
  type MajlisRsvpAction,
  type MajlisRosterRow,
  type MajlisSponsorEvent,
  type OwnMajlisRsvp,
} from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, FilteredZero } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'

type MajlisPreview = { events: MajlisEventRow[]; roster?: MajlisRosterRow[] }

const fieldClass =
  'mt-1 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem] text-ink'
const primaryBtn =
  'inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ba-primary disabled:opacity-40'
const quietBtn =
  'inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-40'
export function MajlisPage({ preview }: { preview?: MajlisPreview } = {}) {
  const { member, userId } = useMember()
  const sponsor = member.seat === 'sponsor'
  const { pathname } = useLocation()
  const past = pathname.replace(/\/+$/, '').endsWith('/majlis/past')
  const [params, setParams] = useSearchParams()
  const region = isMajlisRegion(params.get('region') || '') ? params.get('region') : ''
  const focus = params.get('focus') || ''
  const highlight = params.get('event') || ''
  const [nowMs] = useState(() => Date.now())
  const [hostOpen, setHostOpen] = useState(false)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [ownByEvent, setOwnByEvent] = useState<Record<string, OwnMajlisRsvp> | null>(null)
  const [events, setEvents] = useState<MajlisEventRow[] | null>(preview?.events ?? null)
  const [sponsorEvents, setSponsorEvents] = useState<MajlisSponsorEvent[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Majlis | Board Arabia')

  useEffect(() => {
    if (preview) return
    let cancelled = false
    if (sponsor) {
      void fetchSponsorMajlis().then((result) => {
        if (cancelled) return
        if ('error' in result) {
          setError(result.error)
          setSponsorEvents([])
          setUnavailable(false)
          return
        }
        setError('')
        setUnavailable(Boolean(result.unavailable))
        setSponsorEvents(result.events)
      })
    } else {
      void fetchMajlisEvents().then((result) => {
        if (cancelled) return
        if ('error' in result) {
          setError(result.error)
          setEvents([])
          return
        }
        setError('')
        setEvents(result.events)
      })
    }
    return () => {
      cancelled = true
    }
  }, [attempt, preview, sponsor])

  useEffect(() => {
    if (preview || sponsor) return
    let cancelled = false
    void fetchOwnMajlisRsvps().then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setOwnByEvent(null)
        return
      }
      const next: Record<string, OwnMajlisRsvp> = {}
      for (const row of result.rows) next[row.event_id] = row
      setOwnByEvent(next)
    })
    return () => {
      cancelled = true
    }
  }, [attempt, preview, sponsor])

  useEffect(() => {
    if (!highlight) return
    document.getElementById(`majlis-${highlight}`)?.scrollIntoView({ block: 'center' })
  }, [highlight, events, sponsorEvents])

  function openHostForm() {
    setHostOpen(true)
    window.setTimeout(() => {
      const title = document.getElementById('majlis-apply-title')
      title?.scrollIntoView({ block: 'start' })
      title?.focus()
    }, 0)
  }

  function setFilter(next: { region?: string | null; focus?: string | null }) {
    const copy = new URLSearchParams(params)
    if ('region' in next) {
      if (next.region) copy.set('region', next.region)
      else copy.delete('region')
    }
    if ('focus' in next) {
      if (next.focus) copy.set('focus', next.focus)
      else copy.delete('focus')
    }
    setParams(copy, { replace: true })
  }

  const published = useMemo(() => {
    const rows: Array<MajlisEventRow | MajlisSponsorEvent> = sponsor
      ? (sponsorEvents ?? [])
      : (events ?? []).filter((event) => event.status === 'published')
    return rows
  }, [events, sponsor, sponsorEvents])

  const feed = useMemo(
    () => (past ? memberMajlisPast(published, nowMs) : memberMajlisFeed(published, nowMs)),
    [past, published, nowMs],
  )

  function shown(event: MajlisEventRow): MajlisEventRow {
    if (!ownByEvent) return event
    const own = ownByEvent[event.id]
    return {
      ...event,
      my_rsvp_status: own?.status ?? null,
      my_waitlist_position: own?.waitlist_position ?? null,
    }
  }

  const tags = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const event of feed) {
      for (const tag of event.focus_tags) {
        const key = tag.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        list.push(tag)
      }
    }
    return list.sort((a, b) => a.localeCompare(b))
  }, [feed])

  const filtered = feed.filter((event) => {
    if (region && event.region !== region) return false
    if (focus && !event.focus_tags.some((tag) => tag.toLowerCase() === focus.toLowerCase())) return false
    return true
  })

  const counts = countPublishedByRegion(
    MAJLIS_REGIONS,
    feed.map((event) => ({ region: event.region })),
  )
  const loading = sponsor ? sponsorEvents === null : events === null
  const mine = sponsor
    ? []
    : (events ?? [])
        .filter((event) => event.host_member_id === userId && event.status !== 'published')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="min-w-0 max-w-5xl" data-majlis-section={past ? 'past' : 'upcoming'}>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Majlis</h1>
      <p className="mt-2 max-w-full break-words text-[0.98rem] leading-relaxed text-[var(--ba-muted)]">
        {sponsor
          ? 'Regional activity for sponsors. Guest names and contact details stay with the host.'
          : past
            ? 'Past gatherings stay on record. Venue addresses and guest lists are not shown.'
            : 'Upcoming gatherings are listed first. Host a majlis when you want to hold one.'}
      </p>

      <section id="majlis-feed" className="mt-8 scroll-mt-24" aria-labelledby="majlis-feed-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="majlis-feed-title" className="font-display text-[1.35rem] font-semibold">
            {past ? 'Past' : 'Upcoming'}
          </h2>
          {!past && (
            <div className="flex gap-2" role="group" aria-label="Upcoming view">
              <button type="button" className={view === 'list' ? primaryBtn : quietBtn} aria-pressed={view === 'list'} onClick={() => setView('list')}>
                List
              </button>
              <button type="button" className={view === 'calendar' ? primaryBtn : quietBtn} aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>
                Calendar
              </button>
            </div>
          )}
          {!loading && !error && feed.length > 0 && (
            <p className="text-[0.92rem] text-[var(--ba-muted)]">{past ? pastLabel(feed.length) : upcomingLabel(feed.length)}</p>
          )}
        </div>
        {loading ? (
          <div className="mt-4">
            <CardSkeleton tone="member" label="Loading majlis" />
          </div>
        ) : error ? (
          <div className="mt-4">
            <ErrorBanner
              tone="member"
              message={MEMBER_VIEWS.majlis.error}
              onRetry={() => {
                setEvents(null)
                setSponsorEvents(null)
                setError('')
                setAttempt((value) => value + 1)
              }}
              retryLabel={MEMBER_VIEWS.majlis.retry}
            />
          </div>
        ) : unavailable ? (
          <p className="mt-4 text-[0.98rem] text-[var(--ba-muted)]">Published gatherings are not available yet.</p>
        ) : feed.length === 0 ? (
          <div className="mt-4">
            <EmptyState tone="member" message={past ? 'No past majlis.' : 'No upcoming majlis.'} />
          </div>
        ) : (
          <>
            <p className="mt-2 max-w-full break-words text-[0.95rem] text-[var(--ba-muted)]">Filter by region or focus.</p>
            <div className="mt-4 flex max-w-full flex-wrap gap-2" role="group" aria-label="Region filters">
              <Chip pressed={!region} onClick={() => setFilter({ region: null })}>
                All regions
              </Chip>
              {MAJLIS_REGIONS.map((name) => (
                <Chip
                  key={name}
                  pressed={region === name}
                  onClick={() => setFilter({ region: region === name ? null : name })}
                >
                  {counts[name] ? `${name} (${counts[name]})` : name}
                </Chip>
              ))}
            </div>
            {tags.length > 0 && (
              <div className="mt-4 flex max-w-full flex-wrap gap-2" role="group" aria-label="Focus filters">
                <Chip pressed={!focus} onClick={() => setFilter({ focus: null })}>
                  All focus
                </Chip>
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    pressed={focus.toLowerCase() === tag.toLowerCase()}
                    onClick={() => setFilter({ focus: focus.toLowerCase() === tag.toLowerCase() ? null : tag })}
                  >
                    {tag}
                  </Chip>
                ))}
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="mt-4">
                <FilteredZero
                  tone="member"
                  message={MEMBER_VIEWS.majlis.filtered}
                  clearLabel={MEMBER_VIEWS.majlis.clear}
                  onClear={() => setFilter({ region: null, focus: null })}
                />
              </div>
            ) : (
              <EventList
                events={filtered}
                past={past}
                calendar={view === 'calendar' && !past}
                sponsor={sponsor}
                userId={userId}
                nowMs={nowMs}
                highlight={highlight}
                roster={preview?.roster}
                seat={member.seat}
                onFocus={(tag) => setFilter({ focus: tag })}
                onRegion={(name) => setFilter({ region: name })}
                onChanged={() => {
                  setEvents(null)
                  setAttempt((value) => value + 1)
                }}
                shown={shown}
              />
            )}
          </>
        )}
      </section>

      {!sponsor && !past && (
        <section id="majlis-host" className="mt-10 scroll-mt-24" aria-labelledby="majlis-host-title">
          <h2 id="majlis-host-title" className="font-display text-[1.35rem] font-semibold">
            Host a majlis
          </h2>
          <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">
            Our admin team reviews the application before it is published.
          </p>
          {!hostOpen && (
            <button
              type="button"
              className={`${primaryBtn} mt-4 w-full justify-center sm:w-auto`}
              aria-expanded={false}
              aria-controls="majlis-apply"
              onClick={openHostForm}
            >
              Host a majlis
            </button>
          )}
          {hostOpen && (
            <ApplyForm
              onCreated={() => {
                setEvents(null)
                setAttempt((value) => value + 1)
              }}
            />
          )}
        </section>
      )}

      {!sponsor && !past && (
        <section id="majlis-mine" className="mt-10 scroll-mt-24" aria-labelledby="majlis-mine-title">
          <h2 id="majlis-mine-title" className="font-display text-[1.35rem] font-semibold">
            Your applications
          </h2>
          {loading ? (
            <p className="mt-3 text-[0.98rem] text-[var(--ba-muted)]">Loading your applications.</p>
          ) : error ? (
            <p className="mt-3 text-[0.98rem] text-[var(--ba-error)]" role="alert">
              {MEMBER_VIEWS.majlis.error}
            </p>
          ) : (
            <p className="mt-2 text-[0.98rem] text-[var(--ba-muted)]">{applicationSummary(mine)}</p>
          )}
          {events !== null && !error && mine.length > 0 && (
            <ul className="mt-4 space-y-3">
              {mine.map((event) => (
                <li key={event.id}>
                  <ApplicationCard event={event} userId={userId} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function upcomingLabel(count: number): string {
  return count === 1 ? '1 upcoming' : `${count} upcoming`
}

function pastLabel(count: number): string {
  return count === 1 ? '1 past' : `${count} past`
}

function applicationSummary(rows: MajlisEventRow[]): string {
  if (rows.length === 0) return 'You have no applications yet.'
  const pending = rows.filter((event) => event.status === 'pending_approval').length
  const rejected = rows.filter((event) => event.status === 'rejected').length
  const parts = [`${rows.length} ${rows.length === 1 ? 'application' : 'applications'}`]
  if (pending > 0) parts.push(`${pending} pending approval`)
  if (rejected > 0) parts.push(`${rejected} rejected`)
  return `${parts.join('. ')}.`
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-11 max-w-full items-center whitespace-normal px-3 text-left text-[0.92rem] ${
        pressed ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'border border-[var(--ba-line)] bg-white text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function priorityText(ends: string | null, nowMs: number): string | null {
  if (!ends) return null
  const endsMs = new Date(ends).getTime()
  if (Number.isNaN(endsMs)) return null
  if (nowMs < endsMs) return `Founding priority until ${formatRiyadhStamp(ends)}`
  return 'Open to all members'
}

function seatLine(registered: number, capacity: number, waiting: number): string {
  const seats = `${registered} of ${capacity} seats filled`
  return waiting > 0 ? `${seats}. ${waiting} waiting` : seats
}

function EventList({
  events,
  past,
  calendar,
  sponsor,
  userId,
  nowMs,
  highlight,
  roster,
  seat,
  onFocus,
  onRegion,
  onChanged,
  shown,
}: {
  events: Array<MajlisEventRow | MajlisSponsorEvent>
  past: boolean
  calendar: boolean
  sponsor: boolean
  userId: string
  nowMs: number
  highlight: string
  roster?: MajlisRosterRow[]
  seat: string
  onFocus: (tag: string) => void
  onRegion: (region: string) => void
  onChanged: () => void
  shown: (event: MajlisEventRow) => MajlisEventRow
}) {
  const [cursor, setCursor] = useState(() => {
    const first = events[0] ? riyadhDay(events[0].starts_at) : null
    const today = riyadhDay(new Date(nowMs).toISOString())
    return first ?? today ?? { year: 2026, month: 1, day: 1 }
  })
  const monthEvents = events.filter((event) => {
    const day = riyadhDay(event.starts_at)
    return day?.year === cursor.year && day.month === cursor.month
  })
  const listed = calendar ? monthEvents : events

  function card(event: MajlisEventRow | MajlisSponsorEvent) {
    if (sponsor || !('host_member_id' in event)) {
      return (
        <SponsorCard
          event={event as MajlisSponsorEvent}
          nowMs={nowMs}
          past={past}
          onFocus={onFocus}
          onRegion={onRegion}
        />
      )
    }
    const row = shown(event as MajlisEventRow)
    if (past) {
      return <PastCard event={row} onFocus={onFocus} onRegion={onRegion} />
    }
    return (
      <MemberCard
        event={row}
        userId={userId}
        nowMs={nowMs}
        tier={rsvpTier(seat)}
        highlighted={highlight === row.id}
        roster={roster?.filter((item) => item.event_id === row.id)}
        onFocus={onFocus}
        onRegion={onRegion}
        onChanged={onChanged}
      />
    )
  }

  return (
    <>
      {calendar && (
        <MonthGrid
          year={cursor.year}
          month={cursor.month}
          events={monthEvents}
          onPrev={() => setCursor((current) => ({ ...current, ...shiftMonth(current.year, current.month, -1) }))}
          onNext={() => setCursor((current) => ({ ...current, ...shiftMonth(current.year, current.month, 1) }))}
        />
      )}
      <ul className={`mt-4 space-y-3 ${calendar ? 'md:hidden' : ''}`} data-majlis-agenda={calendar ? '' : undefined}>
        {listed.map((event) => {
          const day = riyadhDay(event.starts_at)
          return (
            <li key={event.id} id={calendar ? undefined : `majlis-${event.id}`}>
              {calendar && day && (
                <p className="mb-2 text-[0.92rem] text-[var(--ba-muted)]">{dayKey(day)}</p>
              )}
              {card(event)}
            </li>
          )
        })}
      </ul>
      {calendar && (
        <ul className="mt-4 hidden space-y-3 md:block">
          {listed.map((event) => (
            <li key={event.id} id={`majlis-${event.id}`}>
              {card(event)}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function MonthGrid({
  year,
  month,
  events,
  onPrev,
  onNext,
}: {
  year: number
  month: number
  events: Array<{ id: string; title: string; starts_at: string }>
  onPrev: () => void
  onNext: () => void
}) {
  const cells = monthCells(year, month)
  const byDay = new Map<number, Array<{ id: string; title: string }>>()
  for (const event of events) {
    const day = riyadhDay(event.starts_at)
    if (!day || day.month !== month || day.year !== year) continue
    const list = byDay.get(day.day) ?? []
    list.push({ id: event.id, title: event.title })
    byDay.set(day.day, list)
  }
  return (
    <div className="mt-4 hidden max-w-full md:block" data-majlis-calendar="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[1.15rem] font-semibold">{monthLabel(year, month)}</h3>
        <div className="flex gap-2">
          <button type="button" className={quietBtn} onClick={onPrev}>Previous month</button>
          <button type="button" className={quietBtn} onClick={onNext}>Next month</button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-[0.82rem]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <div key={label} className="px-1 text-[var(--ba-muted)]">{label}</div>
        ))}
        {cells.map((day, index) => {
          const items = day ? byDay.get(day) ?? [] : []
          return (
            <div key={`${year}-${month}-${index}`} className="min-h-16 border border-[var(--ba-line)] bg-white p-1">
              <p>{day ?? ''}</p>
              {items.map((item) => (
                <a key={item.id} href={`#majlis-${item.id}`} className="mt-1 block truncate text-[var(--ba-indigo)] underline">
                  {item.title}
                </a>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PastCard({
  event,
  onFocus,
  onRegion,
}: {
  event: MajlisEventRow
  onFocus: (tag: string) => void
  onRegion: (region: string) => void
}) {
  return (
    <article className="border border-[var(--ba-line)] bg-white px-4 py-4" data-majlis-past="">
      <div className="flex items-start gap-3">
        <SignedAvatar path={event.host_avatar_path ?? null} avatarStyle={event.host_avatar_style} size={40} alt="" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[1.15rem] font-semibold">{event.title}</h3>
          <p className="mt-1 text-[0.95rem]">{hostLine(event)}</p>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-[0.95rem] sm:grid-cols-2">
        <div>
          <dt className="text-[var(--ba-muted)]">Region</dt>
          <dd>
            <button type="button" className="min-h-11 text-left underline decoration-[var(--ba-line)]" onClick={() => onRegion(event.region)}>
              {event.region}
            </button>
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ba-muted)]">When</dt>
          <dd>{formatMajlisWhen(event.starts_at, event.ends_at)}</dd>
        </div>
      </dl>
      <TagRow tags={event.focus_tags} onFocus={onFocus} />
    </article>
  )
}

function hostLine(event: MajlisEventRow): string {
  if (!event.host_member_id) return 'hosted by our admin team'
  return event.host_full_name || 'Host'
}

function SponsorCard({
  event,
  nowMs,
  past = false,
  onFocus,
  onRegion,
}: {
  event: MajlisSponsorEvent
  nowMs: number
  past?: boolean
  onFocus: (tag: string) => void
  onRegion: (region: string) => void
}) {
  const priority = priorityText(event.founding_priority_ends_at, nowMs)
  return (
    <article className="border border-[var(--ba-line)] bg-white px-4 py-4">
      <CardHead
        title={event.title}
        featured={event.featured}
        sponsorLabel={event.sponsor_label}
        description={event.description}
      />
      <Meta
        region={event.region}
        when={formatMajlisWhen(event.starts_at, event.ends_at)}
        seats={past ? '' : seatLine(event.registered_count, event.capacity, event.waitlist_count)}
        venueName={event.venue_name}
        address={null}
        showVenue={!past}
        showSeats={!past}
        onRegion={onRegion}
      />
      {priority && <p className="mt-3 text-[0.92rem] text-[var(--ba-indigo)]">{priority}</p>}
      <TagRow tags={event.focus_tags} onFocus={onFocus} />
    </article>
  )
}

function MemberCard({
  event,
  userId,
  nowMs,
  tier,
  highlighted,
  roster,
  onFocus,
  onRegion,
  onChanged,
}: {
  event: MajlisEventRow
  userId: string
  nowMs: number
  tier: ReturnType<typeof rsvpTier>
  highlighted: boolean
  roster?: MajlisRosterRow[]
  onFocus: (tag: string) => void
  onRegion: (region: string) => void
  onChanged: () => void
}) {
  const host = event.host_member_id === userId
  const priority = priorityText(event.founding_priority_ends_at, nowMs)
  const blocked =
    !host && tier === 'member' && event.founding_priority_ends_at
      ? nowMs < new Date(event.founding_priority_ends_at).getTime()
      : false
  return (
    <article className={`border bg-white px-4 py-4 ${highlighted ? 'border-[var(--ba-copper)]' : 'border-[var(--ba-line)]'}`} data-majlis-card="">
      <div className="flex items-start gap-3">
        <SignedAvatar path={event.host_avatar_path ?? null} avatarStyle={event.host_avatar_style} size={40} alt="" />
        <div className="min-w-0 flex-1">
          <CardHead title={event.title} featured={event.featured} sponsorLabel={event.sponsor_label} description={event.description} />
          {!host && <p className="mt-1 text-[0.95rem]">{hostLine(event)}</p>}
        </div>
      </div>
      <Meta
        region={event.region}
        when={formatMajlisWhen(event.starts_at, event.ends_at)}
        seats={seatLine(event.registered_count, event.capacity, event.waitlist_count)}
        venueName={event.venue_name}
        address={event.venue_address}
        addressHint={
          !host && event.venue_visibility === 'members_on_rsvp' && !event.venue_address
            ? 'The address is shared after you register.'
            : null
        }
        onRegion={onRegion}
      />
      {priority && <p className="mt-3 text-[0.92rem] text-[var(--ba-indigo)]">{priority}</p>}
      <TagRow tags={event.focus_tags} onFocus={onFocus} />
      {host ? (
        <div className="mt-4">
          <p className="text-[0.95rem]">You are hosting this majlis.</p>
          {event.maybe_count != null && <p className="mt-1 text-[0.95rem]">Maybe {event.maybe_count}</p>}
          <HostRoster eventId={event.id} title={event.title} seeded={roster} />
        </div>
      ) : (
        <RsvpControls event={event} blocked={blocked} onChanged={onChanged} />
      )}
    </article>
  )
}

function ApplicationCard({ event, userId }: { event: MajlisEventRow; userId: string }) {
  return (
    <article className="border border-[var(--ba-line)] bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-[1.15rem] font-semibold">{event.title}</h3>
        <StatusLabel status={event.status} />
      </div>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{event.description}</p>
      <Meta
        region={event.region}
        when={formatMajlisWhen(event.starts_at, event.ends_at)}
        seats={`Capacity ${event.capacity}`}
        venueName={event.venue_name}
        address={event.host_member_id === userId ? event.venue_address : null}
      />
      <p className="mt-3 text-[0.92rem]">{event.focus_tags.join(', ')}</p>
      {event.status === 'rejected' && event.rejection_feedback && (
        <p className="mt-3 text-[0.95rem]">Admin feedback: {event.rejection_feedback}</p>
      )}
      {event.status === 'cancelled' && event.cancel_reason && (
        <p className="mt-3 text-[0.95rem]">Cancellation: {event.cancel_reason}</p>
      )}
      {(event.status === 'hidden' || event.status === 'cancelled') && (
        <HostRoster eventId={event.id} title={event.title} />
      )}
    </article>
  )
}

function CardHead({
  title,
  featured,
  sponsorLabel,
  description,
}: {
  title: string
  featured: boolean
  sponsorLabel: string | null
  description: string
}) {
  return <MajlisCardTitle title={title} featured={featured} presentedBy={sponsorLabel} description={description} />
}

function Meta({
  region,
  when,
  seats,
  venueName,
  address,
  addressHint,
  showVenue = true,
  showSeats = true,
  onRegion,
}: {
  region: string
  when: string
  seats: string
  venueName: string
  address: string | null
  addressHint?: string | null
  showVenue?: boolean
  showSeats?: boolean
  onRegion?: (region: string) => void
}) {
  return (
    <dl className="mt-3 grid gap-2 text-[0.95rem] sm:grid-cols-2">
      <div>
        <dt className="text-[var(--ba-muted)]">Region</dt>
        <dd>
          {onRegion ? (
            <button type="button" className="min-h-11 text-left underline decoration-[var(--ba-line)]" onClick={() => onRegion(region)}>
              {region}
            </button>
          ) : (
            region
          )}
        </dd>
      </div>
      <div>
        <dt className="text-[var(--ba-muted)]">When</dt>
        <dd>{when}</dd>
      </div>
      {showSeats && (
        <div>
          <dt className="text-[var(--ba-muted)]">Seats</dt>
          <dd>{seats}</dd>
        </div>
      )}
      {showVenue && (
      <div>
        <dt className="text-[var(--ba-muted)]">Venue</dt>
        <dd>
          {venueName}
          {address ? `, ${address}` : ''}
          {addressHint && <span className="mt-1 block text-[0.88rem] text-[var(--ba-muted)]">{addressHint}</span>}
        </dd>
      </div>
      )}
    </dl>
  )
}

function TagRow({ tags, onFocus }: { tags: string[]; onFocus: (tag: string) => void }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag}>
          <button type="button" className="min-h-11 px-1 text-[0.92rem] text-[var(--ba-indigo)] underline decoration-[var(--ba-line)]" onClick={() => onFocus(tag)}>
            {tag}
          </button>
        </li>
      ))}
    </ul>
  )
}

function RsvpControls({
  event,
  blocked,
  onChanged,
}: {
  event: MajlisEventRow
  blocked: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const open = Boolean(event.rsvp_opens_at)
  const status = event.my_rsvp_status
  const yesOn = status === 'registered' || status === 'waitlist'
  const full = event.registered_count >= event.capacity && status !== 'registered'
  const location = event.venue_address ? `${event.venue_name}, ${event.venue_address}` : event.venue_name
  const choice = status === 'registered' ? 'yes' : status === 'waitlist' ? 'waitlist' : status === 'maybe' ? 'maybe' : status === 'declined' ? 'no' : 'none'

  async function act(action: MajlisRsvpAction) {
    if (action === 'register' && yesOn) return
    if (action === 'maybe' && status === 'maybe') return
    if (action === 'decline' && status === 'declined') return
    setBusy(true)
    setMessage('')
    const result = await rsvpMajlis(event.id, action)
    setBusy(false)
    if (result.error) {
      setMessage(result.error)
      return
    }
    onChanged()
  }

  if (!open) {
    return <p className="mt-4 text-[0.92rem] text-[var(--ba-muted)]">Registration is not open yet.</p>
  }

  const calendar = status === 'registered'
    ? googleCalendarUrl({
        title: event.title,
        startsAtUtc: event.starts_at,
        endsAtUtc: event.ends_at,
        details: `${event.title}. Region: ${event.region}. ${formatMajlisWhen(event.starts_at, event.ends_at)}`,
        location,
      })
    : ''

  return (
    <div className="mt-4" data-rsvp-choice={choice}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="RSVP">
        <button
          type="button"
          className={yesOn ? primaryBtn : quietBtn}
          aria-pressed={yesOn}
          disabled={busy || (blocked && !yesOn)}
          onClick={() => void act('register')}
        >
          Yes
        </button>
        <button type="button" className={status === 'maybe' ? primaryBtn : quietBtn} aria-pressed={status === 'maybe'} disabled={busy} onClick={() => void act('maybe')}>
          Maybe
        </button>
        <button type="button" className={status === 'declined' ? primaryBtn : quietBtn} aria-pressed={status === 'declined'} disabled={busy} onClick={() => void act('decline')}>
          No
        </button>
      </div>
      {blocked && !yesOn && (
        <p className="mt-3 text-[0.95rem]">Founding members have priority for the first 48 hours.</p>
      )}
      {full && !yesOn && <p className="mt-3 text-[0.95rem]">This majlis is full. Yes joins the waitlist.</p>}
      {status === 'waitlist' && (
        <p className="mt-3 text-[0.95rem]">Waitlist position {event.my_waitlist_position ?? ''}.</p>
      )}
      {status === 'registered' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <a className={primaryBtn} href={calendar} target="_blank" rel="noreferrer">
            Google Calendar
          </a>
          <button type="button" className={quietBtn} disabled={busy} onClick={() => void downloadMajlisIcs(event.id).then((result) => setMessage(result.error || ''))}>
            Add to calendar (.ics)
          </button>
        </div>
      )}
      {message && <p className="mt-2 w-full text-[0.95rem] text-[var(--ba-error)]" role="alert">{message}</p>}
    </div>
  )
}

function HostRoster({ eventId, title, seeded }: { eventId: string; title: string; seeded?: MajlisRosterRow[] }) {
  const seededMode = seeded !== undefined
  const [open, setOpen] = useState(seededMode)
  const [rows, setRows] = useState<MajlisRosterRow[] | null>(seededMode ? seeded : null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || seededMode) return
    let cancelled = false
    void fetchMajlisRoster(eventId).then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setError(result.error)
        setRows([])
        return
      }
      setError('')
      setRows(result.rows)
    })
    return () => {
      cancelled = true
    }
  }, [eventId, open, seededMode])

  function exportCsv() {
    downloadCsv('majlis-roster.csv', hostRosterCsv(rows ?? []))
  }

  return (
    <div className="mt-4">
      <button type="button" className={quietBtn} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide roster' : 'Roster'}
      </button>
      {open && rows === null && <p className="mt-3 text-[0.92rem] text-[var(--ba-muted)]">Loading roster</p>}
      {open && error && (
        <p className="mt-3 text-[0.95rem] text-[var(--ba-error)]" role="alert">
          {error}
        </p>
      )}
      {open && rows && rows.length === 0 && !error && (
        <p className="mt-3 text-[0.95rem] text-[var(--ba-muted)]">No guests yet for {title}.</p>
      )}
      {open && rows && rows.length > 0 && (
        <>
          <button type="button" className={`${quietBtn} mt-3`} onClick={exportCsv}>
            Download CSV
          </button>
          <ul className="mt-3 space-y-2" aria-label="Roster">
            {groupMajlisRoster(rows).map((group) => (
              <li key={group.status}>
                <p className="text-[0.82rem] font-semibold tracking-[0.06em] uppercase">{group.label} ({group.rows.length})</p>
                {group.rows.map((row) => (
                  <p key={row.id} className="mt-2 flex items-center gap-3 text-[0.95rem]">
                    <SignedAvatar path={row.avatar_path ?? null} avatarStyle={row.avatar_style} size={36} alt="" />
                    <span>
                      <span className="font-semibold">{row.full_name || 'Member'}</span>
                      {` · ${row.status}`}
                      {row.status === 'waitlist' && row.waitlist_position ? ` ${row.waitlist_position}` : ''}
                    </span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function StatusLabel({ status }: { status: MajlisEventRow['status'] }) {
  const label =
    status === 'pending_approval'
      ? 'Pending approval'
      : status === 'published'
        ? 'Published'
        : status === 'rejected'
          ? 'Rejected'
          : status === 'cancelled'
            ? 'Cancelled'
            : 'Hidden'
  const tone =
    status === 'pending_approval'
      ? 'border-[var(--ba-copper)] bg-[var(--ba-copper)]/15 text-[var(--ba-copper-deep)]'
      : status === 'rejected'
        ? 'border-[var(--ba-error)] text-[var(--ba-error)]'
        : 'border-[var(--ba-line)] text-[var(--ba-indigo)]'
  return (
    <p className={`inline-flex min-h-11 items-center border px-3 text-[0.72rem] font-semibold tracking-[0.08em] uppercase ${tone}`}>
      {label}
    </p>
  )
}

const APPLY_STEPS = ['Details', 'When', 'Venue'] as const

const APPLY_PROBE = {
  title: 'Gathering',
  description: 'A private gathering for members.',
  region: 'Riyadh',
  focusTags: ['Governance'],
  startsAtUtc: '2099-01-02T10:00:00.000Z',
  endsAtUtc: '2099-01-02T12:00:00.000Z',
  capacity: 12,
  venueName: 'Venue',
  venueAddress: 'Address',
}

function ApplyForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [region, setRegion] = useState('')
  const [tags, setTags] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [capacity, setCapacity] = useState('12')
  const [venueName, setVenueName] = useState('')
  const [venueAddress, setVenueAddress] = useState('')
  const [step, setStep] = useState(1)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  function fields() {
    return { title, description, region, tags, starts, ends, capacity, venueName, venueAddress }
  }

  function goTo(next: number) {
    if (next > step) {
      const message = messageForStep(step, fields())
      if (message) {
        showStepError(message)
        return
      }
    }
    setFormError('')
    setStep(next)
  }

  function showStepError(message: string) {
    setFormError(message)
    setStep(stepForError(message))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (step < 3) {
      goTo(step + 1)
      return
    }
    setSent(false)
    const message = messageForStep(3, fields())
    if (message) {
      showStepError(message)
      return
    }
    const parsed = validateMajlisApplication({
      title,
      description,
      region,
      focusTags: parseFocusTags(tags),
      startsAtUtc: riyadhWallToUtc(starts) ?? '',
      endsAtUtc: riyadhWallToUtc(ends) ?? '',
      capacity: Number(capacity),
      venueName,
      venueAddress,
    })
    if (!parsed.ok) {
      showStepError(parsed.error)
      return
    }
    setBusy(true)
    setFormError('')
    const result = await applyForMajlis({
      title: parsed.value.title,
      description: parsed.value.description,
      region: parsed.value.region,
      focusTags: parsed.value.focusTags,
      startsAtUtc: parsed.value.startsAtUtc,
      endsAtUtc: parsed.value.endsAtUtc,
      capacity: parsed.value.capacity,
      venueName: parsed.value.venueName,
      venueAddress: parsed.value.venueAddress,
    })
    setBusy(false)
    if (result.error || result.status !== 'pending_approval') {
      setFormError(result.error || 'Could not submit the application.')
      return
    }
    setTitle('')
    setDescription('')
    setRegion('')
    setTags('')
    setStarts('')
    setEnds('')
    setCapacity('12')
    setVenueName('')
    setVenueAddress('')
    setStep(1)
    setSent(true)
    onCreated()
    document.getElementById('majlis-apply')?.scrollIntoView({ block: 'start' })
  }

  function hostAnother() {
    setSent(false)
    setFormError('')
    setStep(1)
  }

  return (
    <section id="majlis-apply" className="mt-8 max-w-3xl scroll-mt-24" aria-labelledby="majlis-apply-title">
      <h2 id="majlis-apply-title" tabIndex={-1} className="font-display text-[1.35rem] font-semibold">
        Apply to host
      </h2>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">
        Three short steps. Times are Asia/Riyadh. The application stays pending until admin accepts it.
      </p>
      {sent ? (
        <div className="mt-4 border border-[var(--ba-line)] bg-white px-4 py-4" role="status">
          <p className="font-display text-[1.15rem] font-semibold">Application submitted.</p>
          <p className="mt-2 text-[0.98rem] leading-relaxed">
            Status: pending approval. Admin will accept or reject it. Follow it under Your applications.
          </p>
          <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
            <a href="#majlis-mine" className={`${primaryBtn} w-full justify-center sm:w-auto`}>
              Your applications
            </a>
            <button type="button" className={`${quietBtn} w-full justify-center sm:w-auto`} onClick={hostAnother}>
              Host another
            </button>
          </div>
        </div>
      ) : (
        <form className="mt-4" onSubmit={(event) => void onSubmit(event)}>
          <ol className="grid grid-cols-3 gap-2" aria-label="Application steps">
            {APPLY_STEPS.map((label, index) => {
              const number = index + 1
              const current = step === number
              const done = step > number
              return (
                <li key={label}>
                  <button
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    disabled={!done && !current}
                    onClick={() => goTo(number)}
                    className={`flex min-h-11 w-full items-center justify-center px-2 text-center text-[0.82rem] ${
                      current
                        ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]'
                        : done
                          ? 'border border-[var(--ba-indigo)] bg-white text-ink'
                          : 'border border-[var(--ba-line)] bg-white text-[var(--ba-muted)]'
                    }`}
                  >
                    {number}. {label}
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="mt-4 text-[0.82rem] font-semibold tracking-[0.08em] text-[var(--ba-muted)] uppercase">
            Step {step} of 3
          </p>
          <div className="mt-3 grid gap-4">
            {step === 1 && (
              <>
                <p className="text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">Name the gathering and the focus.</p>
                <label className="block text-[0.92rem]">
                  Title
                  <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <label className="block text-[0.92rem]">
                  Description
                  <textarea
                    className={`${fieldClass} min-h-28 py-2`}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <label className="block text-[0.92rem]">
                  Focus tags
                  <input
                    className={fieldClass}
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                    placeholder="Governance, Audit"
                  />
                </label>
                <p className="text-[0.88rem] text-[var(--ba-muted)]">Separate tags with commas. Use 1 to 8 tags.</p>
              </>
            )}
            {step === 2 && (
              <>
                <p className="text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">
                  Choose one region. Times are Asia/Riyadh.
                </p>
                <label className="block text-[0.92rem]">
                  Region
                  <select className={fieldClass} value={region} onChange={(event) => setRegion(event.target.value)}>
                    <option value="">Choose a region</option>
                    {MAJLIS_REGIONS.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block min-w-0 text-[0.92rem]">
                    Starts (Asia/Riyadh)
                    <input
                      className={`${fieldClass} min-w-0 max-w-full`}
                      type="datetime-local"
                      value={starts}
                      onChange={(event) => setStarts(event.target.value)}
                    />
                  </label>
                  <label className="block min-w-0 text-[0.92rem]">
                    Ends (Asia/Riyadh)
                    <input
                      className={`${fieldClass} min-w-0 max-w-full`}
                      type="datetime-local"
                      value={ends}
                      onChange={(event) => setEnds(event.target.value)}
                    />
                  </label>
                </div>
                <label className="block text-[0.92rem]">
                  Capacity
                  <input
                    className={fieldClass}
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    inputMode="numeric"
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                  />
                </label>
              </>
            )}
            {step === 3 && (
              <>
                <p className="text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">
                  The venue name is shown on the published majlis. The address is shown after a member registers.
                </p>
                <label className="block text-[0.92rem]">
                  Venue name
                  <input className={fieldClass} value={venueName} onChange={(event) => setVenueName(event.target.value)} />
                </label>
                <label className="block text-[0.92rem]">
                  Venue address
                  <input className={fieldClass} value={venueAddress} onChange={(event) => setVenueAddress(event.target.value)} />
                </label>
                <dl className="grid gap-2 border border-[var(--ba-line)] bg-white px-4 py-3 text-[0.95rem] sm:grid-cols-2">
                  <div>
                    <dt className="text-[var(--ba-muted)]">Title</dt>
                    <dd className="break-words">{title.trim() || 'Not set'}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ba-muted)]">Region</dt>
                    <dd>{region || 'Not set'}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ba-muted)]">When</dt>
                    <dd className="break-words">{starts && ends ? `${starts.replace('T', ' ')} to ${ends.replace('T', ' ')}` : 'Not set'}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ba-muted)]">Focus</dt>
                    <dd className="break-words">{tags.trim() || 'Not set'}</dd>
                  </div>
                </dl>
              </>
            )}
          </div>
          {formError && (
            <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
              {formError}
            </p>
          )}
          <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
            {step > 1 && (
              <button type="button" className={`${quietBtn} w-full justify-center sm:w-auto`} onClick={() => goTo(step - 1)}>
                Back
              </button>
            )}
            {step < 3 ? (
              <button type="submit" className={`${primaryBtn} w-full justify-center sm:order-last sm:w-auto`}>
                Continue
              </button>
            ) : (
              <button type="submit" disabled={busy} className={`${primaryBtn} w-full justify-center sm:order-last sm:w-auto`}>
                {busy ? 'Submitting' : 'Submit application'}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  )
}

function messageForStep(
  step: number,
  fields: {
    title: string
    description: string
    region: string
    tags: string
    starts: string
    ends: string
    capacity: string
    venueName: string
    venueAddress: string
  },
): string {
  const focusTags = parseFocusTags(fields.tags)
  if (step === 1) {
    const parsed = validateMajlisApplication({
      ...APPLY_PROBE,
      title: fields.title,
      description: fields.description,
      focusTags: focusTags.length > 0 ? focusTags : APPLY_PROBE.focusTags,
    })
    if (!parsed.ok) return parsed.error
    if (focusTags.length < 1 || focusTags.length > 8) return 'Add 1 to 8 focus tags.'
    return ''
  }
  if (step === 2) {
    const parsed = validateMajlisApplication({
      ...APPLY_PROBE,
      region: fields.region,
      startsAtUtc: riyadhWallToUtc(fields.starts) ?? '',
      endsAtUtc: riyadhWallToUtc(fields.ends) ?? '',
      capacity: Number(fields.capacity),
    })
    if (!parsed.ok) return parsed.error
    return ''
  }
  const parsed = validateMajlisApplication({
    title: fields.title,
    description: fields.description,
    region: fields.region,
    focusTags,
    startsAtUtc: riyadhWallToUtc(fields.starts) ?? '',
    endsAtUtc: riyadhWallToUtc(fields.ends) ?? '',
    capacity: Number(fields.capacity),
    venueName: fields.venueName,
    venueAddress: fields.venueAddress,
  })
  return parsed.ok ? '' : parsed.error
}

function stepForError(message: string): number {
  if (
    message.startsWith('Add a title') ||
    message.startsWith('Add a description') ||
    message.includes('focus tag')
  ) {
    return 1
  }
  if (
    message.startsWith('Choose one region') ||
    message.startsWith('Enter a start') ||
    message.startsWith('End time') ||
    message.startsWith('Capacity')
  ) {
    return 2
  }
  return 3
}

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  MAJLIS_REGIONS,
  formatMajlisWhen,
  countPublishedByRegion,
  formatRiyadhStamp,
  googleCalendarUrl,
  isMajlisRegion,
  parseFocusTags,
  riyadhWallToUtc,
  rsvpTier,
  validateMajlisApplication,
} from '../../../supabase/functions/_shared/majlis.ts'
import { KsaRegionMap } from '../../components/majlis/KsaRegionMap'
import { downloadCsv, toCsv } from '../../lib/csv'
import {
  applyForMajlis,
  downloadMajlisIcs,
  fetchMajlisEvents,
  fetchMajlisRoster,
  fetchSponsorMajlis,
  rsvpMajlis,
  type MajlisEventRow,
  type MajlisRosterRow,
  type MajlisSponsorEvent,
} from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, FilteredZero } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'

const fieldClass =
  'mt-1 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem] text-ink'
const primaryBtn =
  'inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ba-primary disabled:opacity-40'
const quietBtn =
  'inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-40'

export function MajlisPage() {
  const { member, userId } = useMember()
  const sponsor = String(member.seat) === 'sponsor'
  const [params, setParams] = useSearchParams()
  const region = isMajlisRegion(params.get('region') || '') ? params.get('region') : ''
  const focus = params.get('focus') || ''
  const highlight = params.get('event') || ''
  const [nowMs] = useState(() => Date.now())
  const [events, setEvents] = useState<MajlisEventRow[] | null>(null)
  const [sponsorEvents, setSponsorEvents] = useState<MajlisSponsorEvent[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Majlis | Board Arabia')

  useEffect(() => {
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
  }, [attempt, sponsor])

  useEffect(() => {
    if (!highlight) return
    document.getElementById(`majlis-${highlight}`)?.scrollIntoView({ block: 'center' })
  }, [highlight, events, sponsorEvents])

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
    const rows = sponsor
      ? (sponsorEvents ?? [])
      : (events ?? []).filter((event) => event.status === 'published')
    return [...rows].sort((a, b) => Number(b.featured) - Number(a.featured) || a.starts_at.localeCompare(b.starts_at))
  }, [events, sponsor, sponsorEvents])

  const tags = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const event of published) {
      for (const tag of event.focus_tags) {
        const key = tag.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        list.push(tag)
      }
    }
    return list.sort((a, b) => a.localeCompare(b))
  }, [published])

  const filtered = published.filter((event) => {
    if (region && event.region !== region) return false
    if (focus && !event.focus_tags.some((tag) => tag.toLowerCase() === focus.toLowerCase())) return false
    return true
  })

  const counts = countPublishedByRegion(
    MAJLIS_REGIONS,
    published.map((event) => ({ region: event.region })),
  )
  const loading = sponsor ? sponsorEvents === null : events === null
  const mine = sponsor
    ? []
    : (events ?? [])
        .filter((event) => event.host_member_id === userId && event.status !== 'published')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Majlis</h1>
      <p className="mt-2 max-w-3xl text-[0.98rem] leading-relaxed text-[var(--ba-muted)]">
        {sponsor
          ? 'Regional activity for sponsors. Guest names and contact details stay with the host.'
          : 'Apply to host, then follow the status under Your applications. Published gatherings are listed below.'}
      </p>

      {!sponsor && (
        <nav aria-label="On this page" className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
          <PageJump href="#majlis-mine">Your applications</PageJump>
          <PageJump href="#majlis-apply">Apply to host</PageJump>
          <PageJump href="#majlis-feed">Published</PageJump>
        </nav>
      )}

      {!sponsor && (
        <section id="majlis-mine" className="mt-8 scroll-mt-24" aria-labelledby="majlis-mine-title">
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

      {!sponsor && (
        <ApplyForm
          onCreated={() => {
            setEvents(null)
            setAttempt((value) => value + 1)
          }}
        />
      )}

      <section className="mt-10 scroll-mt-24" aria-labelledby="majlis-map-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="majlis-map-title" className="font-display text-[1.35rem] font-semibold">
            Regions
          </h2>
          <p className="text-[0.92rem] text-[var(--ba-muted)]">{published.length} published</p>
        </div>
        <p className="mt-2 text-[0.95rem] text-[var(--ba-muted)]">
          Filter the published list by region. The map is not open yet.
        </p>
        {unavailable && (
          <p className="mt-3 text-[0.95rem] text-[var(--ba-muted)]">{MEMBER_VIEWS.majlis.mapUnavailable}</p>
        )}
        <div className="mt-4">
          <KsaRegionMap counts={counts} selected={null} comingSoon />
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Region filters">
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
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Focus filters">
            <Chip pressed={!focus} onClick={() => setFilter({ focus: null })}>
              All focus
            </Chip>
            {tags.map((tag) => (
              <Chip key={tag} pressed={focus.toLowerCase() === tag.toLowerCase()} onClick={() => setFilter({ focus: focus.toLowerCase() === tag.toLowerCase() ? null : tag })}>
                {tag}
              </Chip>
            ))}
          </div>
        )}
      </section>

      <section id="majlis-feed" className="mt-8 scroll-mt-24" aria-labelledby="majlis-feed-title">
        <h2 id="majlis-feed-title" className="font-display text-[1.35rem] font-semibold">
          Published
        </h2>
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
        ) : published.length === 0 ? (
          <div className="mt-4">
            <EmptyState tone="member" message={MEMBER_VIEWS.majlis.empty} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4">
            <FilteredZero
              tone="member"
              message={MEMBER_VIEWS.majlis.filtered}
              clearLabel={MEMBER_VIEWS.majlis.clear}
              onClear={() => setFilter({ region: null, focus: null })}
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {filtered.map((event) => (
              <li key={event.id} id={`majlis-${event.id}`}>
                {sponsor || !('host_member_id' in event) ? (
                  <SponsorCard
                    event={event as MajlisSponsorEvent}
                    nowMs={nowMs}
                    onFocus={(tag) => setFilter({ focus: tag })}
                    onRegion={(name) => setFilter({ region: name })}
                  />
                ) : (
                  <MemberCard
                    event={event as MajlisEventRow}
                    userId={userId}
                    nowMs={nowMs}
                    tier={rsvpTier(member.seat)}
                    highlighted={highlight === event.id}
                    onFocus={(tag) => setFilter({ focus: tag })}
                    onRegion={(name) => setFilter({ region: name })}
                    onChanged={() => {
                      setEvents(null)
                      setAttempt((value) => value + 1)
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  )
}

function PageJump({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 items-center justify-center border border-[var(--ba-line)] bg-white px-3 text-[0.92rem] text-ink"
    >
      {children}
    </a>
  )
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
      className={`inline-flex min-h-11 items-center px-3 text-[0.92rem] ${
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

function SponsorCard({
  event,
  nowMs,
  onFocus,
  onRegion,
}: {
  event: MajlisSponsorEvent
  nowMs: number
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
        seats={seatLine(event.registered_count, event.capacity, event.waitlist_count)}
        venueName={event.venue_name}
        address={null}
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
  onFocus,
  onRegion,
  onChanged,
}: {
  event: MajlisEventRow
  userId: string
  nowMs: number
  tier: ReturnType<typeof rsvpTier>
  highlighted: boolean
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
    <article className={`border bg-white px-4 py-4 ${highlighted ? 'border-[var(--ba-copper)]' : 'border-[var(--ba-line)]'}`}>
      <CardHead title={event.title} featured={event.featured} sponsorLabel={event.sponsor_label} description={event.description} />
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
          <HostRoster eventId={event.id} title={event.title} />
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
        <p className="mt-3 text-[0.95rem]">Staff feedback: {event.rejection_feedback}</p>
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
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-[1.15rem] font-semibold">{title}</h3>
        {featured && (
          <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-[var(--ba-copper-deep)] uppercase">Featured</p>
        )}
      </div>
      {sponsorLabel && <p className="mt-1 text-[0.88rem] text-[var(--ba-muted)]">Presenting: {sponsorLabel}</p>}
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{description}</p>
    </>
  )
}

function Meta({
  region,
  when,
  seats,
  venueName,
  address,
  addressHint,
  onRegion,
}: {
  region: string
  when: string
  seats: string
  venueName: string
  address: string | null
  addressHint?: string | null
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
      <div>
        <dt className="text-[var(--ba-muted)]">Seats</dt>
        <dd>{seats}</dd>
      </div>
      <div>
        <dt className="text-[var(--ba-muted)]">Venue</dt>
        <dd>
          {venueName}
          {address ? `, ${address}` : ''}
          {addressHint && <span className="mt-1 block text-[0.88rem] text-[var(--ba-muted)]">{addressHint}</span>}
        </dd>
      </div>
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
  const full = event.registered_count >= event.capacity && event.my_rsvp_status !== 'registered'
  const location = event.venue_address ? `${event.venue_name}, ${event.venue_address}` : event.venue_name

  async function act(action: 'register' | 'cancel') {
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
  if (blocked && event.my_rsvp_status !== 'registered' && event.my_rsvp_status !== 'waitlist') {
    return (
      <p className="mt-4 text-[0.95rem]">Founding members have priority for the first 48 hours.</p>
    )
  }
  if (event.my_rsvp_status === 'registered') {
    const calendar = googleCalendarUrl({
      title: event.title,
      startsAtUtc: event.starts_at,
      endsAtUtc: event.ends_at,
      details: `${event.title}. Region: ${event.region}. ${formatMajlisWhen(event.starts_at, event.ends_at)}`,
      location,
    })
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <a className={primaryBtn} href={calendar} target="_blank" rel="noreferrer">
          Google Calendar
        </a>
        <button type="button" className={quietBtn} disabled={busy} onClick={() => void downloadMajlisIcs(event.id).then((result) => setMessage(result.error || ''))}>
          Download ICS
        </button>
        <button type="button" className={quietBtn} disabled={busy} onClick={() => void act('cancel')}>
          Cancel registration
        </button>
        {message && <p className="w-full text-[0.95rem] text-[var(--ba-error)]" role="alert">{message}</p>}
      </div>
    )
  }
  if (event.my_rsvp_status === 'waitlist') {
    return (
      <div className="mt-4">
        <p className="text-[0.95rem]">Waitlist position {event.my_waitlist_position ?? ''}.</p>
        <button type="button" className={`${quietBtn} mt-3`} disabled={busy} onClick={() => void act('cancel')}>
          Leave waitlist
        </button>
        {message && <p className="mt-2 text-[0.95rem] text-[var(--ba-error)]" role="alert">{message}</p>}
      </div>
    )
  }
  return (
    <div className="mt-4">
      <button type="button" className={primaryBtn} disabled={busy} onClick={() => void act('register')}>
        {busy ? 'Saving' : full ? 'Join waitlist' : 'Register'}
      </button>
      {message && <p className="mt-2 text-[0.95rem] text-[var(--ba-error)]" role="alert">{message}</p>}
    </div>
  )
}

function HostRoster({ eventId, title }: { eventId: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<MajlisRosterRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
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
  }, [eventId, open])

  function exportCsv() {
    const active = rows ?? []
    downloadCsv(
      'majlis-roster.csv',
      toCsv(
        ['Name', 'Email', 'Status', 'Waitlist position', 'Registered at'],
        active.map((row) => [
          row.full_name || '',
          row.email,
          row.status,
          row.waitlist_position,
          row.registered_at,
        ]),
      ),
    )
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
          <ul className="mt-3 space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="text-[0.95rem]">
                <span className="font-semibold">{row.full_name || row.email}</span>
                {row.full_name ? ` (${row.email})` : ''}
                {` · ${row.status}`}
                {row.status === 'waitlist' && row.waitlist_position ? ` ${row.waitlist_position}` : ''}
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
      <h2 id="majlis-apply-title" className="font-display text-[1.35rem] font-semibold">
        Apply to host
      </h2>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">
        Three short steps. Times are Asia/Riyadh. The application stays pending until staff accept it.
      </p>
      {sent ? (
        <div className="mt-4 border border-[var(--ba-line)] bg-white px-4 py-4" role="status">
          <p className="font-display text-[1.15rem] font-semibold">Application submitted.</p>
          <p className="mt-2 text-[0.98rem] leading-relaxed">
            Status: pending approval. Staff will accept or reject it. Follow it under Your applications.
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

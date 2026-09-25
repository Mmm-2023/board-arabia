import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  MAJLIS_REGIONS,
  countPublishedByRegion,
  formatMajlisWhen,
  isMajlisRegion,
  parseFocusTags,
  rejectionFeedbackError,
  utcToRiyadhWall,
} from '../../../supabase/functions/_shared/majlis.ts'
import { KsaRegionMap } from '../../components/majlis/KsaRegionMap'
import { downloadCsv, toCsv } from '../../lib/csv'
import {
  decideMajlis,
  fetchMajlisEvents,
  fetchMajlisRoster,
  majlisAdminAction,
  supabase,
  type MajlisEventRow,
  type MajlisRosterRow,
  type MajlisStatus,
} from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, FilteredZero } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'

const quietBtn =
  'inline-flex min-h-11 items-center border border-pearl/20 px-3 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/80 uppercase disabled:opacity-40'
const primaryBtn =
  'inline-flex min-h-11 items-center px-3 text-[0.68rem] font-semibold tracking-[0.06em] uppercase ba-primary disabled:opacity-40'

const STATUSES: Array<MajlisStatus | 'all'> = ['all', 'pending_approval', 'published', 'rejected', 'hidden', 'cancelled']
const EMPTY_EVENTS: MajlisEventRow[] = []

export function AdminMajlisPage() {
  const [events, setEvents] = useState<MajlisEventRow[] | null>(null)
  const [hosts, setHosts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<MajlisStatus | 'all'>('all')
  const [region, setRegion] = useState('')
  const [focus, setFocus] = useState('')
  const [when, setWhen] = useState<'all' | 'upcoming' | 'past'>('all')
  const [sponsor, setSponsor] = useState<'all' | 'with' | 'without'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [nowMs] = useState(() => Date.now())
  useNoIndex('Majlis queue | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchMajlisEvents().then(async (result) => {
      if (cancelled) return
      if ('error' in result) {
        setError(result.error)
        setEvents([])
        return
      }
      const ids = [...new Set(result.events.map((event) => event.host_member_id))]
      if (ids.length > 0) {
        const hostRes = await supabase.from('members').select('user_id, email').in('user_id', ids)
        if (!hostRes.error) {
          const next: Record<string, string> = {}
          for (const row of hostRes.data ?? []) next[row.user_id] = row.email
          if (!cancelled) setHosts(next)
        }
      }
      if (!cancelled) {
        setError('')
        setEvents(result.events)
      }
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const all = events ?? EMPTY_EVENTS
  const pending = all.filter((event) => event.status === 'pending_approval')
  const published = all.filter((event) => event.status === 'published')
  const counts = countPublishedByRegion(MAJLIS_REGIONS, published)
  const tags = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const event of all) {
      for (const tag of event.focus_tags ?? []) {
        const key = tag.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        list.push(tag)
      }
    }
    return list.sort((a, b) => a.localeCompare(b))
  }, [all])

  const filtered = all.filter((event) => {
    if (status !== 'all' && event.status !== status) return false
    if (region && event.region !== region) return false
    if (focus && !(event.focus_tags ?? []).some((tag) => tag.toLowerCase() === focus.toLowerCase())) return false
    if (sponsor === 'with' && !event.sponsor_label) return false
    if (sponsor === 'without' && event.sponsor_label) return false
    if (when !== 'all') {
      const upcoming = new Date(event.starts_at).getTime() >= nowMs
      if (when === 'upcoming' && !upcoming) return false
      if (when === 'past' && upcoming) return false
    }
    return true
  })

  function reload() {
    setEvents(null)
    setAttempt((value) => value + 1)
  }

  function exportEvents() {
    downloadCsv(
      'majlis-events.csv',
      toCsv(
        ['Title', 'Region', 'Status', 'Starts', 'Capacity', 'Registered', 'Waitlist', 'Sponsor', 'Latitude', 'Longitude'],
        filtered.map((event) => [
          event.title,
          event.region,
          event.status,
          event.starts_at,
          event.capacity,
          event.registered_count,
          event.waitlist_count,
          event.sponsor_label,
          event.map_lat,
          event.map_lng,
        ]),
      ),
    )
  }

  return (
    <div>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Majlis</h1>
      <p className="mt-2 text-[0.95rem] text-stone/65">
        Accept publishes the majlis on the member feed and the map. Reject needs feedback.
      </p>

      <section className="mt-8" aria-labelledby="admin-majlis-map">
        <h2 id="admin-majlis-map" className="font-display text-[1.35rem] font-semibold">
          Map activity
        </h2>
        <p className="mt-2 text-[0.92rem] text-pearl/55">{published.length} published</p>
        <div className="mt-4">
          <KsaRegionMap
            counts={counts}
            selected={region || null}
            onSelect={(next) => setRegion(next && isMajlisRegion(next) ? next : '')}
          />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="admin-majlis-pending">
        <h2 id="admin-majlis-pending" className="font-display text-[1.35rem] font-semibold">
          Pending queue
        </h2>
        {events === null ? (
          <div className="mt-4">
            <CardSkeleton tone="staff" label="Loading majlis queue" />
          </div>
        ) : error ? (
          <div className="mt-4">
            <ErrorBanner tone="staff" message={STAFF_VIEWS.majlis.error} onRetry={reload} retryLabel={STAFF_VIEWS.majlis.retry} />
          </div>
        ) : pending.length === 0 ? (
          <div className="mt-4">
            <EmptyState tone="staff" message={STAFF_VIEWS.majlis.empty} />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {pending.map((event) => (
              <li key={event.id}>
                <PendingCard event={event} host={hosts[event.host_member_id] || 'Member'} onDone={reload} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="admin-majlis-all">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="admin-majlis-all" className="font-display text-[1.35rem] font-semibold">
            All events
          </h2>
          <button type="button" className={quietBtn} onClick={exportEvents} disabled={!events || filtered.length === 0}>
            Download CSV
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <FilterSelect label="Status" value={status} onChange={(value) => setStatus(value as MajlisStatus | 'all')}>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? 'All statuses' : statusLabel(item)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Region" value={region} onChange={setRegion}>
            <option value="">All regions</option>
            {MAJLIS_REGIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Focus" value={focus} onChange={setFocus}>
            <option value="">All focus</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Date" value={when} onChange={(value) => setWhen(value as 'all' | 'upcoming' | 'past')}>
            <option value="all">All dates</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </FilterSelect>
          <FilterSelect label="Sponsor" value={sponsor} onChange={(value) => setSponsor(value as 'all' | 'with' | 'without')}>
            <option value="all">Any sponsor</option>
            <option value="with">With sponsor</option>
            <option value="without">Without sponsor</option>
          </FilterSelect>
        </div>
        {events !== null && !error && all.length === 0 && (
          <div className="mt-4">
            <EmptyState tone="staff" message={STAFF_VIEWS.majlis.emptyEvents} />
          </div>
        )}
        {events !== null && !error && all.length > 0 && filtered.length === 0 && (
          <div className="mt-4">
            <FilteredZero
              tone="staff"
              message={STAFF_VIEWS.majlis.filtered}
              clearLabel={STAFF_VIEWS.majlis.clear}
              onClear={() => {
                setStatus('all')
                setRegion('')
                setFocus('')
                setWhen('all')
                setSponsor('all')
              }}
            />
          </div>
        )}
        {filtered.length > 0 && (
          <ul className="mt-4 space-y-4">
            {filtered.map((event) => (
              <li key={event.id} className="border border-pearl/10 bg-pearl/[0.03] px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-display text-[1.15rem] font-semibold">{event.title}</p>
                  <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-[var(--ba-lavender)] uppercase">
                    {statusLabel(event.status)}
                  </p>
                </div>
                <p className="mt-2 text-[0.95rem] text-stone/75">{event.description}</p>
                <dl className="mt-4 grid gap-3 text-[0.92rem] md:grid-cols-2">
                  <Field label="Host" value={hosts[event.host_member_id] || 'Member'} />
                  <Field label="Region" value={event.region} />
                  <Field label="When" value={formatMajlisWhen(event.starts_at, event.ends_at)} />
                  <Field label="Seats" value={`${event.registered_count} of ${event.capacity} filled, ${event.waitlist_count} waiting`} />
                  <Field label="Venue" value={event.venue_name} />
                  <Field label="Address" value={event.venue_address || 'Not shown'} />
                  <Field label="Geotag" value={event.map_lat != null && event.map_lng != null ? `${event.map_lat}, ${event.map_lng}` : 'Missing'} />
                  <Field label="Sponsor" value={event.sponsor_label || 'None'} />
                </dl>
                <p className="mt-3 text-[0.92rem] text-stone/80">{(event.focus_tags ?? []).join(', ')}</p>
                <button type="button" className={`${quietBtn} mt-4`} aria-expanded={openId === event.id} onClick={() => setOpenId(openId === event.id ? null : event.id)}>
                  {openId === event.id ? 'Hide operations' : 'Operations'}
                </button>
                {openId === event.id && <Ops event={event} onDone={reload} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-pearl/40">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="text-[0.82rem] text-pearl/70">
      {label}
      <select
        className="mt-1 block min-h-11 border border-white/20 bg-transparent px-2 text-[0.95rem] text-pearl"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  )
}

function PendingCard({ event, host, onDone }: { event: MajlisEventRow; host: string; onDone: () => void }) {
  const [acting, setActing] = useState<'accept' | 'reject' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const rejectBlocked = acting === 'reject' && rejectionFeedbackError(note) !== null

  async function confirm() {
    if (!acting) return
    if (acting === 'reject' && rejectionFeedbackError(note)) {
      setActionError('Rejection feedback is required.')
      return
    }
    setBusy(true)
    setActionError('')
    const result = await decideMajlis(event.id, acting, note)
    setBusy(false)
    if (result.error) {
      setActionError(result.error)
      return
    }
    setActing(null)
    setNote('')
    onDone()
  }

  return (
    <article className="border border-pearl/10 bg-pearl/[0.03] px-5 py-5">
      <p className="font-display text-[1.15rem] font-semibold">{event.title}</p>
      <p className="mt-2 text-[0.95rem] text-stone/75">{event.description}</p>
      <dl className="mt-4 grid gap-3 text-[0.92rem] md:grid-cols-2">
        <Field label="Host" value={host} />
        <Field label="Region" value={event.region} />
        <Field label="When" value={formatMajlisWhen(event.starts_at, event.ends_at)} />
        <Field label="Capacity" value={String(event.capacity)} />
        <Field label="Venue" value={event.venue_name} />
        <Field label="Address" value={event.venue_address || 'Not shown'} />
      </dl>
      <p className="mt-3 text-[0.92rem] text-stone/80">{event.focus_tags.join(', ')}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={primaryBtn} onClick={() => { setActing('accept'); setNote(''); setActionError('') }}>
          Accept
        </button>
        <button type="button" className={quietBtn} onClick={() => { setActing('reject'); setNote(''); setActionError('') }}>
          Reject
        </button>
      </div>
      {acting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-4 sm:items-center" role="presentation" onClick={() => { if (!busy) setActing(null) }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="majlis-decision-title"
            className="shell-safe-bottom w-full max-w-md border border-white/15 bg-ink px-5 py-5 text-pearl"
            onClick={(click) => click.stopPropagation()}
          >
            <h2 id="majlis-decision-title" className="font-display text-[1.45rem] font-semibold">
              {acting === 'accept' ? 'Accept majlis' : 'Reject majlis'}
            </h2>
            <label className="mt-4 block text-[0.92rem]" htmlFor="majlis-decision-note">
              {acting === 'accept' ? 'Note (optional)' : 'Feedback (required)'}
              <textarea
                id="majlis-decision-note"
                className="mt-1 min-h-28 w-full border border-white/20 bg-transparent px-3 py-2 text-[1rem]"
                value={note}
                onChange={(input) => setNote(input.target.value)}
                required={acting === 'reject'}
              />
            </label>
            {actionError && <p className="mt-3 text-[0.95rem] text-red-300" role="alert">{actionError}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" disabled={busy} className={quietBtn} onClick={() => setActing(null)}>
                Cancel
              </button>
              <button type="button" disabled={busy || rejectBlocked} className={primaryBtn} onClick={() => void confirm()}>
                {acting === 'accept' ? 'Publish' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function Ops({ event, onDone }: { event: MajlisEventRow; onDone: () => void }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [sponsorLabel, setSponsorLabel] = useState(event.sponsor_label || '')
  const [starts, setStarts] = useState(utcToRiyadhWall(event.starts_at))
  const [ends, setEnds] = useState(utcToRiyadhWall(event.ends_at))
  const [venueName, setVenueName] = useState(event.venue_name)
  const [venueAddress, setVenueAddress] = useState(event.venue_address || '')
  const [region, setRegion] = useState(event.region)
  const [tags, setTags] = useState(event.focus_tags.join(', '))
  const [roster, setRoster] = useState<MajlisRosterRow[] | null>(null)
  const [rosterError, setRosterError] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetchMajlisRoster(event.id).then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setRosterError(result.error)
        setRoster([])
        return
      }
      setRosterError('')
      setRoster(result.rows)
    })
    return () => {
      cancelled = true
    }
  }, [event.id])

  async function run(body: Record<string, unknown>) {
    setBusy(true)
    setMessage('')
    const result = await majlisAdminAction({ event_id: event.id, ...body })
    setBusy(false)
    if (result.error) {
      setMessage(result.error)
      return
    }
    onDone()
  }

  return (
    <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
      {message && <p className="text-[0.95rem] text-red-300" role="alert">{message}</p>}
      <div className="flex flex-wrap gap-2">
        {event.status === 'published' && (
          <button type="button" className={quietBtn} disabled={busy} onClick={() => void run({ action: 'hide' })}>
            Hide
          </button>
        )}
        {event.status === 'hidden' && (
          <button type="button" className={quietBtn} disabled={busy} onClick={() => void run({ action: 'unhide' })}>
            Restore
          </button>
        )}
        <button
          type="button"
          className={quietBtn}
          disabled={busy}
          onClick={() => void run({ action: 'feature', featured: !event.featured })}
        >
          {event.featured ? 'Unfeature' : 'Feature'}
        </button>
      </div>
      {(event.status === 'published' || event.status === 'hidden') && (
        <form
          className="grid gap-3"
          onSubmit={(submit) => {
            submit.preventDefault()
            if (reason.trim().length < 1) {
              setMessage('A cancellation reason is required.')
              return
            }
            void run({ action: 'cancel', reason })
          }}
        >
          <label className="block text-[0.92rem]">
            Cancellation reason
            <textarea className="mt-1 min-h-20 w-full border border-white/20 bg-transparent px-3 py-2" value={reason} onChange={(input) => setReason(input.target.value)} />
          </label>
          <button type="submit" className={`${quietBtn} w-fit`} disabled={busy}>
            Cancel majlis
          </button>
        </form>
      )}
      <form
        className="grid gap-3"
        onSubmit={(submit) => {
          submit.preventDefault()
          void run({ action: 'sponsor', sponsor_label: sponsorLabel })
        }}
      >
        <label className="block text-[0.92rem]">
          Presenting sponsor
          <input className="mt-1 min-h-11 w-full border border-white/20 bg-transparent px-3" value={sponsorLabel} onChange={(input) => setSponsorLabel(input.target.value)} />
        </label>
        <button type="submit" className={`${quietBtn} w-fit`} disabled={busy}>
          Save sponsor
        </button>
      </form>
      {(event.status === 'published' || event.status === 'hidden') && (
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(submit) => {
            submit.preventDefault()
            void run({
              action: 'update',
              starts_at: starts,
              ends_at: ends,
              venue_name: venueName,
              venue_address: venueAddress,
              region,
              focus_tags: parseFocusTags(tags),
            })
          }}
        >
          <label className="block text-[0.92rem]">
            Starts (Asia/Riyadh)
            <input className="mt-1 min-h-11 w-full border border-white/20 bg-transparent px-3" type="datetime-local" value={starts} onChange={(input) => setStarts(input.target.value)} />
          </label>
          <label className="block text-[0.92rem]">
            Ends (Asia/Riyadh)
            <input className="mt-1 min-h-11 w-full border border-white/20 bg-transparent px-3" type="datetime-local" value={ends} onChange={(input) => setEnds(input.target.value)} />
          </label>
          <label className="block text-[0.92rem]">
            Region
            <select className="mt-1 min-h-11 w-full border border-white/20 bg-transparent px-3" value={region} onChange={(input) => setRegion(input.target.value)}>
              {MAJLIS_REGIONS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="block text-[0.92rem]">
            Focus tags
            <input className="mt-1 min-h-11 w-full border border-white/20 bg-transparent px-3" value={tags} onChange={(input) => setTags(input.target.value)} />
          </label>
          <label className="block text-[0.92rem]">
            Venue name
            <input className="mt-1 min-h-11 w-full border border-white/20 bg-transparent px-3" value={venueName} onChange={(input) => setVenueName(input.target.value)} />
          </label>
          <label className="block text-[0.92rem]">
            Venue address
            <input className="mt-1 min-h-11 w-full border border-white/20 bg-transparent px-3" value={venueAddress} onChange={(input) => setVenueAddress(input.target.value)} />
          </label>
          <button type="submit" className={`${primaryBtn} w-fit`} disabled={busy}>
            Save changes
          </button>
        </form>
      )}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-[1.05rem] font-semibold">RSVPs</h3>
          <button
            type="button"
            className={quietBtn}
            disabled={!roster || roster.length === 0}
            onClick={() => {
              downloadCsv(
                'majlis-roster.csv',
                toCsv(
                  ['Name', 'Email', 'Status', 'Waitlist position', 'Registered at'],
                  (roster ?? []).map((row) => [row.full_name || '', row.email, row.status, row.waitlist_position, row.registered_at]),
                ),
              )
            }}
          >
            Download RSVP CSV
          </button>
        </div>
        {roster === null && <p className="mt-2 text-[0.92rem] text-pearl/55">Loading roster</p>}
        {rosterError && <p className="mt-2 text-[0.95rem] text-red-300" role="alert">{rosterError}</p>}
        {roster && roster.length === 0 && !rosterError && <p className="mt-2 text-[0.95rem] text-pearl/55">No guests yet.</p>}
        {roster && roster.length > 0 && (
          <ul className="mt-3 space-y-2">
            {roster.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-[0.95rem]">
                <span>
                  {row.full_name || row.email}
                  {row.full_name ? ` (${row.email})` : ''}
                  {` · ${row.status}`}
                  {row.status === 'waitlist' && row.waitlist_position ? ` ${row.waitlist_position}` : ''}
                </span>
                {row.status === 'waitlist' && (
                  <button type="button" className={quietBtn} disabled={busy} onClick={() => void run({ action: 'promote', member_id: row.member_id })}>
                    Promote
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function statusLabel(status: string): string {
  if (status === 'pending_approval') return 'Pending approval'
  if (status === 'published') return 'Published'
  if (status === 'rejected') return 'Rejected'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'hidden') return 'Hidden'
  return status
}

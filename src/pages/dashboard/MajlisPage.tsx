import { useEffect, useState, type FormEvent } from 'react'
import {
  MAJLIS_REGIONS,
  formatMajlisWhen,
  parseFocusTags,
  riyadhWallToUtc,
  validateMajlisApplication,
} from '../../../supabase/functions/_shared/majlis.ts'
import { applyForMajlis, fetchMajlisEvents, type MajlisEventRow } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'

const fieldClass =
  'mt-1 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem] text-ink'

export function MajlisPage() {
  const { member, userId } = useMember()
  const [events, setEvents] = useState<MajlisEventRow[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Majlis | Board Arabia')

  useEffect(() => {
    if (String(member.seat) === 'sponsor') return
    let cancelled = false
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
    return () => {
      cancelled = true
    }
  }, [attempt, member.seat])

  if (String(member.seat) === 'sponsor') {
    return <PermissionState tone="member" message={MEMBER_VIEWS.majlis.denied} />
  }

  const published = (events ?? []).filter((event) => event.status === 'published')
  const mine = (events ?? []).filter((event) => event.host_member_id === userId)

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Majlis</h1>
      <p className="mt-2 text-[0.98rem] leading-relaxed text-[var(--ba-muted)]">
        Approved gatherings are listed here. Apply to host, then wait for staff review.
      </p>

      <section className="mt-8" aria-labelledby="majlis-feed-title">
        <h2 id="majlis-feed-title" className="font-display text-[1.35rem] font-semibold">
          Published
        </h2>
        {events === null ? (
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
        ) : (
          <ul className="mt-4 space-y-3">
            {published.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="majlis-mine-title">
        <h2 id="majlis-mine-title" className="font-display text-[1.35rem] font-semibold">
          Your applications
        </h2>
        {events !== null && !error && mine.length === 0 && (
          <p className="mt-3 text-[0.98rem] text-[var(--ba-muted)]">You have no applications yet.</p>
        )}
        {mine.length > 0 && (
          <ul className="mt-4 space-y-3">
            {mine.map((event) => (
              <li key={event.id}>
                <EventCard event={event} showStatus />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ApplyForm
        onCreated={() => {
          setEvents(null)
          setAttempt((value) => value + 1)
        }}
      />
    </div>
  )
}

function EventCard({ event, showStatus = false }: { event: MajlisEventRow; showStatus?: boolean }) {
  return (
    <article className="border border-[var(--ba-line)] bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-[1.15rem] font-semibold">{event.title}</h3>
        {showStatus && <StatusLabel status={event.status} />}
      </div>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{event.description}</p>
      <dl className="mt-3 grid gap-2 text-[0.95rem] sm:grid-cols-2">
        <div>
          <dt className="text-[var(--ba-muted)]">Region</dt>
          <dd>{event.region}</dd>
        </div>
        <div>
          <dt className="text-[var(--ba-muted)]">When</dt>
          <dd>{formatMajlisWhen(event.starts_at, event.ends_at)}</dd>
        </div>
        <div>
          <dt className="text-[var(--ba-muted)]">Capacity</dt>
          <dd>{event.capacity}</dd>
        </div>
        <div>
          <dt className="text-[var(--ba-muted)]">Venue</dt>
          <dd>{event.venue_name}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[0.92rem]">{event.focus_tags.join(', ')}</p>
      {showStatus && event.venue_address && (
        <p className="mt-2 text-[0.92rem] text-[var(--ba-muted)]">Address: {event.venue_address}</p>
      )}
      {showStatus && event.status === 'rejected' && event.rejection_feedback && (
        <p className="mt-3 text-[0.95rem]">Staff feedback: {event.rejection_feedback}</p>
      )}
    </article>
  )
}

function StatusLabel({ status }: { status: MajlisEventRow['status'] }) {
  const label =
    status === 'pending_approval' ? 'Pending approval' : status === 'published' ? 'Published' : 'Rejected'
  return (
    <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-[var(--ba-indigo)] uppercase">{label}</p>
  )
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
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSent(false)
    const startsAtUtc = riyadhWallToUtc(starts)
    const endsAtUtc = riyadhWallToUtc(ends)
    const parsed = validateMajlisApplication({
      title,
      description,
      region,
      focusTags: parseFocusTags(tags),
      startsAtUtc: startsAtUtc ?? '',
      endsAtUtc: endsAtUtc ?? '',
      capacity: Number(capacity),
      venueName,
      venueAddress,
    })
    if (!parsed.ok) {
      setFormError(parsed.error)
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
    setSent(true)
    onCreated()
  }

  return (
    <section className="mt-10" aria-labelledby="majlis-apply-title">
      <h2 id="majlis-apply-title" className="font-display text-[1.35rem] font-semibold">
        Apply to host
      </h2>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">
        Times are Asia/Riyadh. The application stays pending until staff accept it.
      </p>
      <form className="mt-4 grid gap-4" onSubmit={(event) => void onSubmit(event)}>
        <label className="block text-[0.92rem]">
          Title
          <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label className="block text-[0.92rem]">
          Description
          <textarea
            className={`${fieldClass} min-h-28 py-2`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </label>
        <label className="block text-[0.92rem]">
          Region
          <select
            className={fieldClass}
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            required
          >
            <option value="">Choose a region</option>
            {MAJLIS_REGIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[0.92rem]">
          Focus tags
          <input
            className={fieldClass}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Governance, Audit"
            required
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-[0.92rem]">
            Starts (Asia/Riyadh)
            <input
              className={fieldClass}
              type="datetime-local"
              value={starts}
              onChange={(event) => setStarts(event.target.value)}
              required
            />
          </label>
          <label className="block text-[0.92rem]">
            Ends (Asia/Riyadh)
            <input
              className={fieldClass}
              type="datetime-local"
              value={ends}
              onChange={(event) => setEnds(event.target.value)}
              required
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
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            required
          />
        </label>
        <label className="block text-[0.92rem]">
          Venue name
          <input
            className={fieldClass}
            value={venueName}
            onChange={(event) => setVenueName(event.target.value)}
            required
          />
        </label>
        <label className="block text-[0.92rem]">
          Venue address
          <input
            className={fieldClass}
            value={venueAddress}
            onChange={(event) => setVenueAddress(event.target.value)}
            required
          />
        </label>
        <p className="text-[0.88rem] text-[var(--ba-muted)]">
          The address stays with your application. It is not shown on the published list in this slice.
        </p>
        {formError && (
          <p className="text-[0.95rem] text-[var(--ba-error)]" role="alert">
            {formError}
          </p>
        )}
        {sent && <p className="text-[0.95rem]">Application submitted. Status: pending approval.</p>}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 w-fit items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ba-primary disabled:opacity-40"
        >
          {busy ? 'Submitting' : 'Submit application'}
        </button>
      </form>
    </section>
  )
}

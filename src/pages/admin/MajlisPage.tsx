import { useEffect, useState } from 'react'
import { formatMajlisWhen, rejectionFeedbackError } from '../../../supabase/functions/_shared/majlis.ts'
import { decideMajlis, fetchMajlisEvents, supabase, type MajlisEventRow } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'

export function AdminMajlisPage() {
  const [events, setEvents] = useState<MajlisEventRow[] | null>(null)
  const [hosts, setHosts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [acting, setActing] = useState<{ id: string; decision: 'accept' | 'reject' } | null>(null)
  const [actionError, setActionError] = useState('')
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
      const pending = result.events.filter((event) => event.status === 'pending_approval')
      const ids = [...new Set(pending.map((event) => event.host_member_id))]
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
        setEvents(pending)
      }
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const pending = events ?? []
  const rejectBlocked = acting?.decision === 'reject' && rejectionFeedbackError(note) !== null

  async function confirm() {
    if (!acting) return
    if (acting.decision === 'reject' && rejectionFeedbackError(note)) {
      setActionError('Rejection feedback is required.')
      return
    }
    setBusyId(acting.id)
    setActionError('')
    const result = await decideMajlis(acting.id, acting.decision, note)
    setBusyId(null)
    if (result.error) {
      setActionError(result.error)
      return
    }
    setActing(null)
    setNote('')
    setEvents(null)
    setAttempt((value) => value + 1)
  }

  return (
    <div>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Majlis queue</h1>
      <p className="mt-2 text-[0.95rem] text-stone/65">
        Accept publishes the majlis on the member feed. Reject needs feedback.
      </p>
      {events === null ? (
        <div className="mt-6">
          <CardSkeleton tone="staff" label="Loading majlis queue" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorBanner
            tone="staff"
            message={STAFF_VIEWS.majlis.error}
            onRetry={() => {
              setEvents(null)
              setError('')
              setAttempt((value) => value + 1)
            }}
            retryLabel={STAFF_VIEWS.majlis.retry}
          />
        </div>
      ) : pending.length === 0 ? (
        <div className="mt-6">
          <EmptyState tone="staff" message={STAFF_VIEWS.majlis.empty} />
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {pending.map((event) => (
            <li key={event.id} className="border border-pearl/10 bg-pearl/[0.03] px-5 py-5">
              <p className="font-display text-[1.15rem] font-semibold">{event.title}</p>
              <p className="mt-2 text-[0.95rem] text-stone/75">{event.description}</p>
              <dl className="mt-4 grid gap-3 text-[0.92rem] md:grid-cols-2">
                <div>
                  <dt className="text-pearl/40">Host</dt>
                  <dd className="mt-0.5">{hosts[event.host_member_id] || 'Member'}</dd>
                </div>
                <div>
                  <dt className="text-pearl/40">Region</dt>
                  <dd className="mt-0.5">{event.region}</dd>
                </div>
                <div>
                  <dt className="text-pearl/40">When</dt>
                  <dd className="mt-0.5">{formatMajlisWhen(event.starts_at, event.ends_at)}</dd>
                </div>
                <div>
                  <dt className="text-pearl/40">Capacity</dt>
                  <dd className="mt-0.5">{event.capacity}</dd>
                </div>
                <div>
                  <dt className="text-pearl/40">Venue</dt>
                  <dd className="mt-0.5">{event.venue_name}</dd>
                </div>
                <div>
                  <dt className="text-pearl/40">Address</dt>
                  <dd className="mt-0.5">{event.venue_address || 'Not shown'}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[0.92rem] text-stone/80">{event.focus_tags.join(', ')}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center px-3 text-[0.68rem] font-semibold tracking-[0.06em] uppercase ba-primary"
                  onClick={() => {
                    setActing({ id: event.id, decision: 'accept' })
                    setNote('')
                    setActionError('')
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center border border-pearl/20 px-3 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/80 uppercase"
                  onClick={() => {
                    setActing({ id: event.id, decision: 'reject' })
                    setNote('')
                    setActionError('')
                  }}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {acting && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            if (!busyId) setActing(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="majlis-decision-title"
            className="shell-safe-bottom w-full max-w-md border border-white/15 bg-ink px-5 py-5 text-pearl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="majlis-decision-title" className="font-display text-[1.45rem] font-semibold">
              {acting.decision === 'accept' ? 'Accept majlis' : 'Reject majlis'}
            </h2>
            <label className="mt-4 block text-[0.92rem]" htmlFor="majlis-decision-note">
              {acting.decision === 'accept' ? 'Note (optional)' : 'Feedback (required)'}
              <textarea
                id="majlis-decision-note"
                className="mt-1 min-h-28 w-full border border-white/20 bg-transparent px-3 py-2 text-[1rem]"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                required={acting.decision === 'reject'}
              />
            </label>
            {actionError && (
              <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
                {actionError}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={Boolean(busyId)}
                className="inline-flex min-h-11 items-center border border-white/25 px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
                onClick={() => setActing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(busyId) || rejectBlocked}
                className="inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ba-primary disabled:opacity-40"
                onClick={() => void confirm()}
              >
                {acting.decision === 'accept' ? 'Publish' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

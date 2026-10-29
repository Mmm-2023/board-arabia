import { useEffect, useMemo, useState } from 'react'
import { formatMajlisWhen } from '../../../supabase/functions/_shared/majlis.ts'
import {
  fetchMajlisRequestReview,
  reviewMajlisRequest,
  saveMajlisRequestDraft,
} from '../../lib/majlisRequestReviewApi'
import {
  linkedInHref,
  requestRoleLabel,
  requestStatusLabel,
  type MajlisMailDraft,
  type MajlisRequestCard,
  type MajlisRequestStatus,
} from '../../lib/majlisRequestReview'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, FilteredZero, PermissionState } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'

const copy = STAFF_VIEWS.majlisRequests
const quietBtn =
  'inline-flex min-h-11 items-center border border-pearl/20 px-3 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/80 uppercase disabled:opacity-40'
const primaryBtn =
  'inline-flex min-h-11 items-center px-3 text-[0.68rem] font-semibold tracking-[0.06em] uppercase ba-primary disabled:opacity-40'
const fieldClass = 'mt-1 min-h-11 w-full border border-white/20 bg-transparent px-3 text-[0.95rem] text-pearl'

const FILTERS: Array<{ id: 'all' | MajlisRequestStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Needs a decision' },
  { id: 'received', label: 'Email not verified' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'waitlist', label: 'Waitlist' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'cancelled', label: 'Cancelled' },
]

type Preview = {
  requests: MajlisRequestCard[]
  drafts: MajlisMailDraft[]
  fullEventIds?: string[]
  status?: 'ready' | 'empty' | 'error' | 'loading' | 'denied'
}

export function MajlisRequestsPage({ preview }: { preview?: Preview } = {}) {
  const [requests, setRequests] = useState<MajlisRequestCard[] | null>(
    preview?.status === 'loading' || preview?.status === 'error' || preview?.status === 'denied'
      ? null
      : (preview?.requests ?? null),
  )
  const [drafts, setDrafts] = useState<MajlisMailDraft[] | null>(preview?.drafts ?? null)
  const [error, setError] = useState(preview?.status === 'error')
  const [denied, setDenied] = useState(preview?.status === 'denied')
  const [attempt, setAttempt] = useState(0)
  const [eventId, setEventId] = useState('')
  const [status, setStatus] = useState<(typeof FILTERS)[number]['id']>('all')
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [draftNote, setDraftNote] = useState('')
  const [savingKind, setSavingKind] = useState<'accept' | 'decline' | null>(null)
  useNoIndex('Majlis requests | Board Arabia')

  useEffect(() => {
    if (preview) return
    let cancelled = false
    void fetchMajlisRequestReview().then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setRequests([])
        setDrafts([])
        setDenied(Boolean(result.denied))
        setError(!result.denied)
        return
      }
      setDenied(false)
      setError(false)
      setRequests(result.requests)
      setDrafts(result.drafts)
    })
    return () => {
      cancelled = true
    }
  }, [attempt, preview])

  const loaded = requests !== null && !error && !denied
  const forEvent = useMemo(
    () => (requests ?? []).filter((row) => !eventId || row.eventId === eventId),
    [requests, eventId],
  )
  const events = useMemo(() => {
    const seen = new Map<string, string>()
    for (const row of requests ?? []) {
      if (!seen.has(row.eventId)) seen.set(row.eventId, row.eventTitle)
    }
    return [...seen.entries()].map(([id, title]) => ({ id, title }))
  }, [requests])
  const visible = forEvent.filter((row) => status === 'all' || row.status === status)
  const pending = forEvent.filter((row) => row.status === 'pending').length
  const seats = forEvent.filter((row) => row.seatHeld).length
  const waiting = forEvent.filter((row) => row.status === 'waitlist').length

  async function decide(row: MajlisRequestCard, decision: 'accepted' | 'rejected') {
    if (!row.emailVerified) return
    setBusyId(row.id)
    setNote('')
    setConfirmId(null)
    if (preview) {
      const next: MajlisRequestStatus =
        decision === 'accepted' && preview.fullEventIds?.includes(row.eventId) ? 'waitlist' : decision
      setRequests((current) =>
        (current ?? []).map((item) =>
          item.id === row.id ? { ...item, status: next, seatHeld: next === 'accepted' } : item,
        ),
      )
      setNote(next === 'waitlist' ? copy.waitlist : '')
      setBusyId(null)
      return
    }
    const result = await reviewMajlisRequest(row.id, decision)
    setBusyId(null)
    if ('error' in result) {
      if (result.denied) {
        setDenied(true)
        return
      }
      setNote(result.unverified ? copy.unverified : 'Could not save the decision. Retry.')
      return
    }
    setRequests((current) =>
      (current ?? []).map((item) =>
        item.id === row.id
          ? { ...item, status: result.status, seatHeld: result.status === 'accepted', emailVerified: true }
          : item,
      ),
    )
    setNote(result.status === 'waitlist' ? copy.waitlist : '')
  }

  async function saveDraft(kind: 'accept' | 'decline', subject: string, body: string) {
    setSavingKind(kind)
    setDraftNote('')
    if (preview) {
      setDrafts((current) =>
        (current ?? []).map((item) => (item.kind === kind ? { ...item, subject, body, sendEnabled: false } : item)),
      )
      setDraftNote(copy.saved)
      setSavingKind(null)
      return
    }
    const result = await saveMajlisRequestDraft(kind, subject, body)
    setSavingKind(null)
    if ('error' in result) {
      if (result.denied) {
        setDenied(true)
        return
      }
      setDraftNote('Could not save the draft. Retry.')
      return
    }
    setDrafts((current) =>
      (current ?? []).map((item) => (item.kind === kind ? { ...item, subject, body, sendEnabled: false } : item)),
    )
    setDraftNote(copy.saved)
  }

  return (
    <div data-shot="majlis-requests">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Requests</h1>
      <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-stone/65">
        Check fit, then accept or reject. An accepted request holds a seat. A full majlis puts the next accept on the waitlist.
      </p>

      {requests === null && !error && !denied ? <div className="mt-6"><CardSkeleton tone="staff" label="Loading majlis requests" /></div> : null}
      {denied ? (
        <div className="mt-6">
          <PermissionState tone="staff" message={copy.denied} />
        </div>
      ) : null}
      {error ? (
        <div className="mt-6">
          <ErrorBanner tone="staff" message={copy.error} onRetry={() => { setError(false); setRequests(null); setAttempt((value) => value + 1) }} retryLabel={copy.retry} />
        </div>
      ) : null}

      {loaded && requests.length === 0 ? (
        <div className="mt-6">
          <EmptyState tone="staff" message={copy.empty} action={{ label: copy.emptyAction, to: '/admin/majlis' }} />
        </div>
      ) : null}

      {loaded && requests.length > 0 ? (
        <>
          <section className="mt-6 border border-[var(--ba-copper)] bg-[var(--ba-copper)]/15 px-4 py-4 sm:px-5" aria-labelledby="majlis-request-attention">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 id="majlis-request-attention" className="font-display text-[1.35rem] font-semibold">Needs attention</h2>
              <p className="inline-flex min-h-11 items-center gap-2 text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
                <span className="inline-flex h-8 min-w-8 items-center justify-center bg-[var(--ba-copper)] px-2 text-[0.95rem] text-ink">{pending}</span>
                <span>{pending === 1 ? 'Needs a decision' : 'Need a decision'}</span>
              </p>
            </div>
          </section>

          <dl className="mt-4 grid grid-cols-3 gap-3">
            <Metric label="Needs a decision" value={pending} />
            <Metric label="Seats held" value={seats} />
            <Metric label="Waitlist" value={waiting} />
          </dl>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-end">
            <label className="block min-w-0 md:w-72">
              <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/70 uppercase">Event</span>
              <select className={fieldClass} value={eventId} onChange={(input) => setEventId(input.target.value)}>
                <option value="">All events</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>{event.title}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={status === item.id}
                  className={status === item.id ? primaryBtn : quietBtn}
                  onClick={() => setStatus(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {note ? <p className="mt-4 text-[0.95rem] text-brass-bright" role="status">{note}</p> : null}

          {visible.length === 0 ? (
            <div className="mt-4">
              <FilteredZero
                tone="staff"
                message={copy.filtered}
                clearLabel={copy.clear}
                onClear={() => { setEventId(''); setStatus('all') }}
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {visible.map((row) => (
                <li key={row.id}>
                  <RequestCard
                    row={row}
                    busy={busyId === row.id}
                    confirm={confirmId === row.id}
                    onAccept={() => void decide(row, 'accepted')}
                    onAskReject={() => setConfirmId(row.id)}
                    onCancelReject={() => setConfirmId(null)}
                    onReject={() => void decide(row, 'rejected')}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {loaded ? (
        <section className="mt-10 border border-white/15 px-4 py-4 sm:px-5" aria-labelledby="majlis-request-drafts">
          <h2 id="majlis-request-drafts" className="font-display text-[1.35rem] font-semibold">Email drafts</h2>
          <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-pearl/80">{copy.draftNotice}</p>
          {draftNote ? <p className="mt-3 text-[0.95rem] text-brass-bright" role="status">{draftNote}</p> : null}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {(drafts ?? []).map((draft) => (
              <DraftEditor
                key={draft.kind}
                draft={draft}
                saving={savingKind === draft.kind}
                onSave={(subject, body) => void saveDraft(draft.kind, subject, body)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-white/15 px-3 py-3">
      <dt className="text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/60 uppercase">{label}</dt>
      <dd className="mt-1 font-display text-[1.6rem] font-semibold">{value}</dd>
    </div>
  )
}

function RequestCard({
  row,
  busy,
  confirm,
  onAccept,
  onAskReject,
  onCancelReject,
  onReject,
}: {
  row: MajlisRequestCard
  busy: boolean
  confirm: boolean
  onAccept: () => void
  onAskReject: () => void
  onCancelReject: () => void
  onReject: () => void
}) {
  const href = linkedInHref(row.linkedin)
  const blocked = !row.emailVerified
  const showAccept = row.status !== 'cancelled' && row.status !== 'accepted'
  const showReject = row.status !== 'cancelled' && row.status !== 'rejected'
  return (
    <article className="border border-white/15 px-4 py-4" data-request-status={row.status} data-request-id={row.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[1.2rem] font-semibold">{row.fullName || 'Request'}</h3>
          <p className="mt-1 text-[0.95rem] text-pearl/80">{row.eventTitle}</p>
          <p className="text-[0.85rem] text-pearl/60">{formatMajlisWhen(row.startsAt, row.endsAt || row.startsAt)}</p>
        </div>
        <p className="inline-flex min-h-11 items-center border border-white/20 px-3 text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
          {requestStatusLabel(row.status)}
        </p>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Company" value={row.company || 'Not provided'} />
        <Field label="Role" value={row.role ? requestRoleLabel(row.role) : 'Not provided'} />
        <Field label="Phone" value={row.phone || 'Not provided'} />
        <div>
          <dt className="text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/60 uppercase">LinkedIn</dt>
          <dd className="mt-1 break-all text-[0.95rem]">
            {href ? (
              <a className="underline" href={href} target="_blank" rel="noreferrer">{href}</a>
            ) : (
              row.linkedin || 'Not provided'
            )}
          </dd>
        </div>
      </dl>
      <div className="mt-3">
        <p className="text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/60 uppercase">Why attend</p>
        <p className="mt-1 whitespace-pre-wrap text-[0.95rem] leading-relaxed">{row.why || 'Not provided'}</p>
      </div>
      <p className="mt-3 text-[0.85rem] text-pearl/70">
        {row.seatHeld ? 'Holds a seat.' : 'Does not hold a seat.'}
        {row.emailVerified ? '' : ` ${copy.unverified}`}
      </p>
      {showAccept || showReject ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {showAccept ? (
            <button type="button" className={primaryBtn} disabled={busy || blocked} onClick={onAccept}>Accept</button>
          ) : null}
          {showReject && !confirm ? (
            <button type="button" className={quietBtn} disabled={busy || blocked} onClick={onAskReject}>Reject</button>
          ) : null}
        </div>
      ) : null}
      {confirm ? (
        <div className="mt-4 border border-white/20 px-3 py-3" role="group" aria-label="Confirm reject">
          <p className="text-[0.95rem]">Reject this request? Nothing is sent.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={quietBtn} onClick={onCancelReject}>Cancel</button>
            <button type="button" className={primaryBtn} disabled={busy} onClick={onReject}>Reject</button>
          </div>
        </div>
      ) : null}
    </article>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/60 uppercase">{label}</dt>
      <dd className="mt-1 text-[0.95rem]">{value}</dd>
    </div>
  )
}

function DraftEditor({
  draft,
  saving,
  onSave,
}: {
  draft: MajlisMailDraft
  saving: boolean
  onSave: (subject: string, body: string) => void
}) {
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const title = draft.kind === 'accept' ? 'Accept email' : 'Decline email'
  return (
    <form
      className="border border-white/15 px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!subject.trim() || !body.trim()) return
        onSave(subject.trim(), body.trim())
      }}
    >
      <h3 className="font-display text-[1.05rem] font-semibold">{title}</h3>
      <label className="mt-3 block">
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/70 uppercase">Subject</span>
        <input className={fieldClass} value={subject} maxLength={160} onChange={(input) => setSubject(input.target.value)} />
      </label>
      <label className="mt-3 block">
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/70 uppercase">Message</span>
        <textarea
          className="mt-1 min-h-36 w-full border border-white/20 bg-transparent px-3 py-2 text-[0.95rem] leading-relaxed text-pearl"
          value={body}
          maxLength={4000}
          rows={8}
          onChange={(input) => setBody(input.target.value)}
        />
      </label>
      <button type="submit" className={`${primaryBtn} mt-3`} disabled={saving || !subject.trim() || !body.trim()}>
        {saving ? 'Saving...' : 'Save draft'}
      </button>
    </form>
  )
}

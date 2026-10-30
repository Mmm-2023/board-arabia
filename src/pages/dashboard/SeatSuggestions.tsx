import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { boardSeatKindLabel } from '../../lib/boardSeats.ts'
import { fetchIntroQuota, requestMemberIntro } from '../../lib/demoFetch.ts'
import { introQuotaHint, type IntroQuota } from '../../lib/memberIntros.ts'
import {
  dismissSeatMatch,
  loadMySeatSuggestions,
  loadPeopleForSeat,
  loadSeatMatch,
  restoreSeatMatch,
} from '../../lib/seatMatchApi.ts'
import {
  riyadhStamp,
  seatIntroReason,
  seatReasonText,
  SEAT_SUGGESTION_COPY,
  type SeatReason,
  type SuggestedPerson,
  type SuggestedSeat,
} from '../../lib/seatMatch.ts'

const copy = SEAT_SUGGESTION_COPY

const primaryButton =
  'inline-flex min-h-12 items-center justify-center px-4 text-[1.0625rem] font-semibold text-[var(--ba-porcelain)] bg-[var(--ba-indigo)] disabled:opacity-40'
const quietButton =
  'inline-flex min-h-11 items-center justify-center px-2 text-[1.0625rem] font-semibold text-ink underline disabled:opacity-40'

export function SuggestionDisclaimer() {
  return <p className="mt-4 max-w-xl text-[1rem] leading-relaxed text-ink/70">{copy.disclaimer}</p>
}

function Tick() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-1 size-4 shrink-0 text-ink">
      <path d="M3 8.2 6.2 11.5 13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function ReasonList({ reasons, side }: { reasons: SeatReason[]; side: 'seeker' | 'poster' }) {
  const shown = side === 'seeker' ? reasons : reasons
  return (
    <ul className="mt-3 space-y-2" aria-label={`${shown.length} reasons`}>
      {shown.map((reason) => (
        <li key={`${reason.code}-${reason.value}`} className="flex gap-2 text-[1rem] leading-relaxed text-ink">
          <Tick />
          <span>{seatReasonText(reason, side)}</span>
        </li>
      ))}
    </ul>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-[var(--ba-porcelain)] px-5 pb-6 shadow-xl"
      >
        <div className="flex min-h-11 items-center justify-center" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-ink/20" />
        </div>
        <h2 id={titleId} className="font-display text-[1.45rem] font-semibold">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
        <button type="button" className={`${quietButton} mt-4`} onClick={onClose}>
          {copy.cancel}
        </button>
      </div>
    </div>
  )
}

export function HowSuggestionsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title={copy.howTitle} onClose={onClose}>
      <p className="text-[1rem] leading-relaxed text-ink">{copy.howBody1}</p>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink">{copy.howBody2}</p>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink">{copy.howBody3}</p>
      <button type="button" className={`${primaryButton} mt-5`} onClick={onClose}>
        {copy.gotIt}
      </button>
      <SuggestionDisclaimer />
    </Sheet>
  )
}

export function AskIntroSheet({
  name,
  title,
  quota,
  busy,
  error,
  onClose,
  onSend,
}: {
  name: string
  title: string
  quota: IntroQuota | null
  busy: boolean
  error: string
  onClose: () => void
  onSend: (note: string) => void
}) {
  const fieldId = useId()
  const [note, setNote] = useState('')
  const [localError, setLocalError] = useState('')
  const limit = quota != null && quota.remaining <= 0
  const named = seatIntroReason(title, note)
  return (
    <Sheet title={copy.askTitle} onClose={onClose}>
      <p className="text-[1rem] leading-relaxed text-ink">
        {name} {copy.askBody}
      </p>
      <label className="mt-4 block text-[1rem] font-semibold text-ink" htmlFor={fieldId}>
        {copy.askLabel}
        <textarea
          id={fieldId}
          value={note}
          rows={3}
          maxLength={280}
          disabled={busy || limit}
          placeholder={copy.askPlaceholder}
          onChange={(event) => setNote(event.target.value)}
          className="mt-2 w-full border border-ink/15 bg-white px-4 py-3 text-[1rem] text-ink outline-none"
        />
      </label>
      <p className="mt-2 text-[1rem] text-ink/70">
        {copy.askHint} {note.trim().length} of 280
      </p>
      {limit ? (
        <p className="mt-3 text-[1rem] text-ink" role="status">
          You have used this month's introductions. {quota ? introQuotaHint(quota.remaining, quota.allowance) : ''}
        </p>
      ) : null}
      {localError || error ? (
        <p className="mt-3 text-[1rem] text-[var(--ba-error)]" role="alert">
          {localError || error}
        </p>
      ) : null}
      <button
        type="button"
        className={`${primaryButton} mt-4`}
        disabled={busy || limit}
        onClick={() => {
          if (!named.ok) {
            setLocalError(named.error)
            return
          }
          setLocalError('')
          onSend(note)
        }}
      >
        {copy.sendRequest}
      </button>
      <SuggestionDisclaimer />
    </Sheet>
  )
}

function SkeletonPair() {
  return (
    <div aria-busy="true" aria-label={copy.loading} className="mt-4 space-y-3">
      <p className="text-[1rem] text-ink/70">{copy.loading}</p>
      <div className="h-28 animate-pulse bg-ink/5 motion-reduce:animate-none" />
      <div className="h-28 animate-pulse bg-ink/5 motion-reduce:animate-none" />
    </div>
  )
}

export function MayFitYou({
  phase,
  seats,
  updatedAt,
  onRetry,
  onDismiss,
  onSeeAll,
  toast,
  onUndo,
}: {
  phase: 'loading' | 'error' | 'hidden' | 'not_open' | 'empty' | 'ready'
  seats: SuggestedSeat[]
  updatedAt: Date | null
  onRetry: () => void
  onDismiss: (id: string) => void
  onSeeAll: () => void
  toast: string
  onUndo: () => void
}) {
  const [how, setHow] = useState(false)
  return (
    <section className="mt-8" aria-label={copy.heading} data-may-fit-you={phase}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-[1.45rem] font-semibold">{copy.heading}</h2>
        <button type="button" className={quietButton} onClick={() => setHow(true)}>
          {copy.how}
        </button>
      </div>
      <p className="mt-2 max-w-xl text-[1rem] leading-relaxed text-ink/70">{copy.helper}</p>
      {phase === 'loading' ? <SkeletonPair /> : null}
      {phase === 'error' ? (
        <div className="mt-4 border border-[var(--ba-error)] bg-white px-4 py-4" role="alert">
          <p className="text-[1.0625rem] font-semibold text-ink">{copy.errorTitle}</p>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink">{copy.errorBody}</p>
          {updatedAt ? <p className="mt-2 text-[1rem] text-ink/70">{riyadhStamp(updatedAt)}</p> : null}
          <button type="button" className={`${primaryButton} mt-4`} onClick={onRetry}>
            {copy.errorButton}
          </button>
        </div>
      ) : null}
      {phase === 'not_open' ? (
        <div className="mt-4 border border-[var(--ba-line)] bg-white px-4 py-4">
          <p className="text-[1.0625rem] font-semibold text-ink">{copy.notOpenTitle}</p>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink">{copy.notOpenBody}</p>
          <Link to="/dashboard/profile" className={`${primaryButton} mt-4`}>
            {copy.notOpenButton}
          </Link>
        </div>
      ) : null}
      {phase === 'hidden' ? (
        <div className="mt-4 border border-[var(--ba-line)] bg-white px-4 py-4">
          <p className="text-[1.0625rem] font-semibold text-ink">{copy.hiddenTitle}</p>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink">{copy.hiddenBody}</p>
          <Link to="/dashboard/privacy" className={`${quietButton} mt-3`}>
            {copy.hiddenLink}
          </Link>
        </div>
      ) : null}
      {phase === 'empty' ? (
        <div className="mt-4 border border-[var(--ba-line)] bg-white px-4 py-4">
          <p className="text-[1.0625rem] font-semibold text-ink">{copy.noFitTitle}</p>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink">{copy.noFitBody}</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={onSeeAll}>
            {copy.noFitButton}
          </button>
          <p className="mt-3">
            <Link to="/dashboard/profile" className={quietButton}>
              {copy.noFitLink}
            </Link>
          </p>
        </div>
      ) : null}
      {phase === 'ready' ? (
        <ul className="mt-4 grid gap-3">
          {seats.slice(0, 3).map((seat) => (
            <li key={seat.id} className="border border-[var(--ba-line)] bg-white px-4 py-4" data-suggested-seat={seat.id}>
              <h3 className="font-display text-[1.25rem] font-semibold">{seat.title}</h3>
              <p className="mt-1 text-[1rem] text-ink/75">{seat.organisationName}</p>
              <p className="mt-2 text-[1rem] text-ink/70">
                {[boardSeatKindLabel(seat.seatKind), seat.sectorTag, seat.region].filter(Boolean).join(', ')}
              </p>
              <ReasonList reasons={seat.reasons.slice(0, 3)} side="seeker" />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link to={`/dashboard/deals/board-seats/${seat.id}`} className={primaryButton}>
                  {copy.viewSeat}
                </Link>
                <button type="button" className={quietButton} onClick={() => onDismiss(seat.id)}>
                  {copy.notAFit}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {phase === 'ready' ? (
        <button type="button" className={`${quietButton} mt-3`} onClick={onSeeAll}>
          {copy.seeAll}
        </button>
      ) : null}
      <SuggestionDisclaimer />
      {toast ? (
        <p className="mt-3 flex flex-wrap items-center gap-3 text-[1rem] text-ink" role="status">
          <span>{toast}</span>
          <button type="button" className={quietButton} onClick={onUndo}>
            {copy.undo}
          </button>
        </p>
      ) : null}
      {how ? <HowSuggestionsSheet onClose={() => setHow(false)} /> : null}
    </section>
  )
}

export function SeatWhyBox({
  phase,
  reasons,
  onDismiss,
}: {
  phase: 'loading' | 'error' | 'match' | 'hidden' | 'not_open' | 'empty'
  reasons: SeatReason[]
  onDismiss?: () => void
}) {
  if (phase === 'empty') return null
  return (
    <section className="mb-5 border border-[var(--ba-line)] bg-white px-4 py-4" aria-label={copy.whyTitle} data-seat-why={phase}>
      <h2 className="font-display text-[1.35rem] font-semibold">{copy.whyTitle}</h2>
      {phase === 'loading' ? <p className="mt-2 text-[1rem] text-ink/70">{copy.loading}</p> : null}
      {phase === 'error' ? <p className="mt-2 text-[1rem] text-ink">{copy.errorTitle}</p> : null}
      {phase === 'not_open' ? <p className="mt-2 text-[1rem] text-ink">{copy.notOpenBody}</p> : null}
      {phase === 'hidden' ? <p className="mt-2 text-[1rem] text-ink">{copy.hiddenBody}</p> : null}
      {phase === 'match' ? <ReasonList reasons={reasons} side="seeker" /> : null}
      {phase === 'match' && onDismiss ? (
        <button type="button" className={`${quietButton} mt-3`} onClick={onDismiss}>
          {copy.notAFit}
        </button>
      ) : null}
      <SuggestionDisclaimer />
    </section>
  )
}

export function PeopleWhoMayFit({
  phase,
  people,
  quota,
  onDismiss,
  onAsk,
}: {
  phase: 'loading' | 'error' | 'pending' | 'empty' | 'ready'
  people: SuggestedPerson[]
  quota: IntroQuota | null
  onDismiss: (userId: string) => void
  onAsk: (person: SuggestedPerson) => void
}) {
  const limit = quota != null && quota.remaining <= 0
  return (
    <section className="mt-6 border-t border-[var(--ba-line)] pt-5" aria-label={copy.peopleHeading} data-people-may-fit={phase}>
      <h2 className="font-display text-[1.35rem] font-semibold">{copy.peopleHeading}</h2>
      <p className="mt-2 max-w-xl text-[1rem] leading-relaxed text-ink/70">{copy.peopleHelper}</p>
      {phase === 'loading' ? <SkeletonPair /> : null}
      {phase === 'error' ? (
        <p className="mt-3 text-[1rem] text-ink" role="alert">
          {copy.errorTitle}
        </p>
      ) : null}
      {phase === 'pending' ? (
        <div className="mt-4">
          <p className="text-[1.0625rem] font-semibold text-ink">{copy.posterPendingTitle}</p>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink">{copy.posterPendingBody}</p>
          <Link to="/dashboard/deals/board-seats" className={`${primaryButton} mt-4`}>
            {copy.posterPendingButton}
          </Link>
        </div>
      ) : null}
      {phase === 'empty' ? (
        <div className="mt-4">
          <p className="text-[1.0625rem] font-semibold text-ink">{copy.posterNoneTitle}</p>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink">{copy.posterNoneBody}</p>
          <Link to="/dashboard/people/directory" className={`${primaryButton} mt-4`}>
            {copy.posterNoneButton}
          </Link>
        </div>
      ) : null}
      {phase === 'ready' ? (
        <ul className="mt-4 grid gap-3">
          {people.slice(0, 10).map((person) => (
            <li key={person.userId} className="border border-[var(--ba-line)] px-4 py-4" data-suggested-person={person.userId}>
              <p className="text-[1rem] font-semibold text-ink">{person.name}</p>
              <p className="mt-1 text-[1rem] text-ink/75">{[person.headline, person.company].filter(Boolean).join('. ')}</p>
              <ReasonList reasons={person.reasons.slice(0, 3)} side="poster" />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {person.introStatus === 'pending' || person.introStatus === 'accepted' ? (
                  <p className="inline-flex min-h-12 items-center text-[1rem] font-semibold text-ink">{copy.requestSent}</p>
                ) : (
                  <button type="button" className={primaryButton} disabled={limit} onClick={() => onAsk(person)}>
                    {copy.requestIntro}
                  </button>
                )}
                <button type="button" className={quietButton} onClick={() => onDismiss(person.userId)}>
                  {copy.notAFit}
                </button>
              </div>
              {limit && person.introStatus == null ? (
                <p className="mt-2 text-[1rem] text-ink/70">You have used this month's introductions.</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <SuggestionDisclaimer />
    </section>
  )
}

function useUndoToast(message: string) {
  const [toast, setToast] = useState('')
  const [undo, setUndo] = useState<(() => void) | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => {
      setToast('')
      setUndo(null)
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [toast])
  return {
    toast,
    onUndo: () => {
      undo?.()
      setToast('')
      setUndo(null)
    },
    push(nextUndo: () => void) {
      setToast(message)
      setUndo(() => nextUndo)
    },
  }
}

export function LiveMayFitYou() {
  const [phase, setPhase] = useState<'off' | 'loading' | 'error' | 'hidden' | 'not_open' | 'empty' | 'ready'>('off')
  const [seats, setSeats] = useState<SuggestedSeat[]>([])
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [attempt, setAttempt] = useState(0)
  const undo = useUndoToast(copy.toastSeeker)

  useEffect(() => {
    let cancelled = false
    setPhase('loading')
    void loadMySeatSuggestions().then((result) => {
      if (cancelled) return
      const stamp = new Date()
      setUpdatedAt(stamp)
      if (!result.ok) {
        setPhase('error')
        return
      }
      if (!result.enabled || result.state === 'off') {
        setPhase('off')
        return
      }
      if (result.state === 'hidden') {
        setPhase('hidden')
        return
      }
      if (result.state === 'not_open') {
        setPhase('not_open')
        return
      }
      setSeats(result.seats)
      setPhase(result.seats.length === 0 ? 'empty' : 'ready')
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (phase === 'off') return null
  return (
    <MayFitYou
      phase={phase}
      seats={seats}
      updatedAt={updatedAt}
      toast={undo.toast}
      onUndo={undo.onUndo}
      onRetry={() => setAttempt((value) => value + 1)}
      onSeeAll={() => document.getElementById('all-board-seats')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      onDismiss={(id) => {
        const previous = seats
        setSeats((rows) => rows.filter((seat) => seat.id !== id))
        void dismissSeatMatch(id).then((error) => {
          if (error) {
            setSeats(previous)
            return
          }
          undo.push(() => {
            void restoreSeatMatch(id).then(() => setAttempt((value) => value + 1))
          })
        })
      }}
    />
  )
}

export function LiveSeatWhy({ seatId, onDismissed }: { seatId: string; onDismissed?: () => void }) {
  const [phase, setPhase] = useState<'off' | 'loading' | 'error' | 'match' | 'hidden' | 'not_open' | 'empty'>('off')
  const [reasons, setReasons] = useState<SeatReason[]>([])

  useEffect(() => {
    let cancelled = false
    setPhase('loading')
    void loadSeatMatch(seatId).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setPhase('error')
        return
      }
      if (!result.enabled || result.state === 'off' || result.state === 'own' || result.state === 'none') {
        setPhase(result.enabled && result.state !== 'off' && result.state !== 'own' ? 'empty' : 'off')
        return
      }
      if (result.state === 'hidden' || result.state === 'not_open') {
        setPhase(result.state)
        return
      }
      if (result.state === 'match' && result.reasons.length > 0) {
        setReasons(result.reasons)
        setPhase('match')
        return
      }
      setPhase('empty')
    })
    return () => {
      cancelled = true
    }
  }, [seatId])

  if (phase === 'off') return null
  return (
    <SeatWhyBox
      phase={phase === 'loading' ? 'loading' : phase}
      reasons={reasons}
      onDismiss={
        phase === 'match'
          ? () => {
              void dismissSeatMatch(seatId).then((error) => {
                if (error) return
                setPhase('empty')
                onDismissed?.()
              })
            }
          : undefined
      }
    />
  )
}

export function LivePeopleWhoMayFit({
  seatId,
  published,
  seatTitle,
}: {
  seatId: string
  published: boolean
  seatTitle: string
}) {
  const [phase, setPhase] = useState<'off' | 'loading' | 'error' | 'pending' | 'empty' | 'ready'>('off')
  const [people, setPeople] = useState<SuggestedPerson[]>([])
  const [quota, setQuota] = useState<IntroQuota | null>(null)
  const [ask, setAsk] = useState<SuggestedPerson | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const undo = useUndoToast(copy.toastPoster)

  useEffect(() => {
    let cancelled = false
    setPhase('loading')
    void Promise.all([loadPeopleForSeat(seatId), fetchIntroQuota()]).then(([result, nextQuota]) => {
      if (cancelled) return
      setQuota(nextQuota)
      if (!result.ok) {
        setPhase('error')
        return
      }
      if (!result.enabled || result.state === 'off') {
        setPhase('off')
        return
      }
      if (result.state === 'not_published' || !published) {
        setPhase('pending')
        return
      }
      setPeople(result.people)
      setPhase(result.people.length === 0 ? 'empty' : 'ready')
    })
    return () => {
      cancelled = true
    }
  }, [attempt, published, seatId])

  if (phase === 'off') return null
  return (
    <>
      <PeopleWhoMayFit
        phase={phase}
        people={people}
        quota={quota}
        onDismiss={(userId) => {
          const previous = people
          setPeople((rows) => rows.filter((person) => person.userId !== userId))
          void dismissSeatMatch(seatId, userId).then((dismissError) => {
            if (dismissError) {
              setPeople(previous)
              return
            }
            undo.push(() => {
              void restoreSeatMatch(seatId, userId).then(() => setAttempt((value) => value + 1))
            })
          })
        }}
        onAsk={setAsk}
      />
      {undo.toast ? (
        <p className="mt-3 flex flex-wrap items-center gap-3 text-[1rem] text-ink" role="status">
          <span>{undo.toast}</span>
          <button type="button" className={quietButton} onClick={undo.onUndo}>
            {copy.undo}
          </button>
        </p>
      ) : null}
      {notice ? <p className="mt-3 text-[1rem] text-ink">{notice}</p> : null}
      {ask ? (
        <AskIntroSheet
          name={ask.name}
          title={seatTitle}
          quota={quota}
          busy={busy}
          error={error}
          onClose={() => {
            setAsk(null)
            setError('')
          }}
          onSend={(note) => {
            const named = seatIntroReason(seatTitle, note)
            if (!named.ok) {
              setError(named.error)
              return
            }
            const person = ask
            setBusy(true)
            setError('')
            void requestMemberIntro(person.userId, named.reason, false).then((requestError) => {
              setBusy(false)
              if (requestError) {
                setError(requestError)
                return
              }
              setPeople((rows) =>
                rows.map((row) => (row.userId === person.userId ? { ...row, introStatus: 'pending' } : row)),
              )
              setAsk(null)
              setNotice(`Request sent. ${person.name} ${copy.sentDone}`)
            })
          }}
        />
      ) : null}
    </>
  )
}

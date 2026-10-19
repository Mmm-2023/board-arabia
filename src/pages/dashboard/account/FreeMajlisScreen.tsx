import { useEffect, useState } from 'react'
import { formatUpdated } from '../../../shell/destinations'
import {
  formatMajlisWhen,
  presentFreeMajlis,
  safeJoinUrl,
  statusLabel,
  type FreeMajlisRow,
} from '../../../lib/freeMajlis'
import { supabase } from '../../../lib/supabase'

const card = 'border border-[var(--ba-line)] bg-white px-5 py-5'

export function FreeMajlisPanel({
  state,
  rows,
  updatedLabel,
  onRetry,
}: {
  state: 'loading' | 'ready' | 'empty' | 'error'
  rows: FreeMajlisRow[]
  updatedLabel: string | null
  onRetry: () => void
}) {
  const join = rows.find((row) => row.status === 'accepted' && row.joinUrl)
  return (
    <section data-screen="free-majlis" aria-labelledby="free-majlis-title">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Your requests</p>
      <h2 id="free-majlis-title" className="mt-2 font-display text-[1.7rem] font-semibold tracking-[-0.03em]">
        Your majlis
      </h2>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/75">
        A free account can ask to attend. Our admin team reviews a request only after you confirm your email. This page lists your requests only.
      </p>
      {updatedLabel ? <p className="mt-2 text-[0.92rem] text-ink/55">{updatedLabel}</p> : null}

      {state === 'loading' ? (
        <div className="mt-6 space-y-3" aria-busy="true" data-state="loading">
          <p className="text-[1rem] text-ink/60">Loading your requests.</p>
          <div className={`${card} h-24 bg-[var(--ba-lavender-mist)]`} />
          <div className={`${card} h-24 bg-[var(--ba-lavender-mist)]`} />
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="mt-6" data-state="error" role="alert">
          <p className="text-[1rem] text-ink/75">Could not load your requests.</p>
          {updatedLabel ? <p className="mt-2 text-[0.92rem] text-ink/55">{updatedLabel}</p> : null}
          <button
            type="button"
            className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      ) : null}

      {state === 'empty' ? (
        <div className={`${card} mt-6`} data-state="empty">
          <p className="text-[1rem] leading-relaxed text-ink/75">You have no majlis requests yet.</p>
          <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/60">
            When you register for a majlis, the request shows here. Full member gatherings stay locked below.
          </p>
        </div>
      ) : null}

      {state === 'ready' ? (
        <div className="mt-6 space-y-4">
          {join ? (
            <div className={`${card} border-s-2 border-s-[var(--ba-indigo)]`} data-join="ready">
              <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Needs attention</p>
              <p className="mt-2 font-display text-[1.25rem] font-semibold">{join.title}</p>
              <p className="mt-1 text-[0.98rem] text-ink/70">{formatMajlisWhen(join.startsAt)} Asia/Riyadh</p>
              <a
                className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
                href={join.joinUrl || undefined}
              >
                Join
              </a>
            </div>
          ) : null}
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className={card} data-application={row.status}>
                <p className="font-display text-[1.15rem] font-semibold">{row.title}</p>
                <p className="mt-1 text-[0.98rem] text-ink/70">{formatMajlisWhen(row.startsAt)}</p>
                <p className="mt-2 text-[0.95rem]">{statusLabel(row.status)}</p>
                {row.status === 'accepted' && !row.joinUrl ? (
                  <p className="mt-2 text-[0.95rem] text-ink/60">Your place is confirmed. The Join link appears here when it is ready.</p>
                ) : null}
                {row.status === 'received' ? (
                  <p className="mt-2 text-[0.95rem] text-ink/60">Confirm your email before this request can be reviewed.</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export function FreeMajlisScreen() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<FreeMajlisRow[]>([])
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    void supabase.rpc('my_majlis_applications').then(async ({ data, error }) => {
      if (cancelled) return
      if (error) {
        setState('error')
        setUpdatedLabel(formatUpdated(new Date()))
        return
      }
      const listed = presentFreeMajlis(data)
      const joins: Record<string, unknown> = {}
      await Promise.all(
        listed
          .filter((row) => row.status === 'accepted')
          .map(async (row) => {
            const result = await supabase.rpc('majlis_join_for_me', { p_event: row.eventId })
            const payload = result.data
            const url =
              payload && typeof payload === 'object' && 'join_url' in payload
                ? (payload as { join_url?: unknown }).join_url
                : null
            joins[row.eventId] = safeJoinUrl(url)
          }),
      )
      if (cancelled) return
      const next = presentFreeMajlis(data, joins)
      setRows(next)
      setUpdatedLabel(formatUpdated(new Date()))
      setState(next.length === 0 ? 'empty' : 'ready')
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <FreeMajlisPanel
      state={state}
      rows={rows}
      updatedLabel={updatedLabel}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
}

import { useEffect, useState } from 'react'
import { presentDeskIntros, type DeskIntroRow } from '../../lib/deskIntros'
import { schemaMissing } from '../../lib/demoRows'
import { cleanDeskIntroNote } from '../../lib/memberIntros'
import { supabase } from '../../lib/supabase'
import { toneClasses } from '../../shell/ViewState'

const SAVE_FAILED = 'Could not mark that introduction sent. Retry.'
const SAMPLE = 'Sample requests stay as they are.'

export function DeskIntrosQueue() {
  const [rows, setRows] = useState<DeskIntroRow[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [decideError, setDecideError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_list_desk_intros').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        if (schemaMissing(error.message)) {
          setRows([])
          setLoadError(false)
          return
        }
        setLoadError(true)
        setRows([])
        return
      }
      setLoadError(false)
      setRows(presentDeskIntros(data))
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function markSent(id: string, note: string) {
    const cleaned = cleanDeskIntroNote(note)
    if (!cleaned.ok) {
      setDecideError(cleaned.error)
      return
    }
    const row = rows?.find((item) => item.id === id)
    if (row?.is_demo) return
    setBusyId(id)
    setDecideError('')
    const { error } = await supabase.rpc('staff_mark_desk_intro_sent', {
      p_intro_id: id,
      p_note: cleaned.note,
    })
    setBusyId(null)
    if (error) {
      setDecideError(/sample_blocked/i.test(error.message) ? SAMPLE : SAVE_FAILED)
      return
    }
    setAttempt((value) => value + 1)
  }

  return (
    <DeskIntrosQueueView
      rows={rows}
      loadError={loadError}
      decideError={decideError}
      busyId={busyId}
      onMark={(id, note) => void markSent(id, note)}
      onRetry={() => {
        setLoadError(false)
        setRows(null)
        setAttempt((value) => value + 1)
      }}
    />
  )
}

export function DeskIntrosQueueView({
  rows,
  loadError,
  decideError,
  busyId,
  onMark,
  onRetry,
}: {
  rows: DeskIntroRow[] | null
  loadError: boolean
  decideError: string
  busyId: string | null
  onMark: (id: string, note: string) => void
  onRetry: () => void
}) {
  const styles = toneClasses('staff')
  return (
    <section id="desk-intros" aria-label="Admin intros" className="scroll-mt-24">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>Admin intros</h2>
      <p className={`mt-2 max-w-2xl text-[0.95rem] ${styles.muted}`}>
        Accepted requests that asked our admin team to introduce both people. Mark Intro sent when the introduction has gone out.
      </p>
      {rows == null ? <p className={`mt-4 ${styles.muted}`}>Loading admin intros.</p> : null}
      {loadError ? (
        <div className="mt-4">
          <p className={styles.alert} role="alert">
            Could not load admin introductions.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-11 items-center border border-pearl/30 px-4 text-[0.95rem] text-pearl"
          >
            Retry
          </button>
        </div>
      ) : null}
      {rows && rows.length === 0 && !loadError ? (
        <p className={`mt-4 ${styles.muted}`}>No admin introductions are waiting.</p>
      ) : null}
      {rows && rows.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <DeskIntroCard row={row} busy={busyId === row.id} onMark={onMark} />
            </li>
          ))}
        </ul>
      ) : null}
      {decideError ? (
        <p className={`mt-3 ${styles.alert}`} role="alert">
          {decideError}
        </p>
      ) : null}
    </section>
  )
}

function DeskIntroCard({
  row,
  busy,
  onMark,
}: {
  row: DeskIntroRow
  busy: boolean
  onMark: (id: string, note: string) => void
}) {
  const styles = toneClasses('staff')
  const [note, setNote] = useState('')
  const queued = row.desk_status === 'queued' && !row.is_demo
  return (
    <article className={`${styles.panel} px-4 py-4`} data-desk-status={row.desk_status}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[1.2rem] font-semibold text-pearl">
          {row.requester_name} and {row.target_name}
        </h3>
        <p className="text-[0.85rem] text-pearl/70">{row.desk_status === 'sent' ? 'Intro sent' : 'Queued'}</p>
      </div>
      {row.reason ? <p className={`mt-2 text-[0.95rem] leading-relaxed ${styles.muted}`}>{row.reason}</p> : null}
      {row.is_demo ? <p className={`mt-2 text-[0.92rem] ${styles.muted}`}>Sample cards stay as they are.</p> : null}
      {row.desk_status === 'sent' && row.desk_note ? (
        <p className={`mt-3 text-[0.95rem] leading-relaxed text-pearl/85`}>{row.desk_note}</p>
      ) : null}
      {queued ? (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault()
            onMark(row.id, note)
          }}
        >
          <label className="block text-[0.95rem] text-pearl/80" htmlFor={`desk-note-${row.id}`}>
            Optional note
            <textarea
              id={`desk-note-${row.id}`}
              value={note}
              maxLength={280}
              rows={2}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
              className="mt-2 w-full border border-pearl/20 bg-ink px-3 py-3 text-[1rem] text-pearl outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="ba-primary mt-3 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Intro sent'}
          </button>
        </form>
      ) : null}
    </article>
  )
}

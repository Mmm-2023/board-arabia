import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadDueDiligenceDesk, type HistoryItem } from '../../lib/dueDiligence'
import { recentReports, type RecentReportRow } from '../../lib/recentReports'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { CardSkeleton, ErrorBanner } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'

const DELETED = 'Report deleted.'
const DELETE_FAILED = 'Could not delete that report. Retry.'

export function AiToolsHome() {
  const { userId } = useMember()
  const [reports, setReports] = useState<HistoryItem[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [alert, setAlert] = useState('')
  useNoIndex('AI tools | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void loadDueDiligenceDesk(userId).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setReports([])
        setError(true)
        return
      }
      setError(false)
      setReports(result.reports)
    })
    return () => {
      cancelled = true
    }
  }, [attempt, userId])

  const rows = reports ? recentReports(reports) : null

  async function confirmDelete() {
    if (!pendingId) return
    setBusy(true)
    setNotice('')
    setAlert('')
    const { error: rpcError } = await supabase.rpc('delete_own_due_diligence_report', {
      p_report_id: pendingId,
    })
    setBusy(false)
    if (rpcError) {
      setPendingId(null)
      setAlert(DELETE_FAILED)
      return
    }
    const removed = pendingId
    setPendingId(null)
    setReports((current) => (current ? current.filter((report) => report.id !== removed) : current))
    setNotice(DELETED)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">AI tools</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
        Live tools only. Each one says what it checks and what it will not do.
      </p>
      <ul className="mt-8 space-y-3">
        <li>
          <Link
            to="/dashboard/ai/due-diligence"
            className="group flex min-h-11 items-center gap-4 border border-[var(--ba-line)] bg-white px-4 py-4 transition-colors hover:border-[var(--ba-indigo)] hover:bg-[var(--ba-lavender-mist)] focus-visible:ring-2 focus-visible:ring-[var(--ba-indigo)] focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <span className="min-w-0 flex-1">
              <span className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">
                AI Due Diligence
              </span>
              <span className="mt-2 block text-[1rem] leading-relaxed text-ink/65">
                Public source review of a pitch deck. Not legal advice.
              </span>
              <span className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[1rem] font-semibold">
                Start a check
              </span>
            </span>
            <Chevron />
          </Link>
        </li>
      </ul>
      <section className="mt-10" aria-label="Recent reports">
        <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">Recent reports</h2>
        {notice ? <p className="mt-3 text-[1rem] text-ink">{notice}</p> : null}
        {alert ? (
          <p className="mt-3 text-[1rem] text-[var(--ba-error)]" role="alert">
            {alert}
          </p>
        ) : null}
        {reports === null ? (
          <div className="mt-4">
            <CardSkeleton tone="member" label="Loading reports" />
          </div>
        ) : null}
        {error ? (
          <div className="mt-4">
            <ErrorBanner
              tone="member"
              message={MEMBER_VIEWS.dueDiligence.error}
              retryLabel={MEMBER_VIEWS.dueDiligence.retry}
              onRetry={() => {
                setReports(null)
                setAttempt((value) => value + 1)
              }}
            />
          </div>
        ) : null}
        {rows && rows.length === 0 && !error ? (
          <p className="mt-3 text-[1rem] text-ink/60">No reports yet. Open AI Due Diligence to run a check.</p>
        ) : null}
        {rows && rows.length > 0 ? (
          <RecentReportList rows={rows} onDelete={setPendingId} />
        ) : null}
      </section>
      {pendingId ? (
        <ConfirmDialog
          tone="member"
          title="Delete this report?"
          body="This removes the report, the check, and the uploaded deck."
          busy={busy}
          onCancel={() => {
            if (!busy) setPendingId(null)
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  )
}

export function RecentReportList({
  rows,
  onDelete,
}: {
  rows: readonly RecentReportRow[]
  onDelete: (id: string) => void
}) {
  return (
    <ul className="mt-4 space-y-3">
      {rows.map((report) => (
        <li key={report.id} className="flex items-stretch border border-[var(--ba-line)] bg-white">
          <Link
            to={`/dashboard/ai/due-diligence/${report.id}`}
            className="flex min-h-11 min-w-0 flex-1 flex-col justify-center px-4 py-3"
          >
            <span className="text-[1rem] text-ink">{report.title}</span>
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 items-center border-s border-[var(--ba-line)] px-4 text-[0.95rem] font-semibold text-ink"
            onClick={() => onDelete(report.id)}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  )
}

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-[var(--ba-indigo)]" fill="none">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

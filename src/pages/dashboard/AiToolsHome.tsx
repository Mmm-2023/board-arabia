import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadDueDiligenceDesk, type HistoryItem } from '../../lib/dueDiligence'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, ErrorBanner } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'

export function AiToolsHome() {
  const { userId } = useMember()
  const [reports, setReports] = useState<HistoryItem[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
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
            className="block min-h-11 border border-[var(--ba-line)] bg-white px-4 py-4"
          >
            <span className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">
              AI Due Diligence
            </span>
            <span className="mt-2 block text-[1rem] leading-relaxed text-ink/65">
              Public source review of a pitch deck. Not legal advice.
            </span>
          </Link>
        </li>
      </ul>
      <section className="mt-10" aria-label="Recent reports">
        <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">Recent reports</h2>
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
        {reports && reports.length === 0 && !error ? (
          <p className="mt-3 text-[1rem] text-ink/60">No reports yet. Open AI Due Diligence to run a check.</p>
        ) : null}
        {reports && reports.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {reports.map((report) => (
              <li key={report.id}>
                <Link
                  to={`/dashboard/ai/due-diligence/${report.id}`}
                  className="flex min-h-11 flex-col justify-center border border-[var(--ba-line)] bg-white px-4 py-3"
                >
                  <span className="text-[1rem] text-ink">{report.company_label || report.file_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}

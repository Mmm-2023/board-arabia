import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  DECK_BUCKET,
  DECK_MAX_BYTES,
  deckExtension,
  isUuid,
  MEMBER_MESSAGES,
  parsePublicHttpsUrl,
  presentReport,
  safeFileName,
  sniffDeck,
  VERDICT_LABEL,
  type FindingRow,
  type PresentedReport,
  type SourceLink,
} from '../../../supabase/functions/_shared/due_diligence.ts'
import {
  fetchDueDiligenceStatus,
  loadDueDiligenceDesk,
  loadDueDiligenceReport,
  startDueDiligence,
  uploadPath,
  type HistoryItem,
  type ReadFailure,
} from '../../lib/dueDiligence'
import { deskPhase } from '../../lib/dueDiligencePhase'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'

const fieldClass =
  'mt-1 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem] text-ink'
const buttonClass =
  'ba-primary inline-flex min-h-11 items-center justify-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40'
const quietButtonClass =
  'inline-flex min-h-11 items-center justify-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-40'

export function DueDiligencePage() {
  const { reportId } = useParams()
  useNoIndex('AI Due Diligence | Board Arabia')
  if (reportId) return <ReportView key={reportId} reportId={reportId} />
  return <Desk />
}

function Desk() {
  const { userId } = useMember()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | ReadFailure>('loading')
  const [reports, setReports] = useState<HistoryItem[]>([])
  const [attempt, setAttempt] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [companyUrl, setCompanyUrl] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [jobError, setJobError] = useState('')

  useEffect(() => {
    let cancelled = false
    void loadDueDiligenceDesk(userId).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setLoadState(result.kind)
        return
      }
      setReports(result.reports)
      setActiveJobId(result.activeJobId)
      setProgress(result.progress)
      setStage(result.stage)
      setJobError(result.failedMessage || '')
      setLoadState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [attempt, userId])

  useEffect(() => {
    if (!activeJobId) return
    let cancelled = false
    async function tick() {
      const result = await fetchDueDiligenceStatus(activeJobId as string)
      if (cancelled) return
      if (!result.ok) return
      setProgress(result.progress)
      setStage(result.stage)
      if (result.reportId) {
        navigate(`/dashboard/due-diligence/${result.reportId}`)
        return
      }
      if (result.status === 'failed') {
        setJobError(result.error || MEMBER_MESSAGES.finish)
        setActiveJobId(null)
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeJobId, navigate])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    setJobError('')
    if (!file) {
      setFormError(MEMBER_MESSAGES.file)
      return
    }
    const ext = deckExtension(file.name)
    if (!ext || file.size <= 0 || file.size > DECK_MAX_BYTES) {
      setFormError(MEMBER_MESSAGES.file)
      return
    }
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    if (sniffDeck(head) !== ext) {
      setFormError(MEMBER_MESSAGES.notDeck)
      return
    }
    const url = companyUrl.trim()
    if (url && !parsePublicHttpsUrl(url).ok) {
      setFormError(MEMBER_MESSAGES.url)
      return
    }
    const deckId = crypto.randomUUID()
    const storagePath = uploadPath(userId, deckId, ext)
    if (!storagePath) {
      setFormError(MEMBER_MESSAGES.start)
      return
    }
    setBusy(true)
    const contentType =
      ext === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    const uploaded = await supabase.storage.from(DECK_BUCKET).upload(storagePath, file, {
      contentType,
      upsert: false,
    })
    if (uploaded.error) {
      setBusy(false)
      setFormError(MEMBER_MESSAGES.upload)
      return
    }
    const started = await startDueDiligence({
      deckId,
      storagePath,
      fileName: safeFileName(file.name, ext),
      companyUrl: url || null,
    })
    setBusy(false)
    if (!started.ok) {
      setFormError(started.kind === 'unavailable' ? MEMBER_VIEWS.dueDiligence.unavailable : started.error)
      if (started.kind === 'denied') setLoadState('denied')
      return
    }
    setJobError('')
    setProgress(5)
    setStage('Queued')
    setActiveJobId(started.jobId)
  }

  const phase = deskPhase({
    loadState,
    activeJob: Boolean(activeJobId),
    jobError: Boolean(jobError),
    fileChosen: Boolean(file),
    reportCount: reports.length,
  })

  return (
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
        AI Due Diligence
      </p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">AI Due Diligence</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
        Upload a pitch deck. Board Arabia compares its claims with public pages and leaves the
        decision with you.
      </p>

      <div className="mt-8">
        {phase === 'loading' ? <CardSkeleton tone="member" label="Loading AI Due Diligence" /> : null}
        {phase === 'denied' ? (
          <PermissionState tone="member" message={MEMBER_VIEWS.dueDiligence.denied} />
        ) : null}
        {phase === 'load-error' ? (
          <ErrorBanner
            tone="member"
            message={
              loadState === 'unavailable'
                ? MEMBER_VIEWS.dueDiligence.unavailable
                : MEMBER_VIEWS.dueDiligence.error
            }
            onRetry={() => {
              setLoadState('loading')
              setAttempt((value) => value + 1)
            }}
            retryLabel={MEMBER_VIEWS.dueDiligence.retry}
          />
        ) : null}
        {phase === 'running' ? (
          <div className="border border-[var(--ba-line)] bg-white px-4 py-4" aria-live="polite">
            <p className="text-[0.95rem] text-ink">{stage || 'Queued'}</p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label={stage || 'Queued'}
              className="mt-3 h-2 bg-[var(--ba-lavender-mist)]"
            >
              <div className="h-2 bg-[var(--ba-indigo)]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
        {phase === 'job-error' ? (
          <ErrorBanner
            tone="member"
            message={jobError}
            onRetry={() => setJobError('')}
            retryLabel="Dismiss"
          />
        ) : null}
        {phase === 'file-chosen' ? (
          <p className="border border-[var(--ba-line)] bg-white px-4 py-3 text-[0.98rem] text-ink">
            {MEMBER_VIEWS.dueDiligence.ready}
          </p>
        ) : null}
        {phase === 'idle-empty' ? (
          <EmptyState tone="member" message={MEMBER_VIEWS.dueDiligence.empty} />
        ) : null}
      </div>

      {loadState === 'ready' ? (
        <>
          <form onSubmit={(event) => void onSubmit(event)} className="mt-8 max-w-xl">
            <label className="block text-[0.95rem] text-ink" htmlFor="dd-file-button">
              Pitch deck
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="sr-only"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setFormError('')
                setJobError('')
              }}
            />
            <button
              id="dd-file-button"
              type="button"
              className={`${file ? quietButtonClass : buttonClass} mt-2`}
              disabled={busy || Boolean(activeJobId)}
              onClick={() => fileRef.current?.click()}
            >
              Choose PDF or PPTX
            </button>
            {file ? <p className="mt-2 truncate text-[0.92rem] text-[var(--ba-muted)]">{file.name}</p> : null}
            <p className="mt-2 text-[0.92rem] leading-relaxed text-[var(--ba-muted)]">PDF or PPTX, up to 15 MB.</p>

            {file ? (
              <button type="submit" className={`${buttonClass} mt-4`} disabled={busy || Boolean(activeJobId)}>
                {busy ? 'Uploading' : 'Check this deck'}
              </button>
            ) : null}

            <label className="mt-6 block text-[0.95rem] text-ink/80" htmlFor="dd-url">
              Company site, optional
            </label>
            <input
              id="dd-url"
              value={companyUrl}
              onChange={(event) => setCompanyUrl(event.target.value)}
              type="url"
              inputMode="url"
              placeholder="https://"
              autoComplete="url"
              className={fieldClass}
              disabled={busy || Boolean(activeJobId)}
            />
            <p className="mt-2 text-[0.92rem] leading-relaxed text-[var(--ba-muted)]">
              A public https page. Private data rooms are not used.
            </p>

            {formError ? (
              <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
                {formError}
              </p>
            ) : null}
          </form>

          {reports.length > 0 ? (
            <section className="mt-10" aria-labelledby="dd-history">
              <h2 id="dd-history" className="font-display text-[1.35rem] font-semibold">
                Prior notes
              </h2>
              <ul className="mt-4 space-y-3">
                {reports.map((report) => (
                  <li key={report.id}>
                    <Link
                      to={`/dashboard/due-diligence/${report.id}`}
                      className="flex min-h-11 flex-col justify-center border border-[var(--ba-line)] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-[1rem] text-ink">{report.company_label}</span>
                      <span className="text-[0.92rem] text-[var(--ba-muted)]">
                        {report.publicly_consistent_pct === null
                          ? 'No percentage'
                          : `${report.publicly_consistent_pct}% publicly consistent`}
                        {' · '}
                        {formatWhen(report.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ReportView({ reportId }: { reportId: string }) {
  const validId = isUuid(reportId)
  const [state, setState] = useState<'loading' | 'ready' | ReadFailure | 'missing'>(
    validId ? 'loading' : 'missing',
  )
  const [attempt, setAttempt] = useState(0)
  const [fileName, setFileName] = useState('')
  const [createdAt, setCreatedAt] = useState('')
  const [report, setReport] = useState<Awaited<ReturnType<typeof loadDueDiligenceReport>> | null>(null)

  useEffect(() => {
    if (!validId) return
    let cancelled = false
    void loadDueDiligenceReport(reportId.toLowerCase()).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setState(result.kind)
        setReport(null)
        return
      }
      setFileName(result.fileName)
      setCreatedAt(result.createdAt)
      setReport(result)
      setState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [attempt, reportId, validId])

  const ready = state === 'ready' && report && report.ok ? report : null
  const presented = ready ? presentReport(ready.report, fileName) : null

  return (
    <div className="max-w-5xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
        AI Due Diligence
      </p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">
        {ready ? ready.report.company_label : 'AI Due Diligence'}
      </h1>
      <Link
        to="/dashboard/due-diligence"
        className="mt-3 inline-flex min-h-11 items-center text-[0.95rem] text-[var(--ba-indigo)]"
      >
        All checks
      </Link>

      <div className="mt-6">
        {state === 'loading' ? <CardSkeleton tone="member" label="Loading note" /> : null}
        {state === 'denied' ? <PermissionState tone="member" message={MEMBER_VIEWS.dueDiligence.denied} /> : null}
        {state === 'missing' ? <EmptyState tone="member" message={MEMBER_MESSAGES.missing} /> : null}
        {state === 'error' || state === 'unavailable' ? (
          <ErrorBanner
            tone="member"
            message={
              state === 'unavailable'
                ? MEMBER_VIEWS.dueDiligence.unavailable
                : MEMBER_VIEWS.dueDiligence.error
            }
            onRetry={() => {
              setState('loading')
              setAttempt((value) => value + 1)
            }}
            retryLabel={MEMBER_VIEWS.dueDiligence.retry}
          />
        ) : null}
      </div>

      {ready && presented ? (
        <ReportBody presented={presented} preparedAt={createdAt} report={ready.report} />
      ) : null}
    </div>
  )
}

function ReportBody({
  presented,
  preparedAt,
  report,
}: {
  presented: PresentedReport
  preparedAt: string
  report: Extract<Awaited<ReturnType<typeof loadDueDiligenceReport>>, { ok: true }>['report']
}) {
  return (
    <article className="mt-6">
      <p className="max-w-3xl text-[1.05rem] leading-relaxed text-ink">{presented.assessed_line}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <OverviewItem label="Prepared" value={formatDate(preparedAt)} />
        <OverviewItem label="Documents reviewed" value={presented.documents_reviewed} />
      </dl>
      <p className="mt-4 max-w-3xl border-y border-r border-[var(--ba-line)] border-l-4 border-l-[var(--ba-copper)] bg-white px-4 py-3 text-[0.98rem] leading-relaxed text-ink/80">
        {report.disclaimer}
      </p>

      <section className="mt-8 max-w-3xl" aria-labelledby="dd-overview">
        <h2 id="dd-overview" className="font-display text-[1.35rem] font-semibold">
          Assessment overview
        </h2>
        <p className="mt-4 text-[1rem] leading-relaxed text-ink/80">{presented.overview}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <OverviewItem label="Company" value={report.company_label} />
          <OverviewItem label="Sector" value={report.sector_label} />
          <OverviewItem label="Ask" value={report.ask_label} />
        </dl>
      </section>

      <section className="mt-8" aria-labelledby="dd-scorecard">
        <h2 id="dd-scorecard" className="font-display text-[1.35rem] font-semibold">
          Area scorecard
        </h2>
        <ul className="mt-4 space-y-3 md:hidden">
          {presented.areas.map((area) => (
            <li key={area.area} className="border border-[var(--ba-line)] bg-white px-4 py-3">
              <p className="text-[1rem] text-ink">{area.area}</p>
              <p className="mt-1 text-[0.72rem] font-semibold tracking-[0.12em] text-[var(--ba-copper-deep)] uppercase">
                {VERDICT_LABEL[area.label]}
              </p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/75">{area.reason}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--ba-line)] text-[0.72rem] tracking-[0.12em] text-[var(--ba-muted)] uppercase">
                <th scope="col" className="px-3 py-3 font-semibold">
                  Area
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Label
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Key reason
                </th>
              </tr>
            </thead>
            <tbody>
              {presented.areas.map((area) => (
                <tr key={area.area} className="border-b border-[var(--ba-line)] bg-white align-top">
                  <th scope="row" className="px-3 py-3 text-[1rem] font-semibold text-ink">
                    {area.area}
                  </th>
                  <td className="px-3 py-3 text-[0.95rem] text-ink">{VERDICT_LABEL[area.label]}</td>
                  <td className="px-3 py-3 text-[0.95rem] leading-relaxed text-ink/80">{area.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="dd-percent">
        <h2 id="dd-percent" className="font-display text-[1.35rem] font-semibold">
          Overall summary
        </h2>
        {report.publicly_consistent_pct === null ? (
          <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">{MEMBER_VIEWS.dueDiligence.noScore}</p>
        ) : (
          <div className="mt-4 border border-[var(--ba-line)] bg-white px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <PercentTile value={report.publicly_consistent_pct} label="Publicly consistent" />
              <PercentTile value={report.not_publicly_verifiable_pct ?? 0} label="Not publicly verifiable" />
            </div>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">
              {MEMBER_VIEWS.dueDiligence.rationale}
            </p>
          </div>
        )}
      </section>

      {presented.findings.map((section) => (
        <section key={section.number} className="mt-8" aria-labelledby={`dd-finding-${section.number}`}>
          <h2 id={`dd-finding-${section.number}`} className="font-display text-[1.35rem] font-semibold">
            Finding {section.number}. {section.title}
          </h2>
          <p className="mt-3 max-w-3xl text-[1rem] leading-relaxed text-ink/80">{section.narrative}</p>
          <FindingCards rows={section.rows} />
          <FindingTable rows={section.rows} />
        </section>
      ))}

      <section className="mt-8" aria-labelledby="dd-sources">
        <h2 id="dd-sources" className="font-display text-[1.35rem] font-semibold">
          Sources
        </h2>
        {report.sources.length === 0 ? (
          <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">{MEMBER_VIEWS.dueDiligence.sourcesUnknown}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {report.sources.map((source) => (
              <li key={source.url}>
                <PublicLink source={source} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 max-w-3xl" aria-labelledby="dd-next">
        <h2 id="dd-next" className="font-display text-[1.35rem] font-semibold">
          Next steps
        </h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-[1rem] leading-relaxed text-ink/80">
          {report.next_steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </article>
  )
}

function FindingCards({ rows }: { rows: FindingRow[] }) {
  return (
    <ul className="mt-4 space-y-3 md:hidden">
      {rows.map((row) => (
        <li key={`${row.claim}-${row.status}`} className="border border-[var(--ba-line)] bg-white px-4 py-3">
          <Field label="Claim" value={row.claim} />
          <Field label="Source" value={row.source} />
          <Field label="Finding" value={row.finding} />
          <Field label="Status" value={VERDICT_LABEL[row.status]} />
        </li>
      ))}
    </ul>
  )
}

function FindingTable({ rows }: { rows: FindingRow[] }) {
  return (
    <div className="mt-4 hidden overflow-x-auto md:block">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--ba-line)] text-[0.72rem] tracking-[0.12em] text-[var(--ba-muted)] uppercase">
            <th scope="col" className="px-3 py-3 font-semibold">
              Claim
            </th>
            <th scope="col" className="px-3 py-3 font-semibold">
              Source
            </th>
            <th scope="col" className="px-3 py-3 font-semibold">
              Finding
            </th>
            <th scope="col" className="px-3 py-3 font-semibold">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.claim}-${row.status}`} className="border-b border-[var(--ba-line)] bg-white align-top">
              <td className="px-3 py-3 text-[0.95rem] leading-relaxed text-ink">{row.claim}</td>
              <td className="px-3 py-3 text-[0.95rem] text-ink">{row.source}</td>
              <td className="px-3 py-3 text-[0.95rem] leading-relaxed text-ink/80">{row.finding}</td>
              <td className="px-3 py-3 text-[0.95rem] text-ink">{VERDICT_LABEL[row.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">
      <span className="text-[0.72rem] font-semibold tracking-[0.12em] text-[var(--ba-muted)] uppercase">
        {label}.{' '}
      </span>
      {value}
    </p>
  )
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--ba-line)] bg-white px-4 py-3">
      <dt className="text-[0.72rem] font-semibold tracking-[0.12em] text-[var(--ba-muted)] uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[1rem] text-ink">{value}</dd>
    </div>
  )
}

function PercentTile({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-[2rem] font-semibold tracking-[-0.03em] text-[var(--ba-indigo)]">
        {value}%
      </p>
      <p className="mt-1 text-[0.95rem] text-ink">{label}</p>
    </div>
  )
}

function PublicLink({ source }: { source: SourceLink }) {
  const parsed = parsePublicHttpsUrl(source.url)
  if (!parsed.ok) return <span className="text-[0.95rem] text-ink">{source.title}</span>
  const href = `${parsed.url.origin}${parsed.url.pathname}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center text-[0.95rem] text-[var(--ba-indigo)] underline underline-offset-2"
    >
      {source.title}
    </a>
  )
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { dateStyle: 'long' })
}

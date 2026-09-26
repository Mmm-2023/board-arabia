import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  DECK_BUCKET,
  DECK_MAX_BYTES,
  DUE_DILIGENCE_DISCLAIMER,
  deckExtension,
  isUuid,
  MEMBER_MESSAGES,
  parsePublicHttpsUrl,
  presentReport,
  safeFileName,
  sniffDeck,
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
import { DD_COPY, deskCtaLabel, deskProgressLine, presentDeskError } from '../../lib/dueDiligenceCopy'
import { deskPhase, type DeskPhase } from '../../lib/dueDiligencePhase'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'
import { DueDiligenceReport } from './DueDiligenceReport'

const fieldClass =
  'mt-1 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem] text-ink'
const ctaClass =
  'ba-primary inline-flex min-h-11 w-full items-center justify-center px-4 text-[1rem] font-semibold disabled:opacity-40 sm:w-auto'
const fileButtonClass =
  'ba-primary inline-flex min-h-11 w-full items-center justify-center px-4 text-[1rem] font-semibold disabled:opacity-40 sm:w-auto'
const fileButtonQuietClass =
  'inline-flex min-h-11 w-full items-center justify-center border border-[var(--ba-line)] bg-white px-4 text-[1rem] font-semibold text-ink disabled:opacity-40 sm:w-auto'
const retryClass =
  'mt-2 inline-flex min-h-11 w-full items-center justify-center border border-[var(--ba-line)] bg-white px-4 text-[1rem] font-semibold text-ink sm:w-auto'

export function DueDiligencePage() {
  const { reportId } = useParams()
  useNoIndex(DD_COPY.browserTitle)
  if (reportId) return <ReportView key={reportId} reportId={reportId} />
  return <Desk />
}

function Desk() {
  const { userId } = useMember()
  const navigate = useNavigate()
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

  async function runCheck() {
    setFormError('')
    setJobError('')
    if (!file) {
      setFormError(DD_COPY.ctaDisabled)
      return
    }
    const ext = deckExtension(file.name)
    if (!ext || file.size <= 0) {
      setFormError(MEMBER_MESSAGES.notDeck)
      return
    }
    if (file.size > DECK_MAX_BYTES) {
      setFormError(DD_COPY.errorTooLarge)
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

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void runCheck()
  }

  function onRetry() {
    if (file) {
      void runCheck()
      return
    }
    setFormError('')
    setJobError('')
  }

  const phase = deskPhase({
    loadState,
    activeJob: Boolean(activeJobId) || busy,
    jobError: Boolean(jobError),
    formError: Boolean(formError),
    fileChosen: Boolean(file),
    reportCount: reports.length,
  })

  return (
    <DueDiligenceDeskView
      phase={phase}
      loadState={loadState}
      fileName={file?.name ?? ''}
      companyUrl={companyUrl}
      busy={busy}
      activeJob={Boolean(activeJobId)}
      progress={progress}
      progressLabel={deskProgressLine(stage)}
      actionError={presentDeskError(formError || jobError)}
      reports={reports}
      onCompanyUrl={setCompanyUrl}
      onFile={(next) => {
        setFile(next)
        setFormError('')
        setJobError('')
      }}
      onSubmit={onSubmit}
      onRetry={onRetry}
      onReload={() => {
        setLoadState('loading')
        setAttempt((value) => value + 1)
      }}
    />
  )
}

export function DueDiligenceDeskView({
  phase,
  loadState,
  fileName,
  companyUrl,
  busy,
  activeJob,
  progress,
  progressLabel,
  actionError,
  reports,
  onCompanyUrl,
  onFile,
  onSubmit,
  onRetry,
  onReload,
}: {
  phase: DeskPhase
  loadState: 'loading' | 'ready' | ReadFailure
  fileName: string
  companyUrl: string
  busy: boolean
  activeJob: boolean
  progress: number
  progressLabel: string
  actionError: string
  reports: HistoryItem[]
  onCompanyUrl: (value: string) => void
  onFile: (file: File | null) => void
  onSubmit: (event: FormEvent) => void
  onRetry: () => void
  onReload: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const fileChosen = Boolean(fileName)
  const showForm = loadState === 'ready'

  return (
    <div className="max-w-3xl">
      <p className="hidden text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase md:block">
        AI Due Diligence
      </p>
      <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-[-0.03em] text-balance md:mt-3 md:text-[2.2rem]">
        AI Due Diligence
      </h1>
      <p className="mt-3 max-w-xl text-[1.05rem] leading-relaxed text-ink">{DD_COPY.introPrimary}</p>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/70 sm:hidden">{DD_COPY.introShort}</p>
      <p className="mt-3 hidden max-w-xl text-[1rem] leading-relaxed text-ink/70 sm:block">
        {DD_COPY.introSupporting}
      </p>
      <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-ink/80">{DUE_DILIGENCE_DISCLAIMER}</p>

      <details open className="mt-6 max-w-xl border border-[var(--ba-line)] bg-white px-4 py-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-[1rem] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          {DD_COPY.doesHeading}
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.95rem] leading-relaxed text-ink/80">
          {DD_COPY.willDo.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2 className="mt-4 text-[1rem] font-semibold text-ink">{DD_COPY.willNotHeading}</h2>
        <ul className="mt-2 list-disc space-y-1 pb-2 pl-5 text-[0.95rem] leading-relaxed text-ink/80">
          {DD_COPY.willNot.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>

      {phase === 'loading' || phase === 'denied' || phase === 'load-error' ? (
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
              onRetry={onReload}
              retryLabel={MEMBER_VIEWS.dueDiligence.retry}
            />
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <>
          <form onSubmit={onSubmit} className="mt-8 max-w-xl">
            <label className="block text-[0.95rem] text-ink" htmlFor="dd-file-button">
              {DD_COPY.deckLabel}
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="sr-only"
              onChange={(event) => {
                onFile(event.target.files?.[0] ?? null)
                event.target.value = ''
              }}
            />
            <button
              id="dd-file-button"
              type="button"
              className={`${fileChosen ? fileButtonQuietClass : fileButtonClass} mt-2`}
              disabled={busy || activeJob}
              onClick={() => fileRef.current?.click()}
            >
              {DD_COPY.deckButton}
            </button>
            {fileName ? <p className="mt-2 truncate text-[0.92rem] text-[var(--ba-muted)]">{fileName}</p> : null}
            <p className="mt-2 text-[0.92rem] leading-relaxed text-[var(--ba-muted)]">{DD_COPY.deckHint}</p>

            <button
              type="submit"
              className={`${fileChosen ? ctaClass : fileButtonQuietClass} mt-4`}
              disabled={busy || activeJob || !fileChosen}
              aria-describedby={phase === 'job-error' ? 'dd-action-error' : undefined}
            >
              {deskCtaLabel({ busy, fileChosen })}
            </button>

            <div className="mt-3">
              {phase === 'running' && activeJob ? (
                <div className="border border-[var(--ba-line)] bg-white px-4 py-4" aria-live="polite">
                  <p className="text-[1rem] leading-snug text-ink">
                    {progressLabel}
                    <span className="text-[var(--ba-muted)]"> · {progress}%</span>
                  </p>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    aria-label={`${progressLabel}, ${progress} percent`}
                    className="mt-3 h-3 bg-[var(--ba-lavender-mist)]"
                  >
                    <div className="h-3 bg-[var(--ba-indigo)]" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-3 text-[0.92rem] leading-relaxed text-[var(--ba-muted)]">{DD_COPY.progressHint}</p>
                </div>
              ) : null}
              {phase === 'job-error' ? (
                <div id="dd-action-error" role="alert">
                  <p className="text-[0.95rem] leading-relaxed text-[var(--ba-error)]">{actionError}</p>
                  <button type="button" className={retryClass} onClick={onRetry}>
                    {DD_COPY.errorRetry}
                  </button>
                </div>
              ) : null}
              {phase === 'file-chosen' ? (
                <p className="text-[0.98rem] leading-relaxed text-ink">{DD_COPY.fileChosen}</p>
              ) : null}
              {(phase === 'idle' || phase === 'idle-empty') ? (
                <p className="text-[0.98rem] leading-relaxed text-ink/75">{DD_COPY.idle}</p>
              ) : null}
            </div>

            <label className="mt-6 block text-[0.95rem] text-ink/80" htmlFor="dd-url">
              {DD_COPY.siteLabel}
            </label>
            <input
              id="dd-url"
              value={companyUrl}
              onChange={(event) => onCompanyUrl(event.target.value)}
              type="url"
              inputMode="url"
              placeholder={DD_COPY.sitePlaceholder}
              autoComplete="url"
              className={fieldClass}
              disabled={busy || activeJob}
            />
            <p className="mt-2 text-[0.92rem] leading-relaxed text-[var(--ba-muted)] sm:hidden">
              {DD_COPY.siteHelperShort}
            </p>
            <p className="mt-2 hidden text-[0.92rem] leading-relaxed text-[var(--ba-muted)] sm:block">
              {DD_COPY.siteHelper}
            </p>
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
          ) : phase === 'idle-empty' ? (
            <div className="mt-10">
              <EmptyState tone="member" message={DD_COPY.emptyHistory} />
            </div>
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
      <p className="hidden text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase md:block">
        AI Due Diligence
      </p>
      <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-[-0.03em] break-words text-balance md:mt-3 md:text-[2.2rem]">
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
        <DueDiligenceReport
          presented={presented}
          preparedAt={createdAt}
          report={ready.report}
          reportId={reportId}
        />
      ) : null}
    </div>
  )
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

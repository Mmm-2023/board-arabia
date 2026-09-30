import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  aiToolStoragePath,
  extensionForMime,
  formatReportDate,
  isUuid,
  toolFromSlug,
  toolPath,
  type AiToolKey,
} from '../../../supabase/functions/_shared/ai_tools.ts'
import type { StubOutput } from '../../../supabase/functions/ai-tool-job/tools/types.ts'
import { AiToolForm, AiToolJobStatus, AiToolReport, AiToolShell } from '../../components/ai/AiToolDesk'
import { MarketBriefForm, MarketUnavailable } from '../../components/ai/MarketBriefForm'
import { isMarketSector, marketFileName, type MarketSector } from '../../../supabase/functions/ai-tool-job/tools/market_brief.ts'
import { AI_UI } from '../../lib/aiToolUi'
import {
  acceptAiToolFile,
  listAiToolJobs,
  postAiTool,
  readAiToolFrame,
  readMarketSearchStatus,
  recordAiToolConsent,
  uploadAiToolFile,
  type AiToolNote,
} from '../../lib/aiToolApi'
import { legalSlotsFromEnv } from '../../lib/aiToolConfig'
import { renderToolCopy } from '../../lib/aiToolCopy'
import { useSiteLanguage } from '../../components/SiteLanguage'
import { useNoIndex } from '../../lib/usePageTitle'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { ErrorBanner, FormSkeleton, PermissionState } from '../../shell/ViewState'
import { useMember } from './context'

type Load = 'loading' | 'ready' | 'error' | 'denied'
type SearchState = 'loading' | 'ready' | 'missing' | 'error'

export function AiToolPage() {
  const { toolSlug, jobId } = useParams()
  const tool = toolFromSlug(toolSlug)
  const navigate = useNavigate()
  const { userId } = useMember()
  const { lang } = useSiteLanguage()
  const [load, setLoad] = useState<Load>('loading')
  const [retentionDays, setRetentionDays] = useState(30)
  const [attempt, setAttempt] = useState(0)
  const [consented, setConsented] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<AiToolNote[]>([])
  const [output, setOutput] = useState<StubOutput | null>(null)
  const [jobStatus, setJobStatus] = useState('')
  const [jobStep, setJobStep] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [sector, setSector] = useState<MarketSector | ''>('')
  const [search, setSearch] = useState<SearchState>(tool === 'market_brief' ? 'loading' : 'ready')
  const queryKey = `${tool ?? ''}|${jobId ?? ''}|${attempt}`
  const [seenQuery, setSeenQuery] = useState(queryKey)
  if (seenQuery !== queryKey) {
    setSeenQuery(queryKey)
    setLoad('loading')
    setOutput(null)
    setSector('')
    setSearch(tool === 'market_brief' ? 'loading' : 'ready')
  }
  useNoIndex(tool ? 'AI tool | Board Arabia' : 'AI tools | Board Arabia')

  useEffect(() => {
    if (!tool) return
    let cancelled = false
    void (async () => {
      const framePromise = readAiToolFrame()
      const searchPromise = tool === 'market_brief' ? readMarketSearchStatus() : Promise.resolve('ready' as const)
      const [frame, searchStatus] = await Promise.all([framePromise, searchPromise])
      if (cancelled) return
      if (!frame) {
        setLoad('error')
        return
      }
      setRetentionDays(frame.retentionDays)
      const on = frame.flags[tool]
      if (!on) {
        setLoad('denied')
        return
      }
      if (tool === 'market_brief') {
        if (searchStatus === 'ready') setSearch('ready')
        else if (searchStatus === 'not_configured') setSearch('missing')
        else setSearch('error')
        if (searchStatus === null) {
          setLoad('error')
          return
        }
      }
      const listed = await listAiToolJobs(tool)
      if (cancelled) return
      if (!listed) {
        setLoad('error')
        return
      }
      setNotes(listed)
      if (jobId && isUuid(jobId)) {
        const status = await postAiTool({ action: 'status', job_id: jobId })
        if (cancelled) return
        if (!status.ok) {
          setLoad('error')
          return
        }
        const job = status.payload.job as { status?: string; step?: string } | null
        setJobStatus(typeof job?.status === 'string' ? job.status : '')
        setJobStep(typeof job?.step === 'string' ? job.step : '')
        setOutput((status.payload.output as StubOutput | null) ?? null)
      } else {
        setOutput(null)
        setJobStatus('')
        setJobStep('')
      }
      setLoad('ready')
    })()
    return () => {
      cancelled = true
    }
  }, [attempt, jobId, tool])

  if (!tool) {
    return (
      <PermissionState tone="member" message="That tool is not on this page." />
    )
  }

  const ui = AI_UI[lang]
  const slots = legalSlotsFromEnv(retentionDays, formatReportDate(new Date()), lang)
  const copy = renderToolCopy(tool, lang, slots)
  const reportDate = output?.generated_on || slots.date
  const reportCopy = renderToolCopy(tool, lang, { ...slots, date: reportDate })

  async function onRunMarket() {
    if (!tool || tool !== 'market_brief' || !sector || !consented) return
    setBusy(true)
    setError('')
    const id = crypto.randomUUID()
    const consentedOk = await recordAiToolConsent(tool, id)
    if (!consentedOk) {
      setBusy(false)
      setError('Consent is required before a run.')
      return
    }
    const note = new File([`Sector: ${sector}\n`], marketFileName(sector), { type: 'text/plain' })
    const path = aiToolStoragePath(userId, id, 'txt')
    const uploaded = await uploadAiToolFile(path, note)
    if (!uploaded) {
      setBusy(false)
      setError('Could not save that sector. Retry.')
      return
    }
    const started = await postAiTool({
      action: 'start',
      tool_key: tool,
      job_id: id,
      storage_path: path,
      file_name: note.name,
      mime_type: 'text/plain',
      byte_size: note.size,
      sector,
    })
    setBusy(false)
    if (!started.ok) {
      if (started.code === 'search_not_configured') {
        setSearch('missing')
        return
      }
      setError(started.error)
      return
    }
    navigate(toolPath(tool, id))
  }

  async function onRun() {
    if (!tool || !file || !consented) return
    const problem = acceptAiToolFile(file)
    if (problem) {
      setError(problem)
      return
    }
    const mime = file.type || mimeFor(file.name)
    const ext = extensionForMime(mime)
    if (!ext) {
      setError('Use a PDF, text file, CSV, spreadsheet, or document.')
      return
    }
    setBusy(true)
    setError('')
    const id = crypto.randomUUID()
    const consentedOk = await recordAiToolConsent(tool, id)
    if (!consentedOk) {
      setBusy(false)
      setError('Consent is required before a run.')
      return
    }
    const path = aiToolStoragePath(userId, id, ext)
    const uploaded = await uploadAiToolFile(path, file)
    if (!uploaded) {
      setBusy(false)
      setError('Could not upload that file. Retry.')
      return
    }
    const started = await postAiTool({
      action: 'start',
      tool_key: tool,
      job_id: id,
      storage_path: path,
      file_name: file.name,
      mime_type: mime,
      byte_size: file.size,
    })
    setBusy(false)
    if (!started.ok) {
      setError(started.error)
      return
    }
    navigate(toolPath(tool, id))
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    setError('')
    const result = await postAiTool({ action: 'delete', job_id: pendingDelete })
    setBusy(false)
    setPendingDelete(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (jobId === pendingDelete && tool) navigate(toolPath(tool))
    setAttempt((value) => value + 1)
  }

  return (
    <AiToolShell lang={lang} title={copy.title}>
      <p className="mb-4">
        <Link to="/dashboard/ai" className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)]">
          {ui.allTools}
        </Link>
      </p>
      {load === 'loading' ? <FormSkeleton tone="member" /> : null}
      {load === 'error' ? (
        <ErrorBanner
          tone="member"
          message={ui.loadError}
          retryLabel={ui.retry}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      ) : null}
      {load === 'denied' ? (
        <div data-ai-unavailable="">
          <h2 className="font-display text-[1.6rem] font-semibold">{ui.unavailableTitle}</h2>
          <p className="mt-3 text-[1rem] leading-relaxed text-ink/70">{ui.unavailable}</p>
        </div>
      ) : null}
      {load === 'ready' && output ? (
        <div className="space-y-4">
          {jobStatus ? <AiToolJobStatus status={jobStatus} step={jobStep} /> : null}
          <AiToolReport
            output={output}
            lang={lang}
            heading={reportCopy.title}
            footerLead={reportCopy.footerLead}
            footerShared={reportCopy.footerShared}
            onDelete={() => jobId && setPendingDelete(jobId)}
          />
        </div>
      ) : null}
      {load === 'ready' && !output && jobId ? (
        <AiToolJobStatus status={jobStatus || 'queued'} step={jobStep || 'intake'} />
      ) : null}
      {load === 'ready' && !jobId && tool === 'market_brief' && search === 'missing' ? (
        <>
          <MarketUnavailable lang={lang} />
          <Notes notes={notes} tool={tool} lang={lang} onDelete={setPendingDelete} />
        </>
      ) : null}
      {load === 'ready' && !jobId && !(tool === 'market_brief' && search === 'missing') ? (
        <>
          {error ? (
            <p className="mb-4 text-[0.98rem] text-[var(--ba-error)]" role="alert">
              {error}
            </p>
          ) : null}
          {tool === 'market_brief' ? (
            <MarketBriefForm
              copy={copy}
              lang={lang}
              sector={sector}
              consented={consented}
              busy={busy || search !== 'ready'}
              onSector={(next) => {
                if (isMarketSector(next)) setSector(next)
              }}
              onConsent={setConsented}
              onRun={() => void onRunMarket()}
            />
          ) : (
            <AiToolForm
              copy={copy}
              lang={lang}
              consented={consented}
              fileName={file?.name || ''}
              busy={busy}
              onConsent={setConsented}
              onFile={(next) => {
                setError('')
                setFile(next)
              }}
              onRun={() => void onRun()}
            />
          )}
          <Notes notes={notes} tool={tool} lang={lang} onDelete={setPendingDelete} />
        </>
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          tone="member"
          title="Delete this check?"
          body="This removes the check, the output, and the uploaded file."
          busy={busy}
          onCancel={() => {
            if (!busy) setPendingDelete(null)
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </AiToolShell>
  )
}

function Notes({
  notes,
  tool,
  lang,
  onDelete,
}: {
  notes: AiToolNote[]
  tool: AiToolKey
  lang: 'en' | 'ar'
  onDelete: (id: string) => void
}) {
  const ui = AI_UI[lang]
  return (
    <section className="mt-10" aria-label={ui.prior}>
      <h2 className="font-display text-[1.35rem] font-semibold">{ui.prior}</h2>
      {notes.length === 0 ? (
        <p className="mt-3 text-[1rem] text-ink/65">{ui.priorEmpty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="flex items-stretch border border-[var(--ba-line)] bg-white">
              <Link to={toolPath(tool, note.id)} className="flex min-h-11 min-w-0 flex-1 items-center px-4 py-3">
                {note.title}
              </Link>
              <button
                type="button"
                className="inline-flex min-h-11 items-center border-s border-[var(--ba-line)] px-4 text-[0.95rem] font-semibold"
                onClick={() => onDelete(note.id)}
              >
                {ui.delete}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function mimeFor(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.txt')) return 'text/plain'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return ''
}

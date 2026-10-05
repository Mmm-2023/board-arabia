import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { StubOutput } from '../../../supabase/functions/ai-tool-job/tools/types.ts'
import { DealReadinessChecklist } from './DealReadinessMemo'
import { PRIVACY_LINK, TERMS_LINK } from '../../lib/aiToolConfig'
import type { RenderedToolCopy } from '../../lib/aiToolCopy'
import { AI_UI } from '../../lib/aiToolUi'

const LINK_LABELS = { privacy: 'Privacy Notice', terms: 'Terms' }

function statusLabel(status: string) {
  if (status === 'queued') return AI_UI.queued
  if (status === 'reading') return AI_UI.reading
  if (status === 'checking') return AI_UI.checking
  if (status === 'writing') return AI_UI.writing
  if (status === 'ready') return AI_UI.ready
  if (status === 'failed') return AI_UI.failed
  return status
}

function stepLabel(step: string) {
  if (step === 'intake') return AI_UI.intake
  if (step === 'draft') return AI_UI.draft
  if (step === 'done') return AI_UI.done
  return step
}

function LegalAnchor({ href, children }: { href: string; children: string }) {
  const className = 'underline'
  if (href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  )
}

function isolateRuns(text: string): ReactNode[] {
  if (!text) return []
  const re = /[A-Za-z0-9][A-Za-z0-9'./:-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'./:-]*)*/g
  const nodes: ReactNode[] = []
  let last = 0
  let guard = 0
  for (const match of text.matchAll(re)) {
    guard += 1
    if (guard > 40) break
    const index = match.index ?? 0
    if (index > last) nodes.push(text.slice(last, index))
    nodes.push(<bdi key={`latin-${index}-${guard}`}>{match[0]}</bdi>)
    last = index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length > 0 ? nodes : [text]
}

function withoutTrailingLabel(before: string, label: string): string {
  const trimmed = before.replace(/\s+$/, '')
  if (!trimmed.endsWith(label)) return before
  return trimmed.slice(0, -label.length)
}

export function LegalText({ text, className }: { text: string; className?: string }) {
  const labels = LINK_LABELS
  const targets = [
    { href: PRIVACY_LINK, label: labels.privacy },
    { href: TERMS_LINK, label: labels.terms },
  ].filter((item) => item.href.length > 0)
  const nodes: ReactNode[] = []
  let rest = text
  let guard = 0
  while (rest.length > 0 && guard < 20) {
    guard += 1
    let at = -1
    let hit = targets[0]
    for (const item of targets) {
      const found = rest.indexOf(item.href)
      if (found >= 0 && (at < 0 || found < at || (found === at && item.href.length > (hit?.href.length ?? 0)))) {
        at = found
        hit = item
      }
    }
    if (at < 0 || !hit) {
      nodes.push(isolateRuns(rest))
      break
    }
    nodes.push(isolateRuns(withoutTrailingLabel(rest.slice(0, at), hit.label)))
    nodes.push(
      <LegalAnchor key={`${hit.href}-${guard}`} href={hit.href}>
        {hit.label}
      </LegalAnchor>,
    )
    rest = rest.slice(at + hit.href.length)
  }
  return <p className={className}>{nodes}</p>
}

export function AiToolBanner({ text }: { text: string }) {
  return (
    <div className="border border-[var(--ba-line)] bg-[var(--ba-lavender-mist)] px-4 py-4" role="note">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">AI</p>
      <p className="mt-2 text-[1rem] leading-relaxed text-ink">{text}</p>
    </div>
  )
}

export function AiToolWillList({
  will,
  willNot,
}: {
  will: readonly string[]
  willNot: readonly string[]
}) {
  const ui = AI_UI
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <section className="border border-[var(--ba-line)] bg-white px-4 py-4" aria-label={ui.will}>
        <h2 className="font-display text-[1.2rem] font-semibold">{ui.will}</h2>
        <ul className="mt-3 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed text-ink/80">
          {will.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="border border-[var(--ba-line)] bg-white px-4 py-4" aria-label={ui.willNot}>
        <h2 className="font-display text-[1.2rem] font-semibold">{ui.willNot}</h2>
        <ul className="mt-3 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed text-ink/80">
          {willNot.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function AiToolUpload({
  fileName,
  disabled,
  accept = '.pdf,.txt,.csv,.xlsx,.docx,application/pdf,text/plain,text/csv',
  fileHint,
  onFile,
}: {
  fileName: string
  disabled?: boolean
  accept?: string
  fileHint?: string
  onFile: (file: File | null) => void
}) {
  const ui = AI_UI
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="mt-6">
      <label className="block text-[0.95rem] text-ink" htmlFor="ai-tool-file">
        {ui.upload}
      </label>
      <input
        ref={input}
        id="ai-tool-file"
        type="file"
        className="sr-only"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          onFile(event.target.files?.[0] ?? null)
          event.target.value = ''
        }}
      />
      <button
        type="button"
        className="mt-2 inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[1rem] font-semibold"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {ui.choose}
      </button>
      {fileName ? <p className="mt-2 text-[0.95rem] text-ink">{fileName}</p> : null}
      <p className="mt-2 text-[0.92rem] leading-relaxed text-ink/65">{fileHint || ui.fileHint}</p>
    </div>
  )
}

export function AiToolConsent({
  text,
  checked,
  disabled,
  onChange,
}: {
  text: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="mt-6 flex min-h-11 items-start gap-3">
      <input
        id="ai-tool-consent"
        type="checkbox"
        className="mt-1 size-11 shrink-0 accent-[var(--ba-indigo)]"
        checked={checked}
        disabled={disabled}
        aria-labelledby="ai-tool-consent-copy"
        onChange={(event) => onChange(event.target.checked)}
      />
      <div id="ai-tool-consent-copy">
        <LegalText text={text} className="text-[0.98rem] leading-relaxed text-ink" />
      </div>
    </div>
  )
}

export function AiToolJobStatus({ status, step }: { status: string; step: string }) {
  return (
    <p className="border border-[var(--ba-line)] bg-white px-4 py-3 text-[1rem]" role="status" data-ai-job-status={status}>
      {AI_UI.status}: {statusLabel(status)}. {AI_UI.step}: {stepLabel(step)}.
    </p>
  )
}

export function AiToolFooter({ lead, rest }: { lead: string; rest: string }) {
  return (
    <footer className="mt-8 border-t border-[var(--ba-line)] pt-4" data-ai-report-footer="">
      <LegalText text={lead} className="text-[0.95rem] leading-relaxed text-ink" />
      <LegalText text={rest} className="mt-3 text-[0.92rem] leading-relaxed text-ink/70" />
    </footer>
  )
}

export function AiToolReport({
  output,
  footerLead,
  footerShared,
  heading,
  onDelete,
}: {
  output: StubOutput
  footerLead: string
  footerShared: string
  heading?: string
  onDelete?: () => void
}) {
  return (
    <article className="border border-[var(--ba-line)] bg-white px-4 py-5" data-ai-report="">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">AI</p>
      <h2 className="mt-2 font-display text-[1.6rem] font-semibold tracking-[-0.02em]">{heading || output.title}</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink">{output.summary}</p>
      {output.checklist && output.checklist.length > 0 ? (
        <DealReadinessChecklist items={output.checklist} example={output.example === true} />
      ) : null}
      {output.checklist && output.checklist.length > 0 ? null : output.metrics && output.metrics.length > 0 ? (
        <dl className="mt-6 grid gap-3 sm:grid-cols-2" aria-label={AI_UI.metrics}>
          {output.metrics.map((item) => (
            <div key={item.label} className="min-w-0 border border-[var(--ba-line)] bg-[var(--ba-lavender-mist)] px-3 py-3">
              <dt className="text-[0.72rem] font-semibold tracking-[0.12em] text-[var(--ba-indigo)] uppercase">{item.label}</dt>
              <dd dir="ltr" className="mt-1 text-start font-display text-[1.45rem] font-semibold break-words">{item.value}</dd>
              {item.note ? <dd className="mt-1 text-[0.92rem] leading-relaxed text-ink/70 break-words">{item.note}</dd> : null}
            </div>
          ))}
        </dl>
      ) : null}
      {output.red_flags && output.red_flags.length > 0 ? (
        <>
          <h3 className="mt-6 text-[1rem] font-semibold">{AI_UI.redFlags}</h3>
          <ul className="mt-2 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed break-words">
            {output.red_flags.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      {output.checklist && output.checklist.length > 0 ? null : (
        <>
          <h3 className="mt-6 text-[1rem] font-semibold">{AI_UI.findings}</h3>
          <ul className="mt-2 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed break-words">
            {output.findings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <h3 className="mt-6 text-[1rem] font-semibold">{AI_UI.questions}</h3>
      <ul className="mt-2 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed break-words">
        {output.questions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {output.sources.length > 0 ? (
        <>
          <h3 className="mt-6 text-[1rem] font-semibold">{AI_UI.sources}</h3>
          <ul className="mt-2 space-y-2 text-[0.98rem] leading-relaxed">
            {output.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} className="underline" dir="ltr">
                  {source.title}
                </a>
                <span className="text-ink/65">
                  {' '}
                  {AI_UI.dated} <bdi>{`${source.dated}.`}</bdi>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-6 text-[0.98rem] leading-relaxed text-ink/80">{output.limits}</p>
      {onDelete ? (
        <button
          type="button"
          className="mt-6 inline-flex min-h-11 items-center border border-[var(--ba-line)] px-4 text-[0.95rem] font-semibold"
          onClick={onDelete}
        >
          {AI_UI.delete}
        </button>
      ) : null}
      <AiToolFooter lead={footerLead} rest={footerShared} />
    </article>
  )
}

export function AiToolForm({
  copy,
  consented,
  fileName,
  busy,
  accept,
  fileHint,
  inputsReady,
  extra,
  hideBanner,
  onConsent,
  onFile,
  onRun,
}: {
  copy: RenderedToolCopy
  consented: boolean
  fileName: string
  busy: boolean
  accept?: string
  fileHint?: string
  inputsReady?: boolean
  extra?: ReactNode
  hideBanner?: boolean
  onConsent: (value: boolean) => void
  onFile: (file: File | null) => void
  onRun: () => void
}) {
  const hasInput = inputsReady ?? fileName.trim().length > 0
  const canRun = consented && hasInput && !busy
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (canRun) onRun()
      }}
    >
      {hideBanner ? null : <AiToolBanner text={copy.banner} />}
      <AiToolWillList will={copy.will} willNot={copy.willNot} />
      {extra}
      <AiToolUpload fileName={fileName} disabled={busy} accept={accept} fileHint={fileHint} onFile={onFile} />
      <AiToolConsent text={copy.consent} checked={consented} disabled={busy} onChange={onConsent} />
      <button
        type="submit"
        className="ba-primary mt-6 inline-flex min-h-11 items-center px-4 text-[1rem] font-semibold disabled:opacity-40"
        disabled={!canRun}
        data-ai-run={canRun ? 'on' : 'off'}
        data-consent={consented ? 'on' : 'off'}
      >
        {busy ? AI_UI.running : AI_UI.run}
      </button>
    </form>
  )
}

export function AiToolShell({
  title,
  staffPreview,
  notice,
  children,
}: {
  title: string
  staffPreview?: boolean
  notice?: ReactNode
  children: ReactNode
}) {
  return (
    <article className="max-w-3xl pe-16 break-words" dir="ltr" lang="en" data-ai-tool="">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">{title}</h1>
      {notice ? (
        <div className="mt-4" data-ai-advice-notice="">
          {notice}
        </div>
      ) : null}
      {staffPreview ? (
        <p className="mt-3 inline-flex min-h-11 items-center border border-[var(--ba-copper)] px-3 text-[0.95rem] font-semibold text-[var(--ba-copper-deep)]" data-staff-preview="">
          {AI_UI.staffPreview}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </article>
  )
}

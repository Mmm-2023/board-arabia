import { useRef, type ReactNode } from 'react'
import type { StubOutput } from '../../../supabase/functions/ai-tool-job/tools/types.ts'
import type { RenderedToolCopy } from '../../lib/aiToolCopy'

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  reading: 'Reading',
  checking: 'Checking',
  writing: 'Writing',
  ready: 'Ready',
  failed: 'Could not finish',
}

const STEP_LABEL: Record<string, string> = {
  intake: 'Intake',
  draft: 'Draft',
  done: 'Done',
}

export function LegalText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return (
    <p className={className}>
      {parts.map((part, index) => {
        if (!part.startsWith('http')) return <span key={index}>{part}</span>
        const href = part.replace(/[.,)]+$/, '')
        const tail = part.slice(href.length)
        return (
          <span key={index}>
            <a href={href} className="underline">
              {href}
            </a>
            {tail}
          </span>
        )
      })}
    </p>
  )
}

export function AiToolBanner({ text }: { text: string }) {
  return (
    <div className="border border-[var(--ba-line)] bg-[var(--ba-lavender-mist)] px-4 py-4" role="note">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">AI</p>
      <p className="mt-2 text-[1rem] leading-relaxed text-ink">{text}</p>
    </div>
  )
}

export function AiToolWillList({ will, willNot }: { will: readonly string[]; willNot: readonly string[] }) {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <section className="border border-[var(--ba-line)] bg-white px-4 py-4" aria-label="Will">
        <h2 className="font-display text-[1.2rem] font-semibold">Will</h2>
        <ul className="mt-3 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed text-ink/80">
          {will.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="border border-[var(--ba-line)] bg-white px-4 py-4" aria-label="Will not">
        <h2 className="font-display text-[1.2rem] font-semibold">Will not</h2>
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
  onFile,
}: {
  fileName: string
  disabled?: boolean
  onFile: (file: File | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="mt-6">
      <label className="block text-[0.95rem] text-ink" htmlFor="ai-tool-file">
        Upload
      </label>
      <input
        ref={input}
        id="ai-tool-file"
        type="file"
        className="sr-only"
        accept=".pdf,.txt,.csv,.xlsx,.docx,application/pdf,text/plain,text/csv"
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
        Choose a file
      </button>
      {fileName ? <p className="mt-2 text-[0.95rem] text-ink">{fileName}</p> : null}
      <p className="mt-2 text-[0.92rem] leading-relaxed text-ink/65">PDF, text, CSV, spreadsheet, or document. 15 MB max.</p>
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
    <label className="mt-6 flex min-h-11 items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 size-6 shrink-0 accent-[var(--ba-indigo)]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <LegalText text={text} className="text-[0.98rem] leading-relaxed text-ink" />
    </label>
  )
}

export function AiToolJobStatus({ status, step }: { status: string; step: string }) {
  const statusLabel = STATUS_LABEL[status] || status
  const stepLabel = STEP_LABEL[step] || step
  return (
    <p className="border border-[var(--ba-line)] bg-white px-4 py-3 text-[1rem]" role="status" data-ai-job-status={status}>
      Status: {statusLabel}. Step: {stepLabel}.
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
  onDelete,
}: {
  output: StubOutput
  footerLead: string
  footerShared: string
  onDelete?: () => void
}) {
  return (
    <article className="border border-[var(--ba-line)] bg-white px-4 py-5" data-ai-report="">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">AI</p>
      <h2 className="mt-2 font-display text-[1.6rem] font-semibold tracking-[-0.02em]">{output.title}</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink">{output.summary}</p>
      <h3 className="mt-6 text-[1rem] font-semibold">Findings</h3>
      <ul className="mt-2 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed">
        {output.findings.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3 className="mt-6 text-[1rem] font-semibold">Questions</h3>
      <ul className="mt-2 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed">
        {output.questions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {output.sources.length > 0 ? (
        <>
          <h3 className="mt-6 text-[1rem] font-semibold">Sources</h3>
          <ul className="mt-2 space-y-2 text-[0.98rem] leading-relaxed">
            {output.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} className="underline">
                  {source.title}
                </a>
                <span className="text-ink/65"> Dated {source.dated}.</span>
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
          Delete
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
  onConsent,
  onFile,
  onRun,
}: {
  copy: RenderedToolCopy
  consented: boolean
  fileName: string
  busy: boolean
  onConsent: (value: boolean) => void
  onFile: (file: File | null) => void
  onRun: () => void
}) {
  const canRun = consented && fileName.trim().length > 0 && !busy
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (canRun) onRun()
      }}
    >
      <AiToolBanner text={copy.banner} />
      <AiToolWillList will={copy.will} willNot={copy.willNot} />
      <AiToolUpload fileName={fileName} disabled={busy} onFile={onFile} />
      <AiToolConsent text={copy.consent} checked={consented} disabled={busy} onChange={onConsent} />
      <button
        type="submit"
        className="ba-primary mt-6 inline-flex min-h-11 items-center px-4 text-[1rem] font-semibold disabled:opacity-40"
        disabled={!canRun}
        data-ai-run={canRun ? 'on' : 'off'}
        data-consent={consented ? 'on' : 'off'}
      >
        {busy ? 'Running' : 'Run'}
      </button>
    </form>
  )
}

export function AiToolShell({
  lang,
  title,
  offForMembers,
  children,
}: {
  lang: 'en' | 'ar'
  title: string
  offForMembers?: boolean
  children: ReactNode
}) {
  return (
    <article className="max-w-3xl pe-16" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} data-ai-tool="">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">{title}</h1>
      {offForMembers ? (
        <p className="mt-3 inline-flex min-h-11 items-center border border-[var(--ba-copper)] px-3 text-[0.95rem] font-semibold text-[var(--ba-copper-deep)]">
          Off for members
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </article>
  )
}

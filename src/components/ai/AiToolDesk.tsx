import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { StubOutput } from '../../../supabase/functions/ai-tool-job/tools/types.ts'
import { PRIVACY_LINK, TERMS_LINK } from '../../lib/aiToolConfig'
import type { RenderedToolCopy } from '../../lib/aiToolCopy'
import { AI_UI, type UiLang } from '../../lib/aiToolUi'

type CopyLang = UiLang

const LINK_LABELS: Record<CopyLang, { privacy: string; terms: string }> = {
  en: { privacy: 'Privacy Notice', terms: 'Terms' },
  ar: { privacy: 'إشعار الخصوصية', terms: 'الشروط' },
}

function statusLabel(lang: CopyLang, status: string) {
  const ui = AI_UI[lang]
  if (status === 'queued') return ui.queued
  if (status === 'reading') return ui.reading
  if (status === 'checking') return ui.checking
  if (status === 'writing') return ui.writing
  if (status === 'ready') return ui.ready
  if (status === 'failed') return ui.failed
  return status
}

function stepLabel(lang: CopyLang, step: string) {
  const ui = AI_UI[lang]
  if (step === 'intake') return ui.intake
  if (step === 'draft') return ui.draft
  if (step === 'done') return ui.done
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

export function LegalText({ text, className, lang = 'en' }: { text: string; className?: string; lang?: CopyLang }) {
  const labels = LINK_LABELS[lang]
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
  lang = 'en',
}: {
  will: readonly string[]
  willNot: readonly string[]
  lang?: CopyLang
}) {
  const ui = AI_UI[lang]
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
  lang = 'en',
  accept = '.pdf,.txt,.csv,.xlsx,.docx,application/pdf,text/plain,text/csv',
  fileHint,
  onFile,
}: {
  fileName: string
  disabled?: boolean
  lang?: CopyLang
  accept?: string
  fileHint?: string
  onFile: (file: File | null) => void
}) {
  const ui = AI_UI[lang]
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
  lang = 'en',
  onChange,
}: {
  text: string
  checked: boolean
  disabled?: boolean
  lang?: CopyLang
  onChange: (value: boolean) => void
}) {
  return (
    <div className="mt-6 flex min-h-11 items-start gap-3">
      <input
        id="ai-tool-consent"
        type="checkbox"
        className="mt-1 size-6 shrink-0 accent-[var(--ba-indigo)]"
        checked={checked}
        disabled={disabled}
        aria-labelledby="ai-tool-consent-copy"
        onChange={(event) => onChange(event.target.checked)}
      />
      <div id="ai-tool-consent-copy">
        <LegalText text={text} lang={lang} className="text-[0.98rem] leading-relaxed text-ink" />
      </div>
    </div>
  )
}

export function AiToolJobStatus({ status, step, lang = 'en' }: { status: string; step: string; lang?: CopyLang }) {
  const ui = AI_UI[lang]
  return (
    <p className="border border-[var(--ba-line)] bg-white px-4 py-3 text-[1rem]" role="status" data-ai-job-status={status}>
      {ui.status}: {statusLabel(lang, status)}. {ui.step}: {stepLabel(lang, step)}.
    </p>
  )
}

export function AiToolFooter({ lead, rest, lang = 'en' }: { lead: string; rest: string; lang?: CopyLang }) {
  return (
    <footer className="mt-8 border-t border-[var(--ba-line)] pt-4" data-ai-report-footer="">
      <LegalText text={lead} lang={lang} className="text-[0.95rem] leading-relaxed text-ink" />
      <LegalText text={rest} lang={lang} className="mt-3 text-[0.92rem] leading-relaxed text-ink/70" />
    </footer>
  )
}

export function AiToolReport({
  output,
  footerLead,
  footerShared,
  lang = 'en',
  heading,
  onDelete,
}: {
  output: StubOutput
  footerLead: string
  footerShared: string
  lang?: CopyLang
  heading?: string
  onDelete?: () => void
}) {
  return (
    <article className="border border-[var(--ba-line)] bg-white px-4 py-5" data-ai-report="">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">AI</p>
      <h2 className="mt-2 font-display text-[1.6rem] font-semibold tracking-[-0.02em]">{heading || output.title}</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink">{output.summary}</p>
      {output.metrics && output.metrics.length > 0 ? (
        <dl className="mt-6 grid gap-3 sm:grid-cols-2" aria-label={AI_UI[lang].metrics}>
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
          <h3 className="mt-6 text-[1rem] font-semibold">{AI_UI[lang].redFlags}</h3>
          <ul className="mt-2 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed break-words">
            {output.red_flags.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      <h3 className="mt-6 text-[1rem] font-semibold">{AI_UI[lang].findings}</h3>
      <ul className="mt-2 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed break-words">
        {output.findings.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3 className="mt-6 text-[1rem] font-semibold">{AI_UI[lang].questions}</h3>
      <ul className="mt-2 list-disc space-y-2 ps-5 text-[0.98rem] leading-relaxed break-words">
        {output.questions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {output.sources.length > 0 ? (
        <>
          <h3 className="mt-6 text-[1rem] font-semibold">{AI_UI[lang].sources}</h3>
          <ul className="mt-2 space-y-2 text-[0.98rem] leading-relaxed">
            {output.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} className="underline" dir="ltr">
                  {source.title}
                </a>
                <span className="text-ink/65">
                  {' '}
                  {AI_UI[lang].dated} <bdi>{`${source.dated}.`}</bdi>
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
          {AI_UI[lang].delete}
        </button>
      ) : null}
      <AiToolFooter lead={footerLead} rest={footerShared} lang={lang} />
    </article>
  )
}

export function AiToolForm({
  copy,
  consented,
  fileName,
  busy,
  lang = 'en',
  accept,
  fileHint,
  inputsReady,
  extra,
  onConsent,
  onFile,
  onRun,
}: {
  copy: RenderedToolCopy
  consented: boolean
  fileName: string
  busy: boolean
  lang?: CopyLang
  accept?: string
  fileHint?: string
  inputsReady?: boolean
  extra?: ReactNode
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
      <AiToolBanner text={copy.banner} />
      <AiToolWillList will={copy.will} willNot={copy.willNot} lang={lang} />
      {extra}
      <AiToolUpload fileName={fileName} disabled={busy} lang={lang} accept={accept} fileHint={fileHint} onFile={onFile} />
      <AiToolConsent text={copy.consent} lang={lang} checked={consented} disabled={busy} onChange={onConsent} />
      <button
        type="submit"
        className="ba-primary mt-6 inline-flex min-h-11 items-center px-4 text-[1rem] font-semibold disabled:opacity-40"
        disabled={!canRun}
        data-ai-run={canRun ? 'on' : 'off'}
        data-consent={consented ? 'on' : 'off'}
      >
        {busy ? AI_UI[lang].running : AI_UI[lang].run}
      </button>
    </form>
  )
}

export function AiToolShell({
  lang,
  title,
  staffPreview,
  children,
}: {
  lang: 'en' | 'ar'
  title: string
  staffPreview?: boolean
  children: ReactNode
}) {
  return (
    <article className="max-w-3xl pe-16 break-words" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} data-ai-tool="">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">{title}</h1>
      {staffPreview ? (
        <p className="mt-3 inline-flex min-h-11 items-center border border-[var(--ba-copper)] px-3 text-[0.95rem] font-semibold text-[var(--ba-copper-deep)]" data-staff-preview="">
          {AI_UI[lang].staffPreview}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </article>
  )
}

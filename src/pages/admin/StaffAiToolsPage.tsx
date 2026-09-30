import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AI_TOOL_FLAG_DEFAULTS, formatReportDate, toolFromSlug } from '../../../supabase/functions/_shared/ai_tools.ts'
import { AiToolCardList } from '../../components/ai/AiToolCards'
import { AiToolForm, AiToolShell } from '../../components/ai/AiToolDesk'
import { useSiteLanguage } from '../../components/SiteLanguage'
import { readAiToolFrame, type AiToolFlags } from '../../lib/aiToolApi'
import { legalSlotsFromEnv } from '../../lib/aiToolConfig'
import { renderToolCopy } from '../../lib/aiToolCopy'
import { AI_UI } from '../../lib/aiToolUi'
import { useNoIndex } from '../../lib/usePageTitle'
import { ErrorBanner, FormSkeleton } from '../../shell/ViewState'

export function StaffAiToolsPage() {
  const { lang } = useSiteLanguage()
  const ui = AI_UI[lang]
  const [flags, setFlags] = useState<AiToolFlags | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useNoIndex('AI tools | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void readAiToolFrame().then((frame) => {
      if (cancelled) return
      if (!frame) {
        setFlags({ ...AI_TOOL_FLAG_DEFAULTS })
        setError(true)
        return
      }
      setError(false)
      setFlags(frame.flags)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <div className="max-w-3xl pe-16" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">{ui.hub}</h1>
      <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">{ui.staffPreview}</p>
      {error ? (
        <div className="mt-6">
          <ErrorBanner tone="staff" message={ui.listError} retryLabel={ui.retry} onRetry={() => setAttempt((value) => value + 1)} />
        </div>
      ) : null}
      {flags ? (
        <AiToolCardList flags={flags} preview lang={lang} />
      ) : (
        <div className="mt-6">
          <FormSkeleton tone="staff" />
        </div>
      )}
    </div>
  )
}

export function StaffAiToolPage() {
  const { toolSlug } = useParams()
  const tool = toolFromSlug(toolSlug)
  const { lang } = useSiteLanguage()
  const ui = AI_UI[lang]
  const [flags, setFlags] = useState<AiToolFlags>({ ...AI_TOOL_FLAG_DEFAULTS })
  useNoIndex('AI tool preview | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void readAiToolFrame().then((frame) => {
      if (cancelled || !frame) return
      setFlags(frame.flags)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!tool) {
    return <p className="text-pearl/80">{ui.unavailable}</p>
  }

  const copy = renderToolCopy(tool, lang, legalSlotsFromEnv(30, formatReportDate(new Date()), lang))
  const on = flags[tool]
  return (
    <div className={lang === 'ar' ? 'text-pearl' : ''}>
      <AiToolShell lang={lang} title={copy.title} staffPreview={!on}>
        <p className="mb-4">
          <Link to="/admin/ai" className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-lavender)]">
            {ui.allTools}
          </Link>
        </p>
        <div className="rounded-none bg-pearl p-4 text-ink">
          <AiToolForm
            copy={copy}
            lang={lang}
            consented={false}
            fileName=""
            busy={!on}
            onConsent={() => undefined}
            onFile={() => undefined}
            onRun={() => undefined}
          />
          {!on ? <p className="mt-4 text-[0.98rem] text-ink/70">{ui.unavailable}</p> : null}
        </div>
      </AiToolShell>
    </div>
  )
}

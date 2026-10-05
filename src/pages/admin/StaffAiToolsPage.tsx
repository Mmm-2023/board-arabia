import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AI_TOOL_FLAG_DEFAULTS, formatReportDate, toolFromSlug } from '../../../supabase/functions/_shared/ai_tools.ts'
import { AiToolCardList } from '../../components/ai/AiToolCards'
import { AiToolForm, AiToolShell } from '../../components/ai/AiToolDesk'
import { DealReadinessForm, DealReadinessNotice } from '../../components/ai/DealReadinessView'
import { MarketBriefForm, MarketSearchNotice } from '../../components/ai/MarketBriefForm'
import { isMarketSector, type MarketSector } from '../../../supabase/functions/ai-tool-job/tools/market_brief.ts'
import { readAiToolFrame, readMarketSearchStatus, type AiToolFlags } from '../../lib/aiToolApi'
import { legalSlotsFromEnv } from '../../lib/aiToolConfig'
import { renderToolCopy } from '../../lib/aiToolCopy'
import { AI_UI } from '../../lib/aiToolUi'
import { useNoIndex } from '../../lib/usePageTitle'
import { ErrorBanner, FormSkeleton } from '../../shell/ViewState'

export function StaffAiToolsPage() {
  const ui = AI_UI
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
    <div className="max-w-3xl pe-16" dir="ltr" lang="en">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">{ui.hub}</h1>
      <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">{ui.staffPreview}</p>
      {error ? (
        <div className="mt-6">
          <ErrorBanner tone="staff" message={ui.listError} retryLabel={ui.retry} onRetry={() => setAttempt((value) => value + 1)} />
        </div>
      ) : null}
      {flags ? (
        <AiToolCardList flags={flags} preview />
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
  const ui = AI_UI
  const [flags, setFlags] = useState<AiToolFlags>({ ...AI_TOOL_FLAG_DEFAULTS })
  const [sector, setSector] = useState<MarketSector | ''>('')
  const [search, setSearch] = useState<'loading' | 'ready' | 'not_configured' | 'error'>(
    tool === 'market_brief' ? 'loading' : 'ready',
  )
  useNoIndex('AI tool preview | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void readAiToolFrame().then((frame) => {
      if (cancelled || !frame) return
      setFlags(frame.flags)
    })
    if (tool === 'market_brief') {
      void readMarketSearchStatus().then((status) => {
        if (cancelled) return
        if (status === 'ready') setSearch('ready')
        else if (status === 'not_configured') setSearch('not_configured')
        else setSearch('error')
      })
    }
    return () => {
      cancelled = true
    }
  }, [tool])

  if (!tool) {
    return <p className="text-pearl/80">{ui.unavailable}</p>
  }

  const copy = renderToolCopy(tool, legalSlotsFromEnv(30, formatReportDate(new Date())))
  const on = flags[tool]
  const market = tool === 'market_brief'
  const deal = tool === 'deal_readiness'
  return (
    <div>
      <AiToolShell title={copy.title} staffPreview={!on} notice={deal ? <DealReadinessNotice text={copy.banner} /> : undefined}>
        <p className="mb-4">
          <Link to="/admin/ai" className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-lavender)]">
            {ui.allTools}
          </Link>
        </p>
        <div className="w-full bg-pearl p-4 text-ink">
          {market && search === 'loading' ? <FormSkeleton tone="member" /> : null}
          {market && search === 'not_configured' ? <MarketSearchNotice surface="tool" /> : null}
          {market && search === 'error' ? (
            <p className="text-[0.98rem] text-ink/70" role="status">
              Could not check search. Retry.
            </p>
          ) : null}
          {market && search === 'ready' ? (
            <MarketBriefForm
              copy={copy}
              sector={sector}
              consented={false}
              busy={!on}
              onSector={(next) => {
                if (isMarketSector(next)) setSector(next)
              }}
              onConsent={() => undefined}
              onRun={() => undefined}
            />
          ) : null}
          {deal ? (
            <DealReadinessForm
              copy={copy}
              retentionDays={30}
              consented={false}
              fileName=""
              busy={!on}
              onConsent={() => undefined}
              onFile={() => undefined}
              onRun={() => undefined}
            />
          ) : null}
          {!market && !deal ? (
            <AiToolForm
              copy={copy}
              consented={false}
              fileName=""
              busy={!on}
              onConsent={() => undefined}
              onFile={() => undefined}
              onRun={() => undefined}
            />
          ) : null}
          {!on ? <p className="mt-4 text-[0.98rem] text-ink/70">{ui.unavailable}</p> : null}
        </div>
      </AiToolShell>
    </div>
  )
}

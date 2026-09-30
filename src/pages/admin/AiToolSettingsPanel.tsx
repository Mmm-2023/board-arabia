import { useEffect, useState, type FormEvent } from 'react'
import {
  AI_TOOL_FLAG_DEFAULTS,
  AI_TOOL_NAMES,
  AI_TOOL_ORDER,
  AI_TOOL_RETENTION_DAYS_DEFAULT,
  type AiToolKey,
} from '../../../supabase/functions/_shared/ai_tools.ts'
import { MarketSearchNotice } from '../../components/ai/MarketBriefForm'
import { useSiteLanguage } from '../../components/SiteLanguage'
import { readAiToolFrame, readMarketSearchStatus, saveAiToolFlag, saveAiToolRetention, type AiToolFlags } from '../../lib/aiToolApi'
import { toneClasses } from '../../shell/ViewState'

const fieldClass =
  'mt-2 block w-full min-h-11 max-w-[8rem] border border-pearl/20 bg-ink px-3 text-[1rem] text-pearl'

export function AiToolSettingsPanel({
  shot,
}: {
  shot?: { retentionDays: number; flags: AiToolFlags; searchConfigured?: boolean }
} = {}) {
  const { lang } = useSiteLanguage()
  const styles = toneClasses('staff')
  const [days, setDays] = useState(String(shot?.retentionDays ?? AI_TOOL_RETENTION_DAYS_DEFAULT))
  const [flags, setFlags] = useState<AiToolFlags>(shot?.flags ?? { ...AI_TOOL_FLAG_DEFAULTS })
  const [loaded, setLoaded] = useState(Boolean(shot))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [search, setSearch] = useState<'unknown' | 'ready' | 'not_configured' | 'error'>(
    shot?.searchConfigured === false ? 'not_configured' : shot?.searchConfigured === true ? 'ready' : 'unknown',
  )

  useEffect(() => {
    if (shot) return
    let cancelled = false
    void readAiToolFrame().then((frame) => {
      if (cancelled) return
      setLoaded(true)
      if (!frame) {
        setError('Could not load AI tool settings. Retry.')
        return
      }
      setDays(String(frame.retentionDays))
      setFlags(frame.flags)
    })
    void readMarketSearchStatus().then((status) => {
      if (cancelled) return
      if (status === 'ready') setSearch('ready')
      else if (status === 'not_configured') setSearch('not_configured')
      else setSearch('error')
    })
    return () => {
      cancelled = true
    }
  }, [attempt, shot])

  async function onSaveDays(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNote('')
    const next = Number(days)
    if (!Number.isInteger(next) || next < 1 || next > 3650) {
      setError('Use a whole number from 1 to 3650.')
      return
    }
    if (shot) {
      setNote('Saved.')
      return
    }
    setBusy(true)
    const ok = await saveAiToolRetention(next)
    setBusy(false)
    if (!ok) {
      setError('Could not save retention. Retry.')
      return
    }
    setNote('Saved.')
  }

  async function onFlag(tool: AiToolKey, enabled: boolean) {
    setError('')
    setNote('')
    const previous = flags[tool]
    setFlags((current) => ({ ...current, [tool]: enabled }))
    if (shot) return
    const ok = await saveAiToolFlag(tool, enabled)
    if (!ok) {
      setFlags((current) => ({ ...current, [tool]: previous }))
      setError('Could not save that flag. Retry.')
    }
  }

  return (
    <section className={`${styles.panel} mt-8 px-5 py-5 md:pe-16`} aria-label="AI tool settings" data-ai-settings="">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>AI tools</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">
        Uploads and outputs are kept for this many days, then removed. The default is {AI_TOOL_RETENTION_DAYS_DEFAULT} days.
        Tools that are off stay hidden from members.
      </p>
      <form className="mt-4" onSubmit={(event) => void onSaveDays(event)}>
        <label className="block text-[0.95rem] text-pearl/80" htmlFor="ai-retention-days">
          Retention days
          <input
            id="ai-retention-days"
            inputMode="numeric"
            value={days}
            disabled={!loaded || busy}
            onChange={(event) => setDays(event.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            className={fieldClass}
          />
        </label>
        <button
          type="submit"
          disabled={!loaded || busy}
          className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
        >
          {busy ? 'Saving' : 'Save retention'}
        </button>
      </form>
      <ul className="mt-6 space-y-3">
        {AI_TOOL_ORDER.map((tool) => (
          <li key={tool} className="flex min-h-11 items-center justify-between gap-3 border border-pearl/15 px-3 py-2">
            <span className="text-[1rem] text-pearl">{AI_TOOL_NAMES[tool]}</span>
            <button
              type="button"
              role="switch"
              aria-checked={flags[tool]}
              aria-label={`${AI_TOOL_NAMES[tool]} for members`}
              disabled={!loaded}
              onClick={() => void onFlag(tool, !flags[tool])}
              className="inline-flex min-h-11 items-center border border-pearl/30 px-3 text-[0.95rem] text-pearl"
            >
              {flags[tool] ? 'On for members' : 'Off for members'}
            </button>
          </li>
        ))}
      </ul>
      {search === 'not_configured' ? <MarketSearchNotice lang={lang} /> : null}
      {search === 'error' ? (
        <p className="mt-4 text-[0.95rem] text-pearl/80" role="status">
          Could not check search. Retry.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
          {error}{' '}
          <button type="button" className="min-h-11 font-semibold underline" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </p>
      ) : null}
      {note ? <p className="mt-3 text-[0.95rem] text-pearl/80">{note}</p> : null}
    </section>
  )
}

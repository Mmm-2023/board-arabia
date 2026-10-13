import { useEffect, useState } from 'react'
import { DailyMarketBriefView } from '../dashboard/DailyMarketBriefPage'
import { readMarketSearchStatus } from '../../lib/aiToolApi'
import {
  DAILY_BRIEF_TITLE,
  dailyBriefStatusLine,
  outletFieldError,
  readAdminDailyBrief,
  reorderDailyBriefOutlets,
  saveDailyBriefOutlet,
  saveDailyBriefSettings,
  type AdminBriefLatest,
  type MemberBrief,
  type OutletDraft,
} from '../../lib/dailyMarketBrief'
import { toneClasses } from '../../shell/ViewState'

const fieldClass =
  'mt-1 block w-full min-h-11 border border-pearl/20 bg-ink px-3 text-[1rem] text-pearl'

export function DailyMarketBriefPanel() {
  const [outlets, setOutlets] = useState<OutletDraft[]>([])
  const [enabled, setEnabled] = useState(false)
  const [membersVisible, setMembersVisible] = useState(false)
  const [latest, setLatest] = useState<AdminBriefLatest | null>(null)
  const [searchConfigured, setSearchConfigured] = useState<boolean | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void readAdminDailyBrief().then((state) => {
      if (cancelled) return
      setLoaded(true)
      if (!state) {
        setError('Could not load the daily market brief. Retry.')
        return
      }
      setOutlets(state.outlets)
      setEnabled(state.enabled)
      setMembersVisible(state.membersVisible)
      setLatest(state.latest)
      setError('')
    })
    void readMarketSearchStatus().then((status) => {
      if (cancelled) return
      if (status === 'ready') setSearchConfigured(true)
      else if (status === 'not_configured') setSearchConfigured(false)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function onSwitch(nextEnabled: boolean, nextVisible: boolean) {
    setError('')
    setNote('')
    const previous = { enabled, membersVisible }
    setEnabled(nextEnabled)
    setMembersVisible(nextVisible)
    const ok = await saveDailyBriefSettings(nextEnabled, nextVisible)
    if (!ok) {
      setEnabled(previous.enabled)
      setMembersVisible(previous.membersVisible)
      setError('Could not save those switches. Retry.')
    }
  }

  async function onSave(outlet: OutletDraft) {
    setError('')
    setNote('')
    const problem = outletFieldError(outlet.name, outlet.domain, outlet.pathPrefix)
    if (problem) {
      setError(problem)
      return
    }
    const ok = await saveDailyBriefOutlet({
      id: outlet.id,
      name: outlet.name,
      domain: outlet.domain,
      pathPrefix: outlet.pathPrefix,
      enabled: outlet.enabled,
    })
    if (!ok) {
      setError('Could not save that outlet. Retry.')
      return
    }
    setNote('Saved.')
    setAttempt((value) => value + 1)
  }

  async function onAdd(draft: { name: string; domain: string; pathPrefix: string; enabled: boolean }) {
    setError('')
    setNote('')
    const problem = outletFieldError(draft.name, draft.domain, draft.pathPrefix)
    if (problem) {
      setError(problem)
      return false
    }
    const ok = await saveDailyBriefOutlet({ id: null, ...draft })
    if (!ok) {
      setError('Could not add that outlet. Retry.')
      return false
    }
    setNote('Saved.')
    setAttempt((value) => value + 1)
    return true
  }

  async function onMove(index: number, direction: -1 | 1) {
    const next = index + direction
    if (next < 0 || next >= outlets.length) return
    const order = outlets.map((outlet) => outlet.id)
    const moved = order[index]
    const swapped = order[next]
    if (!moved || !swapped) return
    order[index] = swapped
    order[next] = moved
    setError('')
    setNote('')
    const ok = await reorderDailyBriefOutlets(order)
    if (!ok) {
      setError('Could not reorder outlets. Retry.')
      return
    }
    setAttempt((value) => value + 1)
  }

  const preview: MemberBrief | null =
    latest && latest.status === 'ok' && latest.items.length > 0
      ? { briefDate: latest.briefDate, generatedAt: latest.generatedAt, items: latest.items }
      : null
  const statusLine = dailyBriefStatusLine({ searchConfigured, latest })

  return (
    <DailyMarketBriefPanelView
      outlets={outlets}
      enabled={enabled}
      membersVisible={membersVisible}
      statusLine={loaded && !statusLine && searchConfigured === null ? 'Could not read the last run.' : statusLine}
      preview={preview}
      loaded={loaded}
      error={error}
      note={note}
      onRetry={() => setAttempt((value) => value + 1)}
      onEnabled={(value) => void onSwitch(value, membersVisible)}
      onMembersVisible={(value) => void onSwitch(enabled, value)}
      onSave={(outlet) => void onSave(outlet)}
      onAdd={onAdd}
      onMove={(index, direction) => void onMove(index, direction)}
    />
  )
}

export function DailyMarketBriefPanelView({
  outlets,
  enabled,
  membersVisible,
  statusLine,
  preview,
  loaded = true,
  error = '',
  note = '',
  onRetry,
  onEnabled,
  onMembersVisible,
  onSave,
  onAdd,
  onMove,
}: {
  outlets: OutletDraft[]
  enabled: boolean
  membersVisible: boolean
  statusLine: string
  preview: MemberBrief | null
  loaded?: boolean
  error?: string
  note?: string
  onRetry?: () => void
  onEnabled: (value: boolean) => void
  onMembersVisible: (value: boolean) => void
  onSave: (outlet: OutletDraft) => void
  onAdd: (draft: { name: string; domain: string; pathPrefix: string; enabled: boolean }) => boolean | Promise<boolean>
  onMove: (index: number, direction: -1 | 1) => void
}) {
  const styles = toneClasses('staff')
  const [drafts, setDrafts] = useState(outlets)
  const [seen, setSeen] = useState(outlets)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [pathPrefix, setPathPrefix] = useState('')
  const [adding, setAdding] = useState(true)
  if (seen !== outlets) {
    setSeen(outlets)
    setDrafts(outlets)
  }

  function patch(id: string, next: Partial<OutletDraft>) {
    setDrafts((current) => current.map((outlet) => (outlet.id === id ? { ...outlet, ...next } : outlet)))
  }

  return (
    <section className={`${styles.panel} mt-8 px-5 py-5`} aria-label={DAILY_BRIEF_TITLE} data-daily-brief-admin="">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>{DAILY_BRIEF_TITLE}</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">
        Headlines come only from these outlets. Members see a brief only when both switches are on.
      </p>
      <div data-daily-brief-status="">
        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!loaded}
            onClick={() => onEnabled(!enabled)}
            className="inline-flex min-h-11 items-center justify-between gap-3 border border-pearl/30 px-3 text-[0.95rem] text-pearl"
          >
            <span>Daily brief</span>
            <span>{enabled ? 'On' : 'Off'}</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={membersVisible}
            disabled={!loaded}
            onClick={() => onMembersVisible(!membersVisible)}
            className="inline-flex min-h-11 items-center justify-between gap-3 border border-pearl/30 px-3 text-[0.95rem] text-pearl"
          >
            <span>Visible to members</span>
            <span>{membersVisible ? 'On' : 'Off'}</span>
          </button>
        </div>
        {statusLine ? (
          <p className="mt-4 text-[1rem] leading-relaxed text-pearl" role="status">
            {statusLine}
          </p>
        ) : null}
      </div>

      <ul className="mt-6 space-y-4" data-daily-brief-outlets="">
        {drafts.map((outlet, index) => (
          <li key={outlet.id} className="border border-pearl/15 px-3 py-3">
            <label className="block text-[0.95rem] text-pearl/80">
              Name
              <input
                value={outlet.name}
                onChange={(event) => patch(outlet.id, { name: event.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="mt-3 block text-[0.95rem] text-pearl/80">
              Domain
              <input
                value={outlet.domain}
                onChange={(event) => patch(outlet.id, { domain: event.target.value })}
                className={fieldClass}
                spellCheck={false}
              />
            </label>
            <label className="mt-3 block text-[0.95rem] text-pearl/80">
              Path prefix
              <input
                value={outlet.pathPrefix}
                onChange={(event) => patch(outlet.id, { pathPrefix: event.target.value })}
                className={fieldClass}
                spellCheck={false}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={outlet.enabled}
                aria-label={`${outlet.name} enabled`}
                onClick={() => patch(outlet.id, { enabled: !outlet.enabled })}
                className="inline-flex min-h-11 items-center border border-pearl/30 px-3 text-[0.95rem] text-pearl"
              >
                {outlet.enabled ? 'Enabled' : 'Disabled'}
              </button>
              <button
                type="button"
                onClick={() => onMove(index, -1)}
                disabled={index === 0}
                className="inline-flex min-h-11 items-center border border-pearl/30 px-3 text-[0.95rem] text-pearl disabled:opacity-40"
              >
                Move up
              </button>
              <button
                type="button"
                onClick={() => onMove(index, 1)}
                disabled={index === drafts.length - 1}
                className="inline-flex min-h-11 items-center border border-pearl/30 px-3 text-[0.95rem] text-pearl disabled:opacity-40"
              >
                Move down
              </button>
              <button
                type="button"
                onClick={() => {
                  const current = drafts.find((item) => item.id === outlet.id)
                  if (current) onSave(current)
                }}
                className="ba-primary inline-flex min-h-11 items-center px-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
              >
                Save
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form
        className="mt-6 border border-pearl/15 px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (outletFieldError(name, domain, pathPrefix)) {
            onAdd({ name, domain, pathPrefix, enabled: adding })
            return
          }
          void Promise.resolve(onAdd({ name, domain, pathPrefix, enabled: adding })).then((ok) => {
            if (!ok) return
            setName('')
            setDomain('')
            setPathPrefix('')
            setAdding(true)
          })
        }}
      >
        <h3 className="text-[0.95rem] font-semibold text-pearl">Add outlet</h3>
        <label className="mt-3 block text-[0.95rem] text-pearl/80">
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
        </label>
        <label className="mt-3 block text-[0.95rem] text-pearl/80">
          Domain
          <input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            className={fieldClass}
            spellCheck={false}
          />
        </label>
        <label className="mt-3 block text-[0.95rem] text-pearl/80">
          Path prefix
          <input
            value={pathPrefix}
            onChange={(event) => setPathPrefix(event.target.value)}
            className={fieldClass}
            spellCheck={false}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={adding}
            onClick={() => setAdding((value) => !value)}
            className="inline-flex min-h-11 items-center border border-pearl/30 px-3 text-[0.95rem] text-pearl"
          >
            {adding ? 'Enabled' : 'Disabled'}
          </button>
          <button
            type="submit"
            className="ba-primary inline-flex min-h-11 items-center px-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
          >
            Add outlet
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
          {error}{' '}
          {onRetry ? (
            <button type="button" className="min-h-11 font-semibold underline" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </p>
      ) : null}
      {note ? <p className="mt-3 text-[0.95rem] text-pearl/80">{note}</p> : null}

      <div className="mt-8 border border-pearl/15 bg-pearl px-4 py-4 text-ink" data-daily-brief-preview="">
        <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/50 uppercase">Preview</h3>
        <div className="mt-3">
          {preview ? <DailyMarketBriefView brief={preview} /> : <p className="text-[1rem] text-ink/70">No brief to preview.</p>}
        </div>
      </div>
    </section>
  )
}

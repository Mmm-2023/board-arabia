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
  setDailyBriefPublish,
  type AdminBriefLatest,
  type MemberBrief,
  type OutletDraft,
  type PublishStatus,
} from '../../lib/dailyMarketBrief'
import { toneClasses } from '../../shell/ViewState'

const fieldClass =
  'mt-1 block w-full min-h-11 border border-pearl/20 bg-ink px-3 text-base text-pearl'
const buttonClass =
  'inline-flex min-h-11 items-center border border-pearl/30 px-4 text-[1.0625rem] text-pearl disabled:opacity-40'
const primaryClass = 'ba-primary inline-flex min-h-11 items-center px-4 text-[1.0625rem] font-semibold'

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
        setError('We could not load the brief. Try again.')
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
      setError('We could not save those switches. Try again.')
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
      setError('We could not save that outlet. Try again.')
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
      setError('We could not add that outlet. Try again.')
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
      setError('We could not reorder outlets. Try again.')
      return
    }
    setAttempt((value) => value + 1)
  }

  const preview: MemberBrief | null =
    latest && latest.status === 'ok' && latest.items.length > 0
      ? { briefDate: latest.briefDate, generatedAt: latest.generatedAt, items: latest.items }
      : null
  const statusLine = dailyBriefStatusLine({ searchConfigured, latest })
  const canApprove = latest?.publishStatus === 'draft' && latest.status === 'ok' && latest.items.length > 0
  const canPublish = latest?.publishStatus === 'approved' && latest.items.length > 0

  async function onReview(next: 'approved' | 'published') {
    if (!latest) return
    setError('')
    setNote('')
    const ok = await setDailyBriefPublish(latest.briefDate, next)
    if (!ok) {
      setError('We could not save that. The brief is unchanged.')
      return
    }
    setNote(next === 'approved' ? 'Brief approved.' : 'Brief published.')
    setAttempt((value) => value + 1)
  }

  return (
    <DailyMarketBriefPanelView
      outlets={outlets}
      enabled={enabled}
      membersVisible={membersVisible}
      statusLine={loaded && !statusLine && searchConfigured === null ? 'Could not read the last run.' : statusLine}
      preview={preview}
      publishStatus={latest?.publishStatus ?? null}
      canApprove={canApprove}
      canPublish={canPublish}
      loaded={loaded}
      error={error}
      note={note}
      onRetry={() => setAttempt((value) => value + 1)}
      onEnabled={(value) => void onSwitch(value, membersVisible)}
      onMembersVisible={(value) => void onSwitch(enabled, value)}
      onApprove={() => void onReview('approved')}
      onPublish={() => void onReview('published')}
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
  publishStatus = null,
  canApprove = false,
  canPublish = false,
  loaded = true,
  error = '',
  note = '',
  onRetry,
  onEnabled,
  onMembersVisible,
  onApprove,
  onPublish,
  onSave,
  onAdd,
  onMove,
}: {
  outlets: OutletDraft[]
  enabled: boolean
  membersVisible: boolean
  statusLine: string
  preview: MemberBrief | null
  publishStatus?: PublishStatus | null
  canApprove?: boolean
  canPublish?: boolean
  loaded?: boolean
  error?: string
  note?: string
  onRetry?: () => void
  onEnabled: (value: boolean) => void
  onMembersVisible: (value: boolean) => void
  onApprove?: () => void
  onPublish?: () => void
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
      <h2 className={`text-[1.0625rem] font-semibold ${styles.quiet}`}>{DAILY_BRIEF_TITLE}</h2>
      <p className="mt-3 text-base leading-relaxed text-pearl/80">
        Headlines and short snippets come only from these outlets. Members see a brief only after you publish it, and
        only when both switches are on. Nothing is emailed.
      </p>
      <div data-daily-brief-status="">
        {!loaded ? <p className="mt-4 text-base text-pearl">Loading the brief</p> : null}
        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!loaded}
            onClick={() => onEnabled(!enabled)}
            className="inline-flex min-h-11 items-center justify-between gap-3 border border-pearl/30 px-3 text-base text-pearl"
          >
            <span>Brief on</span>
            <span>{enabled ? 'On' : 'Off'}</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={membersVisible}
            disabled={!loaded}
            onClick={() => onMembersVisible(!membersVisible)}
            className="inline-flex min-h-11 items-center justify-between gap-3 border border-pearl/30 px-3 text-base text-pearl"
          >
            <span>Visible to members</span>
            <span>{membersVisible ? 'On' : 'Off'}</span>
          </button>
        </div>
        {statusLine ? (
          <p className="mt-4 text-base leading-relaxed text-pearl" role="status">
            {statusLine}
          </p>
        ) : null}
        {publishStatus ? (
          <p className="mt-2 text-base text-pearl" data-daily-brief-review="">
            Review: {publishStatus === 'approved' ? 'Approved' : publishStatus === 'published' ? 'Published' : 'Draft'}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2" data-daily-brief-actions="">
          {canApprove ? (
            <button type="button" className={primaryClass} onClick={onApprove}>
              Approve brief
            </button>
          ) : null}
          {canPublish ? (
            <button type="button" className={primaryClass} onClick={onPublish}>
              Publish brief
            </button>
          ) : null}
        </div>
      </div>

      <ul className="mt-6 space-y-4" data-daily-brief-outlets="">
        {drafts.map((outlet, index) => (
          <li key={outlet.id} className="border border-pearl/15 px-3 py-3">
            <label className="block text-[0.9375rem] text-pearl/80">
              Name
              <input
                value={outlet.name}
                onChange={(event) => patch(outlet.id, { name: event.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="mt-3 block text-[0.9375rem] text-pearl/80">
              Domain
              <input
                value={outlet.domain}
                onChange={(event) => patch(outlet.id, { domain: event.target.value })}
                className={fieldClass}
                spellCheck={false}
              />
            </label>
            <label className="mt-3 block text-[0.9375rem] text-pearl/80">
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
                className={buttonClass}
              >
                {outlet.enabled ? 'Enabled' : 'Disabled'}
              </button>
              <button
                type="button"
                onClick={() => onMove(index, -1)}
                disabled={index === 0}
                className={buttonClass}
              >
                Move up
              </button>
              <button
                type="button"
                onClick={() => onMove(index, 1)}
                disabled={index === drafts.length - 1}
                className={buttonClass}
              >
                Move down
              </button>
              <button
                type="button"
                onClick={() => {
                  const current = drafts.find((item) => item.id === outlet.id)
                  if (current) onSave(current)
                }}
                className={primaryClass}
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
        <h3 className="text-base font-semibold text-pearl">Add outlet</h3>
        <label className="mt-3 block text-[0.9375rem] text-pearl/80">
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
        </label>
        <label className="mt-3 block text-[0.9375rem] text-pearl/80">
          Domain
          <input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            className={fieldClass}
            spellCheck={false}
          />
        </label>
        <label className="mt-3 block text-[0.9375rem] text-pearl/80">
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
            className={buttonClass}
          >
            {adding ? 'Enabled' : 'Disabled'}
          </button>
          <button type="submit" className={primaryClass}>
            Add outlet
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-3 text-base text-red-300" role="alert">
          {error}{' '}
          {onRetry ? (
            <button type="button" className="inline-flex min-h-11 items-center text-[1.0625rem] font-semibold underline" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </p>
      ) : null}
      {note ? <p className="mt-3 text-base text-pearl/80">{note}</p> : null}

      <div className="mt-8 border border-pearl/15 bg-pearl px-4 py-4 text-base text-ink" data-daily-brief-preview="">
        <h3 className="text-[0.9375rem] font-semibold text-ink/70">Preview</h3>
        <div className="mt-3">
          {preview ? (
            <DailyMarketBriefView brief={preview} now={new Date(`${preview.briefDate}T12:00:00.000Z`)} />
          ) : (
            <p className="text-base text-ink/70">No brief to preview.</p>
          )}
        </div>
      </div>
    </section>
  )
}

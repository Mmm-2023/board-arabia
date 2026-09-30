import { useState } from 'react'
import { ReadinessStrip } from '../dashboard/ReadinessStrip'
import {
  readinessDraft,
  readinessKey,
  RE_READINESS_CHECKS,
  RE_READINESS_NOTE,
  RE_READINESS_STAFF,
  RE_READINESS_STATUS_LABEL,
  type ReReadinessDraft,
  type ReReadinessKey,
} from '../../lib/reOpportunityView'
import { RePlace } from '../../components/RePlace'
import { RE_READINESS_STATUS, isReReadinessStatus, type ReOpportunityCard, type ReOpportunityInventory } from '../../lib/reRedaction'
import { ErrorBanner, toneClasses } from '../../shell/ViewState'

export type ReReadinessEditorStatus = 'loading' | 'error' | 'denied' | 'unavailable' | 'ready'

export function ReReadinessEditor({
  status,
  cards,
  busyId,
  notice,
  alert,
  onRetry,
  onSave,
}: {
  status: ReReadinessEditorStatus
  cards: ReOpportunityCard[]
  busyId: string | null
  notice: string | null
  alert: string | null
  onRetry: () => void
  onSave: (card: ReOpportunityInventory, draft: ReReadinessDraft) => void
}) {
  const styles = toneClasses('staff')
  return (
    <section aria-label="Opportunity readiness" className="mt-8" data-re-staff-readiness="true">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>
        {RE_READINESS_STAFF.title}
      </h2>
      <p className={`mt-3 max-w-xl text-[0.98rem] leading-relaxed ${styles.muted}`}>{RE_READINESS_STAFF.lead}</p>
      {status === 'loading' ? (
        <div aria-busy="true" aria-label={RE_READINESS_STAFF.loading} className="mt-4 space-y-3">
          {['a', 'b'].map((id) => (
            <div key={id} className={`h-28 ${styles.skeleton} motion-reduce:animate-none animate-pulse`} />
          ))}
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="mt-4">
          <ErrorBanner
            tone="staff"
            message={RE_READINESS_STAFF.loadError}
            retryLabel={RE_READINESS_STAFF.retry}
            onRetry={onRetry}
          />
        </div>
      ) : null}
      {status === 'denied' ? <p className={`mt-4 ${styles.muted}`}>{RE_READINESS_STAFF.denied}</p> : null}
      {status === 'unavailable' ? <p className={`mt-4 ${styles.muted}`}>{RE_READINESS_STAFF.unavailable}</p> : null}
      {status === 'ready' && cards.length === 0 ? (
        <p className={`mt-4 ${styles.muted}`}>{RE_READINESS_STAFF.empty}</p>
      ) : null}
      {status === 'ready' && cards.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {cards.map((card) => (
            <li key={readinessKey(card)} className={`${styles.panel} px-4 py-4`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass-bright uppercase">{card.sector}</p>
                {card.is_demo ? (
                  <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-brass-bright uppercase">Example</p>
                ) : (
                  <p className={`text-[0.85rem] ${styles.muted}`}>Live brief</p>
                )}
              </div>
              <p className="mt-2 font-display text-[1.2rem] font-semibold text-balance">{card.one_liner}</p>
              <p className={`mt-1 text-[0.92rem] ${styles.muted}`}>
                <RePlace city={card.city} hint={card.one_liner} />
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, </span>
                {card.asset_class}
              </p>
              {card.access === 'inventory' && !card.is_demo ? (
                <ReadinessForm card={card} busy={busyId === card.id} onSave={onSave} />
              ) : (
                <div className="mt-4 bg-pearl text-ink">
                  <ReadinessStrip card={card} />
                  {card.is_demo ? (
                    <p className="ps-3 pe-3 pb-3 text-[0.9rem] text-ink/60">{RE_READINESS_STAFF.demo}</p>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? <p className="mt-4 text-[0.95rem] text-brass-bright">{notice}</p> : null}
      {alert ? (
        <p className={`mt-4 ${styles.alert}`} role="alert">
          {alert}
        </p>
      ) : null}
    </section>
  )
}

function ReadinessForm({
  card,
  busy,
  onSave,
}: {
  card: ReOpportunityInventory
  busy: boolean
  onSave: (card: ReOpportunityInventory, draft: ReReadinessDraft) => void
}) {
  const [draft, setDraft] = useState<ReReadinessDraft>(() => readinessDraft(card))
  function setStatus(key: ReReadinessKey, value: string) {
    if (!isReReadinessStatus(value)) return
    setDraft((current) => ({ ...current, [key]: value }))
  }
  return (
    <form
      className="mt-4"
      data-re-staff-edit="true"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(card, draft)
      }}
    >
      <div className="space-y-3">
        {RE_READINESS_CHECKS.map((check) => {
          const id = `readiness-${card.id}-${check.key}`
          return (
            <div key={check.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <label htmlFor={id} className="text-[0.95rem] text-pearl">
                {check.label}
              </label>
              <select
                id={id}
                name={check.key}
                value={draft[check.key]}
                disabled={busy}
                onChange={(event) => setStatus(check.key, event.target.value)}
                className="min-h-11 w-full border border-white/30 bg-pearl ps-3 pe-3 text-[0.95rem] text-ink sm:w-52"
              >
                {RE_READINESS_STATUS.map((status) => (
                  <option key={status} value={status}>
                    {RE_READINESS_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[0.82rem] text-pearl/80">{RE_READINESS_NOTE}</p>
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy || undefined}
        className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
      >
        {busy ? RE_READINESS_STAFF.saving : RE_READINESS_STAFF.save}
      </button>
    </form>
  )
}

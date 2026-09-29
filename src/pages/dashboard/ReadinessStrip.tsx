import {
  readinessChecks,
  RE_READINESS_NOTE,
  type ReReadinessInput,
} from '../../lib/reOpportunityView'
import type { ReReadinessStatus } from '../../lib/reRedaction'

const DOT: Record<ReReadinessStatus, string> = {
  ready: 'bg-[var(--ba-indigo)]',
  in_progress: 'bg-[var(--ba-copper)]',
  not_yet: 'bg-[var(--ba-warn)]',
  not_applicable: 'bg-[var(--ba-muted)]',
}

export function ReadinessStrip({ card }: { card: ReReadinessInput }) {
  const checks = readinessChecks(card)
  return (
    <div className="mt-4" data-re-readiness="clear">
      <h3 className="text-start text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">Readiness</h3>
      <ul className="mt-2 border border-[var(--ba-line)]" aria-label="Regulatory readiness">
        {checks.map((check) => (
          <li
            key={check.key}
            data-re-check={check.key}
            data-re-status={check.status}
            className="flex items-center justify-between gap-3 border-b border-[var(--ba-line)] py-2 ps-3 pe-3 last:border-b-0"
          >
            <span className="text-start text-[0.92rem] text-[var(--ba-ink)]">{check.label}</span>
            <span className="inline-flex min-h-8 shrink-0 items-center gap-2 border border-[var(--ba-line)] bg-white ps-2 pe-2.5 text-[0.78rem] font-semibold text-[var(--ba-ink)]">
              <span aria-hidden="true" className={`h-2 w-2 ${DOT[check.status]}`} />
              {check.statusLabel}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-start text-[0.82rem] text-[var(--ba-muted)]">{RE_READINESS_NOTE}</p>
    </div>
  )
}

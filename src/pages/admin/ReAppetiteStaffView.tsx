import { reAppetiteLine, type ReAppetiteStaffRow } from '../../lib/reAppetite'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { ErrorBanner, toneClasses } from '../../shell/ViewState'

export type ReAppetiteStaffStatus = 'loading' | 'error' | 'denied' | 'unavailable' | 'ready'

const copy = STAFF_VIEWS.reAppetite

export function ReAppetiteStaffView({
  status,
  rows,
  onRetry,
}: {
  status: ReAppetiteStaffStatus
  rows: ReAppetiteStaffRow[]
  onRetry: () => void
}) {
  const styles = toneClasses('staff')
  return (
    <section aria-label={copy.title} data-re-appetite-staff="true" className="mt-8">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>{copy.title}</h2>
      <p className={`mt-2 max-w-xl text-[0.98rem] leading-relaxed ${styles.muted}`}>{copy.lead}</p>
      {status === 'loading' ? (
        <div aria-busy="true" aria-label={copy.loading} className="mt-4 space-y-3">
          <div className={`h-16 ${styles.skeleton} motion-reduce:animate-none animate-pulse`} />
          <div className={`h-16 ${styles.skeleton} motion-reduce:animate-none animate-pulse`} />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="mt-4">
          <ErrorBanner tone="staff" message={copy.error} retryLabel={copy.retry} onRetry={onRetry} />
        </div>
      ) : null}
      {status === 'denied' ? <p className={`mt-4 ${styles.muted}`}>{copy.denied}</p> : null}
      {status === 'unavailable' ? <p className={`mt-4 ${styles.muted}`}>{copy.unavailable}</p> : null}
      {status === 'ready' && rows.length === 0 ? <p className={`mt-4 ${styles.muted}`}>{copy.empty}</p> : null}
      {status === 'ready' && rows.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.member_id} data-re-appetite-member={row.member_id} className={`${styles.panel} px-4 py-4`}>
              <p className="font-display text-[1.2rem] font-semibold">{row.member_name}</p>
              <p className={`mt-1 ${styles.muted}`}>{reAppetiteLine(row.appetite)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

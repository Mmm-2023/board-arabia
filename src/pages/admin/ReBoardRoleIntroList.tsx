import {
  reBoardSeatLabel,
  type ReBoardRoleIntroRow,
} from '../../lib/reBoardRoles'
import { reAssetClassLabel } from '../../lib/reRedaction'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { toneClasses } from '../../shell/ViewState'

export function ReBoardRoleIntroList({
  rows,
  error,
  busy,
  declineId,
  onApprove,
  onDecline,
  onCancelDecline,
  onConfirmDecline,
}: {
  rows: ReBoardRoleIntroRow[] | null
  error: boolean
  busy: boolean
  declineId: string | null
  onApprove: (id: string) => void
  onDecline: (id: string) => void
  onCancelDecline: () => void
  onConfirmDecline: () => void
}) {
  const styles = toneClasses('staff')
  const copy = STAFF_VIEWS.reBoardRoles
  if (!rows || rows.length === 0) {
    if (!error) return null
    return (
      <section aria-label="Board role intros" className="mt-8">
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>{copy.queue}</h2>
        <p className={`mt-3 ${styles.muted}`}>{copy.queueError}</p>
      </section>
    )
  }

  return (
    <section aria-label="Board role intros" className="mt-8" data-re-role-queue="true">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>{copy.queue}</h2>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className={`${styles.panel} px-4 py-4`} data-re-role-intro={row.id}>
            <p className="font-display text-[1.2rem] font-semibold">{row.title}</p>
            <p className={`mt-1 ${styles.muted}`}>
              {row.organisation_name}. {reBoardSeatLabel(row.seat_kind)}. {row.sector}. {row.city}.{' '}
              {reAssetClassLabel(row.asset_class)}. {copy.requestedBy} {row.member_name}.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => onApprove(row.id)}
                className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
              >
                {copy.approve}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecline(row.id)}
                className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 ${styles.secondary}`}
              >
                {copy.decline}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className={`mt-3 ${styles.alert}`}>{copy.saveError}</p> : null}
      {declineId ? (
        <ConfirmDialog
          tone="staff"
          title={copy.declineTitle}
          body={copy.declineBody}
          busy={busy}
          onCancel={onCancelDecline}
          onConfirm={onConfirmDecline}
        />
      ) : null}
    </section>
  )
}

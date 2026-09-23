import { formatPublicUsd } from '../../lib/capacity'
import { seatLine } from '../../lib/platformStats'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, toneClasses } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { useAdmin } from './context'

export function CapacityPage() {
  const room = useAdmin()
  const styles = toneClasses('staff')
  useNoIndex('Capacity | Board Arabia')

  if (!room.refreshedAt && room.refreshError && !room.capacity) return null

  if (room.loading && !room.capacity && !room.listError) {
    return <CardSkeleton tone="staff" label="Loading capacity" />
  }

  const seats = room.platform ? seatLine(room.platform) : null
  const moneyHidden =
    !room.platform?.investment && !room.platform?.foAum && !room.platform?.turnover

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Capacity</h1>
      <p className="mt-2 text-[0.95rem] text-stone/65">
        Founding fill and public aggregate totals. Individual amounts stay off this summary.
      </p>

      <section className={`${styles.panel} mt-8 px-5 py-5`}>
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
          Founding 100
        </h2>
        {room.capacity ? (
          <div className="mt-4 space-y-4">
            <Meter label="Saudi Arabia" value={room.capacity.ksa} cap={room.capacity.ksa_cap} />
            <Meter label="International" value={room.capacity.intl} cap={room.capacity.intl_cap} />
          </div>
        ) : (
          <p className={`mt-3 ${styles.muted}`}>
            Saudi Arabia 0 · International 0. Totals are unavailable right now.
          </p>
        )}
        <p className={`mt-4 text-[0.95rem] ${styles.muted}`}>
          {seats ? `Admitted ${seats.label}. ${seats.split}.` : 'Admitted 0 / 100.'}
        </p>
      </section>

      <section className={`${styles.panel} mt-4 px-5 py-5`}>
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
          Public aggregates
        </h2>
        <p className="mt-3 text-[0.98rem] text-pearl/80">
          Investment: {room.platform?.investment == null ? 'Hidden' : formatPublicUsd(room.platform.investment)}
        </p>
        <p className="mt-2 text-[0.98rem] text-pearl/80">
          Family office AUM: {room.platform?.foAum == null ? 'Hidden' : formatPublicUsd(room.platform.foAum)}
        </p>
        <p className="mt-2 text-[0.98rem] text-pearl/80">
          Turnover: {room.platform?.turnover == null ? 'Hidden' : formatPublicUsd(room.platform.turnover)}
        </p>
        {moneyHidden && <p className={`mt-3 ${styles.muted}`}>{STAFF_VIEWS.capacity.early}</p>}
      </section>
    </div>
  )
}

function Meter({ label, value, cap }: { label: string; value: number; cap: number }) {
  const width = cap > 0 ? Math.min(100, Math.round((value / cap) * 100)) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p>{label}</p>
        <p className="font-display text-[1.05rem] font-semibold">
          {value}
          <span className="text-pearl/40"> / {cap}</span>
        </p>
      </div>
      <div className="mt-2 h-1.5 bg-pearl/10" aria-hidden="true">
        <div className="h-1.5 bg-brass" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

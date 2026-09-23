import { Link } from 'react-router-dom'
import { formatPublicUsd } from '../../lib/capacity'
import { seatLine } from '../../lib/platformStats'
import { useNoIndex } from '../../lib/usePageTitle'
import { EmptyState, HomeSkeleton, toneClasses } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { useAdmin } from './context'

export function AdminHome() {
  const room = useAdmin()
  const styles = toneClasses('staff')
  useNoIndex('Home | Board Arabia')

  if (!room.refreshedAt && room.refreshError) return null

  if (room.loading && !room.hasLoaded) return <HomeSkeleton tone="staff" />

  const pending = room.apps.filter((row) => row.status === 'pending')
  const failedMail = room.events.filter((row) => row.status === 'error' || row.status === 'failed')
  const awaiting = room.peerInvites.filter((row) => row.status === 'pending' || row.status === 'opened')
  const capacityAlerts = alertsFor(room.capacity)
  const attention = pending.length + failedMail.length + awaiting.length + capacityAlerts.length > 0
  const admitted = room.platform ? seatLine(room.platform) : null
  const admins = room.staffRows.filter((row) => row.role !== 'master').length
  const recent = room.events.slice(0, 5)

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Staff home</h1>

      <section aria-label="Needs attention" className="mt-8">
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>
          Needs attention
        </h2>
        {!attention ? (
          <div className="mt-3">
            <EmptyState tone="staff" message={STAFF_VIEWS.home.empty} action={{ label: 'People', to: '/admin/people' }} />
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.length > 0 && (
              <li className={`${styles.panel} px-4 py-4`}>
                <p className="font-display text-[1.4rem] font-semibold">{pending.length}</p>
                <p className={`mt-1 ${styles.muted}`}>Pending applications</p>
                <Link to="/admin/applications" className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
                  Review applications
                </Link>
              </li>
            )}
            {failedMail.length > 0 && (
              <li className={`${styles.panel} px-4 py-4`}>
                <p className={styles.muted}>{failedMail.length} failed or stuck email events.</p>
                <Link to="/admin/email" className="mt-2 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
                  Email
                </Link>
              </li>
            )}
            {awaiting.length > 0 && (
              <li className={`${styles.panel} px-4 py-4`}>
                <p className={styles.muted}>{awaiting.length} invite links awaiting apply.</p>
              </li>
            )}
            {capacityAlerts.map((line) => (
              <li key={line} className={`${styles.panel} px-4 py-4`}>
                <p className={styles.muted}>{line}</p>
                <Link to="/admin/capacity" className="mt-2 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
                  Open Capacity
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Status" className="mt-8">
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>
          Status
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <article className={`${styles.panel} px-4 py-4`}>
            <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
              Pending applications
            </p>
            <p className="mt-2 font-display text-[1.6rem] font-semibold">{pending.length}</p>
          </article>
          <article className={`${styles.panel} px-4 py-4`}>
            <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
              Founding admitted
            </p>
            <p className="mt-2 font-display text-[1.6rem] font-semibold">
              {admitted ? admitted.label : room.capacity ? `${room.capacity.ksa + room.capacity.intl} / ${room.capacity.total_cap}` : '0 / 100'}
            </p>
            <p className={`mt-1 text-[0.9rem] ${styles.muted}`}>
              {admitted
                ? admitted.split
                : room.capacity
                  ? `Saudi Arabia ${room.capacity.ksa} · International ${room.capacity.intl}`
                  : 'Saudi Arabia 0 · International 0'}
            </p>
          </article>
          <article className={`${styles.panel} px-4 py-4 sm:col-span-2`}>
            <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
              Platform aggregates
            </p>
            <AggregateLine label="Investment" amount={room.platform?.investment ?? null} />
            <AggregateLine label="Family office AUM" amount={room.platform?.foAum ?? null} />
            <AggregateLine label="Turnover" amount={room.platform?.turnover ?? null} />
            {!room.platform?.investment && !room.platform?.foAum && !room.platform?.turnover && (
              <p className={`mt-2 text-[0.95rem] ${styles.muted}`}>{STAFF_VIEWS.capacity.early}</p>
            )}
          </article>
          <article className={`${styles.panel} px-4 py-4`}>
            <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
              Admins
            </p>
            <p className="mt-2 font-display text-[1.6rem] font-semibold">{admins}</p>
          </article>
          <article className={`${styles.panel} px-4 py-4`}>
            <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
              Sponsors
            </p>
            <p className="mt-2 font-display text-[1.6rem] font-semibold">0</p>
          </article>
        </div>
      </section>

      <section aria-label="Next actions" className="mt-8">
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>
          Next actions
        </h2>
        <Link
          to="/admin/applications"
          className={`mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.primary}`}
        >
          Review applications
        </Link>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <li>
            <Link to="/admin/applications" className="inline-flex min-h-11 items-center text-pearl/75">
              Admit from shortlist
            </Link>
          </li>
          <li>
            <Link to="/admin/people" className="inline-flex min-h-11 items-center text-pearl/75">
              Invite admin
            </Link>
          </li>
          <li>
            <Link to="/admin/capacity" className="inline-flex min-h-11 items-center text-pearl/75">
              Open Capacity
            </Link>
          </li>
        </ul>
      </section>

      <section aria-label="Recent email" className="mt-10">
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>
          Recent email
        </h2>
        {recent.length === 0 ? (
          <p className={`mt-3 ${styles.muted}`}>No email events yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {recent.map((event) => (
              <li key={event.id} className={`${styles.panel} px-4 py-3`}>
                <p className="text-[0.95rem]">{event.subject}</p>
                <p className={`mt-1 text-[0.85rem] ${styles.muted}`}>
                  {event.kind} · {event.status}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link to="/admin/email" className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
          Email
        </Link>
      </section>
    </div>
  )
}

function AggregateLine({ label, amount }: { label: string; amount: number | null }) {
  return (
    <p className="mt-2 text-[0.98rem] text-pearl/80">
      {label}: {amount == null ? 'Hidden' : formatPublicUsd(amount)}
    </p>
  )
}

function alertsFor(capacity: { ksa: number; intl: number; ksa_cap: number; intl_cap: number } | null) {
  if (!capacity) return []
  const lines: string[] = []
  if (nearFull(capacity.ksa, capacity.ksa_cap)) lines.push('Saudi Arabia seats are near full.')
  if (nearFull(capacity.intl, capacity.intl_cap)) lines.push('International seats are near full.')
  return lines
}

function nearFull(value: number, cap: number) {
  if (cap <= 0 || value <= 0) return false
  return cap - value <= 5 || value / cap >= 0.9
}

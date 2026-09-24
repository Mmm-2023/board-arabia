import { Link } from 'react-router-dom'
import { useNoIndex } from '../../lib/usePageTitle'
import { FormSkeleton, toneClasses } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { useAdmin } from './context'

export function SettingsPage() {
  const room = useAdmin()
  const styles = toneClasses('staff')
  useNoIndex('Settings | Board Arabia')

  if (room.loading && !room.hasLoaded) return <FormSkeleton tone="staff" />

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Settings</h1>
      <p className="mt-3 text-[0.98rem] leading-relaxed text-stone/70">{STAFF_VIEWS.settings.optional}</p>

      <section className={`${styles.panel} mt-8 px-5 py-5`}>
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
          Booking link
        </h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">{STAFF_VIEWS.settings.booking}</p>
        <p className={`mt-2 text-[0.9rem] ${styles.muted}`}>Read only. Locked.</p>
      </section>

      <section className={`${styles.panel} mt-4 px-5 py-5`}>
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
          Founding copy
        </h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">
          Founding membership is 100 seats, split between Saudi Arabia and International. Public
          totals stay on the marketing site.
        </p>
      </section>

      <section className={`${styles.panel} mt-4 px-5 py-5`}>
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
          Role switcher
        </h2>
        {room.isMember ? (
          <Link
            to="/dashboard"
            className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase"
          >
            Switch to member
          </Link>
        ) : (
          <p className={`mt-3 ${styles.muted}`}>{STAFF_VIEWS.settings.switchAbsent}</p>
        )}
      </section>

      <section className={`${styles.panel} mt-4 px-5 py-5`}>
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
          Promote admin
        </h2>
        {room.masterKnown === false ? (
          <p className={`mt-3 ${styles.muted}`}>{STAFF_VIEWS.settings.masterLock}</p>
        ) : (
          <>
            <p className={`mt-3 ${styles.muted}`}>
              Master login can promote the primary staff seat. Other people are invited from People.
            </p>
            <button
              type="button"
              disabled={room.updatingId === 'invite-michael'}
              onClick={() => void room.runInvite('invite-michael', { seat: 'ksa', admitMember: true })}
              className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.72rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
            >
              Invite / promote Michael
            </button>
          </>
        )}
      </section>
    </div>
  )
}

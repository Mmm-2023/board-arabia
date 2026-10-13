import { useState } from 'react'
import type { StaffDirectoryRow } from '../../lib/supabase'
import { staffRemove, staffSetRole } from '../../lib/supabase'
import { lastOwnerLocked, staffRoleLabel, staffRosterName } from '../../lib/staffRoster'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { toneClasses } from '../../shell/ViewState'
import { PanelNotice } from './bits'
import { useAdmin } from './context'

export function StaffRosterPanel() {
  const room = useAdmin()
  const styles = toneClasses('staff')
  const owner = room.staffRole === 'master'
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [removing, setRemoving] = useState<StaffDirectoryRow | null>(null)

  async function onRole(row: StaffDirectoryRow, role: 'staff' | 'master') {
    if (!row.user_id || role === row.role || lastOwnerLocked(row.role, room.staffRows)) return
    setBusyId(row.user_id)
    setError('')
    setNote('')
    const result = await staffSetRole(row.user_id, role)
    setBusyId(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNote('Role saved.')
    room.refresh()
  }

  async function onRemove(row: StaffDirectoryRow) {
    if (!row.user_id || lastOwnerLocked(row.role, room.staffRows)) return
    setBusyId(row.user_id)
    setError('')
    setNote('')
    const result = await staffRemove(row.user_id)
    setBusyId(null)
    setRemoving(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNote('Staff member removed.')
    room.refresh()
  }

  return (
    <section className={`${styles.panel} mt-8 px-5 py-5`} data-staff-roster="true" aria-label="Staff">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>Staff</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">
        {owner
          ? 'Only an owner can change a role or remove staff. New staff join as Admin unless you choose Owner. The last owner stays in place.'
          : 'Only an owner can change a role or remove staff. The last owner stays in place.'}
      </p>
      {room.panelFailed.staff && room.staffRows.length === 0 ? (
        <div className="mt-4">
          <PanelNotice />
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {note ? <p className="mt-3 text-[0.95rem] text-pearl/80">{note}</p> : null}
      {room.staffRows.length === 0 && !room.panelFailed.staff ? (
        <p className={`mt-4 ${styles.muted}`}>No staff yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {room.staffRows.map((row) => {
            const locked = lastOwnerLocked(row.role, room.staffRows)
            const name = staffRosterName(row)
            const label = staffRoleLabel(row.role) || 'Admin'
            const key = row.user_id || row.email
            return (
              <li
                key={key}
                data-staff-row={key}
                data-last-owner={locked ? 'true' : 'false'}
                className="border border-pearl/10 px-4 py-4"
              >
                <p className="text-[0.95rem] text-stone/85">{name}</p>
                <p className="mt-1 text-[0.8rem] text-pearl/45">{label}</p>
                {locked ? (
                  <p className="mt-2 text-[0.85rem] text-pearl/55">The last owner stays in place.</p>
                ) : null}
                {owner && row.user_id && !locked ? (
                  <div className="mt-3 flex flex-wrap items-end gap-3" data-staff-manage="true">
                    <label className="block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
                      Role for {name}
                      <select
                        value={row.role === 'master' ? 'master' : 'staff'}
                        disabled={busyId === row.user_id}
                        onChange={(event) =>
                          void onRole(row, event.target.value === 'master' ? 'master' : 'staff')
                        }
                        className="mt-2 block min-h-11 border border-pearl/20 bg-ink px-3 text-[0.9rem] text-pearl normal-case"
                      >
                        <option value="staff">Admin</option>
                        <option value="master">Owner</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busyId === row.user_id}
                      onClick={() => setRemoving(row)}
                      className="inline-flex min-h-11 items-center border border-pearl/30 px-3 text-[0.75rem] font-semibold text-pearl/80 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {removing ? (
        <ConfirmDialog
          tone="staff"
          title="Remove this staff member?"
          body="They lose admin access. A member seat is left as it is. Cancel leaves the staff row in place."
          busy={busyId === removing.user_id}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void onRemove(removing)}
        />
      ) : null}
    </section>
  )
}

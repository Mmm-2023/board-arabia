import { useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { accessActorLabel, accessObjectLabel } from './accessLogLabels'
import { StaffOwnNameCard } from './StaffOwnNameCard'
import { useOwnStaffName } from './useOwnStaffName'

type LogRow = {
  id: string
  object_type: string
  action: string
  at: string
  actor_name?: string | null
  actor_role?: string | null
}

export function StaffAccessLogView({
  rows,
  filtered,
  error,
  onFilter,
  nameSlot = null,
}: {
  rows: { objectLabel: string; action: string; at: string; actor: string }[]
  filtered: boolean
  error: string
  onFilter: (memberId: string) => void
  nameSlot?: ReactNode
}) {
  const [memberId, setMemberId] = useState('')
  return (
    <div className="max-w-3xl" data-screen="staff-access-log">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Access log</h1>
      <p className="mt-2 max-w-xl text-[0.95rem] text-stone/70">
        Staff reads of one member. Filter by member. This list does not show contact details.
      </p>
      {nameSlot}
      <form
        className="mt-5 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          onFilter(memberId.trim())
        }}
      >
        <label className="block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
          Member
          <input
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            className="mt-2 block min-h-11 w-64 border border-pearl/20 bg-transparent px-3 text-[0.95rem] text-pearl"
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
        >
          Show
        </button>
      </form>
      {error ? (
        <p className="mt-4 text-[0.95rem] text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {filtered ? <p className="mt-4 text-[0.9rem] text-pearl/60">Filtered to one member.</p> : null}
      <ul className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <li key={`${row.at}-${index}`} className="border border-pearl/10 px-4 py-4">
            <p className="text-[0.95rem] text-pearl">{row.objectLabel}</p>
            <p className="mt-1 text-[0.85rem] text-pearl/60">
              {row.actor ? `${row.actor} ` : ''}
              {row.action} · {row.at}
            </p>
          </li>
        ))}
      </ul>
      {filtered && rows.length === 0 && !error ? (
        <p className="mt-4 text-[0.95rem] text-pearl/60">No reads for this member.</p>
      ) : null}
    </div>
  )
}

export function StaffAccessLogPage() {
  const [rows, setRows] = useState<{ objectLabel: string; action: string; at: string; actor: string }[]>([])
  const [filtered, setFiltered] = useState(false)
  const [error, setError] = useState('')
  const ownName = useOwnStaffName()
  useNoIndex('Access log | Board Arabia')

  async function onFilter(memberId: string) {
    setError('')
    if (!/^[0-9a-f-]{36}$/i.test(memberId)) {
      setRows([])
      setFiltered(false)
      setError('Enter the member id from the people list.')
      return
    }
    const { data, error: rpcError } = await supabase.rpc('staff_list_access_log', { p_member_id: memberId })
    if (rpcError) {
      setRows([])
      setFiltered(false)
      setError('Could not load the access log.')
      return
    }
    const list = Array.isArray(data) ? data : []
    setRows(
      list.map((item) => {
        const row = item as LogRow
        const at = row.at ? new Date(row.at).toLocaleString('en-GB') : ''
        return {
          objectLabel: accessObjectLabel(String(row.object_type || '')),
          action: row.action === 'read' ? 'read' : 'read',
          actor: accessActorLabel(row.actor_name, row.actor_role),
          at,
        }
      }),
    )
    setFiltered(true)
  }

  return (
    <StaffAccessLogView
      rows={rows}
      filtered={filtered}
      error={error}
      onFilter={(id) => void onFilter(id)}
      nameSlot={
        <StaffOwnNameCard
          savedName={ownName.name}
          ready={ownName.ready}
          busy={ownName.busy}
          error={ownName.error}
          onSave={(value) => void ownName.save(value)}
        />
      }
    />
  )
}

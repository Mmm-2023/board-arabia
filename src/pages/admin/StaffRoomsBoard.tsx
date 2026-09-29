import { useState } from 'react'
import { DEAL_COPY, openedByLabel, statusLabel, type StaffDealRoom } from '../../lib/dealRoomView'
import { ConfirmDialog } from '../../shell/ConfirmDialog'

export function StaffRoomsBoard({
  rooms,
  busyId,
  error,
  onClose,
}: {
  rooms: StaffDealRoom[]
  busyId: string | null
  error: string
  onClose: (roomId: string) => void
}) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const pending = rooms.find((room) => room.id === pendingId) ?? null

  return (
    <div data-deal-staff="" className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-lavender)] uppercase">Rooms</p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Deal rooms</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-pearl/70">{DEAL_COPY.staffIntro}</p>
      {error ? (
        <p className="mt-4 text-[0.98rem] text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-8 grid gap-3">
        {rooms.map((room) => (
          <li key={room.id}>
            <article className="border border-white/15 bg-white/[0.04] px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-[var(--ba-lavender)] uppercase">
                  {openedByLabel(room.openedBy)}
                </p>
                <p className="text-[0.85rem] text-pearl/60">{statusLabel(room.status)}</p>
              </div>
              <h2 className="mt-3 font-display text-[1.45rem] font-semibold tracking-[-0.03em]">{room.name}</h2>
              {room.purpose ? <p className="mt-3 text-[1rem] leading-relaxed text-pearl/75">{room.purpose}</p> : null}
              <p className="mt-4 text-[0.92rem] text-pearl/60">
                {room.acceptedCount} accepted · {room.invitedCount} invited
              </p>
              {room.status === 'open' ? (
                <button
                  type="button"
                  disabled={busyId === room.id}
                  onClick={() => setPendingId(room.id)}
                  className="mt-4 inline-flex min-h-11 items-center border border-white/25 px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
                >
                  Close room
                </button>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
      {pending ? (
        <ConfirmDialog
          tone="staff"
          title="Close this room?"
          body="People will no longer be able to join."
          busy={busyId === pending.id}
          onCancel={() => setPendingId(null)}
          onConfirm={() => {
            onClose(pending.id)
            setPendingId(null)
          }}
        />
      ) : null}
    </div>
  )
}

import { ownerName, type MemberDealRoom } from '../../lib/dealRoomView'

export function PendingInviteCards({
  invites,
  busyId,
  errors,
  onAccept,
  onDecline,
}: {
  invites: MemberDealRoom[]
  busyId: string | null
  errors: Record<string, string>
  onAccept: (roomId: string) => void
  onDecline: (roomId: string) => void
}) {
  if (invites.length === 0) return null
  return (
    <ul className="space-y-3" data-deal-accept="">
      {invites.map((room) => {
        const busy = busyId === room.id
        return (
          <li key={room.id} className="border border-[var(--ba-line)] bg-white px-4 py-4">
            <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">Room invite</p>
            <h3 className="mt-2 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">{room.name}</h3>
            {room.purpose ? <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/75">{room.purpose}</p> : null}
            <p className="mt-2 text-[0.92rem] text-ink/60">Invited by {ownerName(room)}.</p>
            {room.status === 'closed' ? <p className="mt-2 text-[0.92rem] text-ink/60">This room is closed.</p> : null}
            <div className="mt-4 flex flex-wrap gap-3">
              {room.status === 'open' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAccept(room.id)}
                  className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
                >
                  Accept
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecline(room.id)}
                className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
              >
                Decline
              </button>
            </div>
            {errors[room.id] ? (
              <p className="mt-3 text-[0.95rem] text-[var(--ba-error)]" role="alert">
                {errors[room.id]}
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

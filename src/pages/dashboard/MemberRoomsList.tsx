import { Link } from 'react-router-dom'
import { peopleLine, statusLabel, type MemberDealRoom } from '../../lib/dealRoomView'

export function MemberRoomsList({ rooms }: { rooms: MemberDealRoom[] }) {
  return (
    <ul className="mt-4 grid gap-3">
      {rooms.map((room) => (
        <li key={room.id}>
          <article className="border border-[var(--ba-line)] bg-white px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
                {room.myRole === 'owner' ? 'Your room' : room.myInviteStatus === 'invited' ? 'Invite' : 'Joined'}
              </p>
              <p className="text-[0.85rem] text-ink/55">{statusLabel(room.status)}</p>
            </div>
            <h3 className="mt-3 font-display text-[1.45rem] font-semibold tracking-[-0.03em]">{room.name}</h3>
            {room.purpose ? <p className="mt-3 text-[1rem] leading-relaxed text-ink/75">{room.purpose}</p> : null}
            <p className="mt-4 text-[0.92rem] text-ink/60">{peopleLine(room)}</p>
            <Link
              to={`/dashboard/deals/rooms/${room.id}`}
              className="mt-4 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
            >
              {room.myInviteStatus === 'invited' ? 'Review invite' : 'Open room'}
            </Link>
          </article>
        </li>
      ))}
    </ul>
  )
}

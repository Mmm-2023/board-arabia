import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { MemberDealRoom } from '../../lib/dealRoomView'
import { DEAL_COPY } from '../../lib/dealRoomView'
import { EmptyState } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { MemberRoomsList } from './MemberRoomsList'

export const OPEN_ROOM_PATH = '/dashboard/deals/rooms/new'

export function YourRooms({ rooms }: { rooms: MemberDealRoom[] }) {
  if (rooms.length === 0) {
    return (
      <div data-rooms-empty="true">
        <EmptyState
          tone="member"
          message={MEMBER_VIEWS.rooms.empty}
          action={{ label: MEMBER_VIEWS.rooms.openRoom, to: OPEN_ROOM_PATH, wide: true }}
        />
      </div>
    )
  }
  return (
    <div data-rooms-empty="false">
      <MemberRoomsList rooms={rooms} />
    </div>
  )
}

export function DealRoomsView({
  showCreate,
  yours,
  openedByAdmin,
}: {
  showCreate: boolean
  yours: ReactNode
  openedByAdmin: ReactNode
}) {
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Deal rooms</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">{DEAL_COPY.yourRoomsIntro}</p>
      {showCreate ? (
        <Link
          to={OPEN_ROOM_PATH}
          className="ba-primary mt-5 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
        >
          {MEMBER_VIEWS.rooms.emptyCta}
        </Link>
      ) : null}

      <section aria-label="Your rooms" className="mt-10">
        <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.03em]">Your rooms</h2>
        <div className="mt-4">{yours}</div>
      </section>

      <section aria-label="Opened by our admin team" className="mt-10">
        <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.03em]">Opened by our admin team</h2>
        <div className="mt-4">{openedByAdmin}</div>
      </section>
    </div>
  )
}

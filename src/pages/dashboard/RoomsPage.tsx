import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMyDealRooms } from '../../lib/dealRoomApi'
import { fetchRooms } from '../../lib/demoFetch'
import type { MemberDealRoom } from '../../lib/dealRoomView'
import { DEAL_COPY } from '../../lib/dealRoomView'
import type { RoomCard } from '../../lib/demoRows'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { MemberRoomsList } from './MemberRoomsList'
import { RoomsBoard } from './RoomsBoard'

const ROOMS_EMPTY = 'A deal room opens for a live mandate, and only by admin. None are open.'

type AdminState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rooms: RoomCard[] }

type MineState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'denied'; message: string }
  | { status: 'ready'; rooms: MemberDealRoom[] }

export function RoomsPage() {
  const [admin, setAdmin] = useState<AdminState>({ status: 'loading' })
  const [mine, setMine] = useState<MineState>({ status: 'loading' })
  const [adminAttempt, setAdminAttempt] = useState(0)
  const [mineAttempt, setMineAttempt] = useState(0)
  useNoIndex('Rooms | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchRooms().then((result) => {
      if (cancelled) return
      if (result.status === 'error') {
        setAdmin({ status: 'error' })
        return
      }
      setAdmin({ status: 'ready', rooms: result.status === 'ready' ? result.rows : [] })
    })
    return () => {
      cancelled = true
    }
  }, [adminAttempt])

  useEffect(() => {
    let cancelled = false
    void fetchMyDealRooms().then((result) => {
      if (cancelled) return
      if (result.status === 'ready') setMine({ status: 'ready', rooms: result.rows })
      else if (result.status === 'denied') setMine({ status: 'denied', message: result.message })
      else if (result.status === 'missing') setMine({ status: 'missing' })
      else setMine({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [mineAttempt])

  const canCreate = mine.status !== 'denied'

  return (
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Rooms</p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Rooms</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">{DEAL_COPY.yourRoomsIntro}</p>
      {canCreate ? (
        <Link
          to="/dashboard/rooms/new"
          className="ba-primary mt-5 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
        >
          {MEMBER_VIEWS.rooms.emptyCta}
        </Link>
      ) : null}

      <section aria-label="Your rooms" className="mt-10">
        <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.03em]">Your rooms</h2>
        <div className="mt-4">
          {mine.status === 'loading' ? <CardSkeleton tone="member" label="Loading your rooms" /> : null}
          {mine.status === 'error' || mine.status === 'missing' ? (
            <ErrorBanner
              tone="member"
              message={MEMBER_VIEWS.rooms.error}
              retryLabel={MEMBER_VIEWS.rooms.retry}
              onRetry={() => {
                setMine({ status: 'loading' })
                setMineAttempt((value) => value + 1)
              }}
            />
          ) : null}
          {mine.status === 'denied' ? (
            <PermissionState tone="member" message={mine.message || MEMBER_VIEWS.rooms.denied} />
          ) : null}
          {mine.status === 'ready' && mine.rooms.length === 0 ? (
            <EmptyState tone="member" message={MEMBER_VIEWS.rooms.empty} />
          ) : null}
          {mine.status === 'ready' && mine.rooms.length > 0 ? <MemberRoomsList rooms={mine.rooms} /> : null}
        </div>
      </section>

      <section aria-label="Opened by admin" className="mt-10">
        <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.03em]">Opened by admin</h2>
        <div className="mt-4">
          {admin.status === 'loading' ? <CardSkeleton tone="member" label="Loading rooms" /> : null}
          {admin.status === 'error' ? (
            <ErrorBanner
              tone="member"
              message={MEMBER_VIEWS.rooms.error}
              retryLabel={MEMBER_VIEWS.rooms.retry}
              onRetry={() => {
                setAdmin({ status: 'loading' })
                setAdminAttempt((value) => value + 1)
              }}
            />
          ) : null}
          {admin.status === 'ready' && admin.rooms.length === 0 ? (
            <EmptyState tone="member" message={ROOMS_EMPTY} />
          ) : null}
          {admin.status === 'ready' && admin.rooms.length > 0 ? (
            <RoomsBoard rooms={admin.rooms} embedded />
          ) : null}
        </div>
      </section>
    </div>
  )
}

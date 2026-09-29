import { useEffect, useState } from 'react'
import { fetchRooms } from '../../lib/demoFetch'
import type { RoomCard } from '../../lib/demoRows'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner } from '../../shell/ViewState'
import { MEMBER_VIEWS, REFRESH_ERROR } from '../../shell/viewCopy'
import { RoomsBoard } from './RoomsBoard'

const ROOMS_EMPTY = 'A deal room opens for a live mandate, and only by admin. None are open.'

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rooms: RoomCard[] }

export function RoomsPage() {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Rooms | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchRooms().then((result) => {
      if (cancelled) return
      if (result.status === 'error') {
        setList({ status: 'error' })
        return
      }
      setList({ status: 'ready', rooms: result.status === 'ready' ? result.rows : [] })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (list.status === 'loading') {
    return (
      <div className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Rooms</p>
        <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Rooms</h1>
        <div className="mt-8">
          <CardSkeleton tone="member" label="Loading rooms" />
        </div>
      </div>
    )
  }

  if (list.status === 'error') {
    return (
      <div className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Rooms</p>
        <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Rooms</h1>
        <div className="mt-8">
          <ErrorBanner
            tone="member"
            message={REFRESH_ERROR}
            retryLabel={MEMBER_VIEWS.mandates.retry}
            onRetry={() => {
              setList({ status: 'loading' })
              setAttempt((value) => value + 1)
            }}
          />
        </div>
      </div>
    )
  }

  if (list.rooms.length === 0) {
    return (
      <div className="max-w-xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Rooms</p>
        <h1 className="mt-3 font-display text-[2.3rem] font-bold tracking-[-0.03em] text-balance">
          No room is open
        </h1>
        <div className="mt-6">
          <EmptyState tone="member" message={ROOMS_EMPTY} />
        </div>
      </div>
    )
  }

  return <RoomsBoard rooms={list.rooms} />
}

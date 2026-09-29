import { useEffect, useState } from 'react'
import { closeStaffDealRoom, listStaffDealRooms } from '../../lib/dealRoomApi'
import type { StaffDealRoom } from '../../lib/dealRoomView'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { StaffRoomsBoard } from './StaffRoomsBoard'

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'denied'; message: string }
  | { status: 'ready'; rooms: StaffDealRoom[] }

export function StaffRoomsPage() {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  useNoIndex('Deal rooms | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void listStaffDealRooms().then((result) => {
      if (cancelled) return
      if (result.status === 'ready') setList({ status: 'ready', rooms: result.rows })
      else if (result.status === 'denied') setList({ status: 'denied', message: result.message })
      else setList({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  function reload() {
    setError('')
    setList({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  if (list.status === 'loading') {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Deal rooms</h1>
        <div className="mt-8">
          <CardSkeleton tone="staff" label="Loading deal rooms" />
        </div>
      </div>
    )
  }

  if (list.status === 'denied') {
    return <PermissionState tone="staff" message={list.message || STAFF_VIEWS.rooms.denied} />
  }

  if (list.status === 'error') {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Deal rooms</h1>
        <div className="mt-6">
          <ErrorBanner
            tone="staff"
            message={STAFF_VIEWS.rooms.error}
            retryLabel={STAFF_VIEWS.rooms.retry}
            onRetry={reload}
          />
        </div>
      </div>
    )
  }

  if (list.rooms.length === 0) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Deal rooms</h1>
        <div className="mt-6">
          <EmptyState tone="staff" message={STAFF_VIEWS.rooms.empty} />
        </div>
      </div>
    )
  }

  return (
    <StaffRoomsBoard
      rooms={list.rooms}
      busyId={busyId}
      error={error}
      onClose={(roomId) => {
        setBusyId(roomId)
        setError('')
        void closeStaffDealRoom(roomId).then((result) => {
          setBusyId(null)
          if (result.status !== 'ok') {
            setError(result.message)
            return
          }
          reload()
        })
      }}
    />
  )
}

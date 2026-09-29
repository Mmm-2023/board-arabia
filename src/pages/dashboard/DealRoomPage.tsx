import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchMyDealRooms,
  inviteDealRoom,
  manageDealRoom,
  respondDealRoom,
  searchDealDirectory,
} from '../../lib/dealRoomApi'
import { fetchMandates, fetchReOpportunities } from '../../lib/demoFetch'
import {
  blockingParticipantIds,
  createRoomBody,
  DEAL_COPY,
  filterInvitees,
  mandateOptions,
  opportunityOptions,
  type DirectoryInvitee,
  type MemberDealRoom,
  type SubjectOption,
} from '../../lib/dealRoomView'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'
import { DealRoomPanel } from './DealRoomPanel'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RoomState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'denied'; message: string }
  | { status: 'missing' }
  | { status: 'ready'; rooms: MemberDealRoom[] }

type InviteState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'denied'

export function DealRoomPage() {
  const { roomId = '' } = useParams()
  const { userId } = useMember()
  const [list, setList] = useState<RoomState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [mandates, setMandates] = useState<SubjectOption[]>([])
  const [opportunities, setOpportunities] = useState<SubjectOption[]>([])
  const [inviteQuery, setInviteQuery] = useState('')
  const [invitees, setInvitees] = useState<DirectoryInvitee[]>([])
  const [inviteStatus, setInviteStatus] = useState<InviteState>('idle')
  const [inviteMessage, setInviteMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [searchTick, setSearchTick] = useState(0)
  useNoIndex('Room | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchMyDealRooms().then((result) => {
      if (cancelled) return
      if (result.status === 'ready') setList({ status: 'ready', rooms: result.rows })
      else if (result.status === 'denied') setList({ status: 'denied', message: result.message })
      else if (result.status === 'missing') setList({ status: 'missing' })
      else setList({ status: 'error' })
    })
    void fetchMandates().then((result) => {
      if (!cancelled && result.status === 'ready') setMandates(mandateOptions(result.rows))
    })
    void fetchReOpportunities().then((result) => {
      if (!cancelled && result.status === 'ready') setOpportunities(opportunityOptions(result.rows))
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const room = list.status === 'ready' ? list.rooms.find((item) => item.id === roomId) ?? null : null

  useEffect(() => {
    if (!room || room.myRole !== 'owner' || room.status !== 'open') return
    const query = inviteQuery.trim()
    if (query.length < 2) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void searchDealDirectory(query).then((result) => {
        if (cancelled) return
        if (result.status === 'ready') {
          const rows = filterInvitees(result.rows, userId, blockingParticipantIds(room))
          setInvitees(rows)
          setInviteStatus(rows.length === 0 ? 'empty' : 'ready')
          return
        }
        setInvitees([])
        if (result.status === 'denied') {
          setInviteStatus('denied')
          return
        }
        setInviteStatus('error')
        setInviteMessage(result.status === 'error' ? result.message : "Couldn't search. Retry.")
      })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [inviteQuery, room, searchTick, userId])

  function reload() {
    setList({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  if (!UUID.test(roomId)) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">Room</h1>
        <p className="mt-4 text-[1.02rem] text-ink/70">{DEAL_COPY.notAvailable}</p>
        <Back />
      </div>
    )
  }

  if (list.status === 'loading') {
    return (
      <div className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Rooms</p>
        <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Room</h1>
        <div className="mt-8">
          <CardSkeleton tone="member" label="Loading room" />
        </div>
      </div>
    )
  }

  if (list.status === 'denied') {
    return <PermissionState tone="member" message={list.message || MEMBER_VIEWS.rooms.denied} />
  }

  if (list.status === 'error' || list.status === 'missing') {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Room</h1>
        <div className="mt-6">
          <ErrorBanner
            tone="member"
            message={MEMBER_VIEWS.rooms.error}
            retryLabel={MEMBER_VIEWS.rooms.retry}
            onRetry={reload}
          />
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">Room</h1>
        <p className="mt-4 text-[1.02rem] leading-relaxed text-ink/70">{DEAL_COPY.notAvailable}</p>
        <Back />
      </div>
    )
  }

  async function run(task: Promise<{ status: string; message?: string }>) {
    setBusy(true)
    setActionError('')
    const result = await task
    setBusy(false)
    if (result.status !== 'ok') {
      setActionError(result.message || DEAL_COPY.saveError)
      return result
    }
    reload()
    return result
  }

  return (
    <DealRoomPanel
      room={room}
      mandates={mandates}
      opportunities={opportunities}
      inviteQuery={inviteQuery}
      invitees={invitees}
      inviteStatus={inviteQuery.trim().length < 2 ? 'idle' : inviteStatus}
      inviteMessage={inviteMessage}
      actionError={actionError}
      busy={busy}
      onRename={(nextName, nextPurpose) => {
        const parsed = createRoomBody({
          name: nextName,
          purpose: nextPurpose,
          mandateId: null,
          reOpportunityId: null,
        })
        if (!parsed.ok) {
          setActionError(parsed.error)
          return
        }
        void run(
          manageDealRoom({
            roomId: room.id,
            action: 'rename',
            name: parsed.body.name,
            purpose: parsed.body.purpose,
          }),
        )
      }}
      onSearch={(query) => {
        setInviteQuery(query)
        setSearchTick((value) => value + 1)
        if (query.trim().length < 2) {
          setInvitees([])
          setInviteStatus('idle')
          return
        }
        setInviteStatus('loading')
      }}
      onInvite={(memberId) => {
        void run(inviteDealRoom(room.id, memberId)).then((result) => {
          if (!result || result.status !== 'ok') return
          setInviteQuery('')
          setInvitees([])
          setInviteStatus('idle')
        })
      }}
      onRemove={(memberId) => {
        void run(manageDealRoom({ roomId: room.id, action: 'remove', memberId }))
      }}
      onClose={() => {
        void run(manageDealRoom({ roomId: room.id, action: 'close' }))
      }}
      onArchive={() => {
        void run(manageDealRoom({ roomId: room.id, action: 'archive' }))
      }}
      onAccept={() => {
        void run(respondDealRoom(room.id, 'accept'))
      }}
      onDecline={() => {
        void run(respondDealRoom(room.id, 'decline'))
      }}
    />
  )
}

function Back() {
  return (
    <Link
      to="/dashboard/deals/rooms"
      className="mt-4 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
    >
      Rooms
    </Link>
  )
}

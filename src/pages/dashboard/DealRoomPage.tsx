import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchMyDealRooms,
  inviteDealRoom,
  manageDealRoom,
  respondDealRoom,
  searchDealDirectory,
} from '../../lib/dealRoomApi'
import {
  deleteRoomDocument,
  downloadRoomDocument,
  listRoomDocuments,
  revokeRoomDocumentMember,
  setRoomDocumentDownload,
  setRoomDocumentExpiry,
  shareRoomDocument,
  uploadRoomDocument,
  viewRoomDocument,
  type RoomDocumentEvent,
  type RoomDocumentRow,
} from '../../lib/dealRoomDocumentApi'
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
import type { DealDocumentView } from './DealRoomDocuments'

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
  const [documents, setDocuments] = useState<RoomDocumentRow[]>([])
  const [events, setEvents] = useState<RoomDocumentEvent[]>([])
  const [fileView, setFileView] = useState<DealDocumentView | null>(null)
  const [fileError, setFileError] = useState('')
  const [fileTick, setFileTick] = useState(0)
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
    if (!room || room.myInviteStatus !== 'accepted') return
    let cancelled = false
    void listRoomDocuments(room.id).then((result) => {
      if (cancelled) return
      if (result.status === 'ok') {
        setDocuments(result.data.documents)
        setEvents(result.data.events)
        return
      }
      setDocuments([])
      setEvents([])
      setFileError(result.message)
    })
    return () => {
      cancelled = true
    }
  }, [room, fileTick])

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
        <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Room</h1>
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

  async function fileAction(task: Promise<{ status: string; message?: string }>) {
    setBusy(true)
    setFileError('')
    const result = await task
    setBusy(false)
    if (result.status !== 'ok') {
      setFileError(result.message || DEAL_COPY.saveError)
      return
    }
    setFileView((current) => {
      revokeBlob(current?.src)
      return null
    })
    setFileTick((value) => value + 1)
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
      files={{
        documents: documents.map((doc) => ({
          id: doc.id,
          fileName: doc.fileName,
          downloadAllowed: doc.downloadAllowed,
          expiresAt: doc.expiresAt,
          sharedWithAdmin: doc.sharedWithAdmin,
          uploadedByMe: doc.uploadedByMe,
          expired: doc.expired,
        })),
        events: events.map((event) => ({
          id: event.id,
          fileName: event.fileName,
          memberName: event.memberName,
          action: event.action,
          at: event.at,
        })),
        view: fileView,
        error: fileError,
        onUpload: (file) => {
          setBusy(true)
          setFileError('')
          void uploadRoomDocument(room.id, file).then((result) => {
            setBusy(false)
            if (result.status !== 'ok') {
              setFileError(result.message)
              return
            }
            setFileTick((value) => value + 1)
          })
        },
        onView: (id) => {
          setBusy(true)
          setFileError('')
          void viewRoomDocument(id).then((result) => {
            setBusy(false)
            if (result.status !== 'ok' || !result.data.fileBase64) {
              setFileView(null)
              setFileError(result.status === 'ok' ? "Couldn't open this file. Retry." : result.message)
              return
            }
            const src = pdfBlobUrl(result.data.fileBase64)
            if (!src) {
              setFileError("Couldn't open this file. Retry.")
              return
            }
            setFileView((current) => {
              revokeBlob(current?.src)
              return {
                fileName: result.data.fileName,
                stamp: result.data.stamp,
                src,
                downloadAllowed: result.data.downloadAllowed,
              }
            })
          })
        },
        onDownload: (id) => {
          setBusy(true)
          setFileError('')
          void downloadRoomDocument(id).then((result) => {
            setBusy(false)
            if (result.status !== 'ok' || !saveStampedPdf(result.data.fileBase64, result.data.fileName)) {
              setFileError(result.status === 'ok' ? "Couldn't open this file. Retry." : result.message)
              return
            }
          })
        },
        onSetDownload: (id, allowed) => {
          void fileAction(setRoomDocumentDownload(id, allowed))
        },
        onSetFileExpiry: (id, expiresAt) => {
          void fileAction(setRoomDocumentExpiry({ roomId: room.id, documentId: id, expiresAt }))
        },
        onSetMemberExpiry: (memberId, expiresAt) => {
          void fileAction(setRoomDocumentExpiry({ roomId: room.id, memberId, expiresAt }))
        },
        onRevoke: (memberId) => {
          void fileAction(revokeRoomDocumentMember(room.id, memberId))
        },
        onDelete: (id) => {
          void fileAction(deleteRoomDocument(id))
        },
        onShare: (id) => {
          void fileAction(shareRoomDocument(id))
        },
        onCloseView: () => {
          setFileView((current) => {
            revokeBlob(current?.src)
            return null
          })
        },
      }}
    />
  )
}

function saveStampedPdf(fileBase64: string, fileName: string): boolean {
  const src = pdfBlobUrl(fileBase64)
  if (!src) return false
  const link = document.createElement('a')
  link.href = src
  link.download = fileName || 'document.pdf'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(src), 1000)
  return true
}

function pdfBlobUrl(fileBase64: string): string {
  try {
    const binary = atob(fileBase64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  } catch {
    return ''
  }
}

function revokeBlob(src: string | undefined) {
  if (src?.startsWith('blob:')) URL.revokeObjectURL(src)
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

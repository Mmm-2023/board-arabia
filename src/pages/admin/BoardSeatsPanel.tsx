import { useEffect, useState } from 'react'
import {
  closeBoardSeat,
  createBoardSeat,
  editBoardSeat,
  loadBoardSeatApplicants,
  loadBoardSeats,
  publishBoardSeat,
} from '../../lib/boardSeatApi'
import {
  boardSeatProblem,
  draftFromBoardSeat,
  emptyBoardSeatDraft,
  type BoardSeatApplicant,
  type BoardSeatDraft,
  type BoardSeatRow,
} from '../../lib/boardSeats'
import { BoardSeatsView } from './BoardSeatsView'

export type BoardSeatsPreview = {
  seats: BoardSeatRow[]
  applicants?: Record<string, BoardSeatApplicant[]>
  openId?: string | null
  draft?: BoardSeatDraft
}

export function BoardSeatsPanel({ preview }: { preview?: BoardSeatsPreview } = {}) {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>(preview ? 'ready' : 'loading')
  const [seats, setSeats] = useState<BoardSeatRow[]>(preview?.seats ?? [])
  const [draft, setDraft] = useState<BoardSeatDraft>(preview?.draft ?? emptyBoardSeatDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [openId, setOpenId] = useState<string | null>(preview?.openId ?? null)
  const [applicants, setApplicants] = useState<Record<string, BoardSeatApplicant[] | 'error'>>(preview?.applicants ?? {})

  useEffect(() => {
    if (preview) return
    let cancelled = false
    void loadBoardSeats().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setStatus('error')
        return
      }
      setSeats(result.rows)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [attempt, preview])

  async function refresh() {
    const result = await loadBoardSeats()
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setSeats(result.rows)
    setStatus('ready')
  }

  async function save() {
    const problem = boardSeatProblem(draft, 'draft')
    if (problem) {
      setMessage(problem)
      setNotice('')
      return
    }
    setBusy(true)
    setMessage('')
    const error = editingId ? await editBoardSeat(editingId, draft) : await createBoardSeat(draft)
    setBusy(false)
    if (error) {
      setMessage(error)
      return
    }
    setNotice(editingId ? 'Seat saved.' : 'Draft saved.')
    setDraft(emptyBoardSeatDraft())
    setEditingId(null)
    await refresh()
  }

  async function publish(id: string) {
    const seat = seats.find((item) => item.id === id)
    if (seat) {
      const problem = boardSeatProblem(draftFromBoardSeat(seat), 'publish')
      if (problem) {
        setMessage(problem)
        return
      }
    }
    setBusy(true)
    setMessage('')
    const error = await publishBoardSeat(id)
    setBusy(false)
    if (error) {
      setMessage(error)
      return
    }
    setNotice('Seat published.')
    await refresh()
  }

  async function close(id: string) {
    setBusy(true)
    setMessage('')
    const error = await closeBoardSeat(id)
    setBusy(false)
    if (error) {
      setMessage(error)
      return
    }
    setNotice('Seat closed.')
    await refresh()
  }

  async function openApplicants(id: string) {
    setOpenId(id)
    if (applicants[id] && applicants[id] !== 'error') return
    const result = await loadBoardSeatApplicants(id)
    setApplicants((current) => ({ ...current, [id]: result.ok ? result.rows : 'error' }))
  }

  return (
    <BoardSeatsView
      status={status}
      seats={seats}
      draft={draft}
      editingId={editingId}
      message={message}
      notice={notice}
      busy={busy}
      openId={openId}
      applicants={applicants}
      onDraft={(next) => {
        setDraft(next)
        setMessage('')
      }}
      onSubmit={() => {
        if (preview) return
        void save()
      }}
      onEdit={(seat) => {
        setEditingId(seat.id)
        setDraft(draftFromBoardSeat(seat))
        setMessage('')
        setNotice('')
      }}
      onPublish={(id) => {
        if (preview) return
        void publish(id)
      }}
      onClose={(id) => {
        if (preview) return
        void close(id)
      }}
      onOpenApplicants={(id) => {
        if (preview) {
          setOpenId(id)
          return
        }
        void openApplicants(id)
      }}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
}

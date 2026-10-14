import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  applyToBoardSeat,
  loadBoardSeatApplications,
  loadBoardSeatDetail,
  loadBoardSeatShortlist,
  loadPostedBoardSeats,
  loadPublishedBoardSeats,
  openBoardSeatIntroduction,
  submitMemberBoardSeat,
} from '../../lib/memberBoardSeatApi'
import {
  boardSeatNoteProblem,
  emptyMemberSeatDraft,
  memberSeatProblem,
  type BoardSeatApplication,
  type BoardSeatDetail,
  type MemberSeatDraft,
  type PostedBoardSeat,
  type PublishedBoardSeat,
  type ShortlistPerson,
} from '../../lib/memberBoardSeats'
import { useNoIndex } from '../../lib/usePageTitle'
import { MemberBoardSeatDetail, MemberBoardSeatForm, MemberBoardSeatList } from './MemberBoardSeatsView'

type ListStatus = 'loading' | 'error' | 'denied' | 'ready'

export function BoardSeatsPage() {
  const [status, setStatus] = useState<ListStatus>('loading')
  const [seats, setSeats] = useState<PublishedBoardSeat[]>([])
  const [applications, setApplications] = useState<BoardSeatApplication[]>([])
  const [posted, setPosted] = useState<PostedBoardSeat[]>([])
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Board seats | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void Promise.all([loadPublishedBoardSeats(), loadBoardSeatApplications(), loadPostedBoardSeats()]).then(
      ([published, mine, postedSeats]) => {
        if (cancelled) return
        if (!published.ok) {
          setStatus(published.denied ? 'denied' : 'error')
          return
        }
        setSeats(published.rows)
        setApplications(mine.ok ? mine.rows : [])
        setPosted(postedSeats.ok ? postedSeats.rows : [])
        setStatus('ready')
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <MemberBoardSeatList
      status={status}
      seats={seats}
      applications={applications}
      posted={posted}
      onRetry={() => {
        setStatus('loading')
        setAttempt((value) => value + 1)
      }}
    />
  )
}

export function BoardSeatDetailPage() {
  const { seatId = '' } = useParams()
  const [status, setStatus] = useState<ListStatus>('loading')
  const [seat, setSeat] = useState<BoardSeatDetail | null>(null)
  const [shortlist, setShortlist] = useState<ShortlistPerson[] | 'error' | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Board seat | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void loadBoardSeatDetail(seatId).then(async (result) => {
      if (cancelled) return
      if (!result.ok) {
        setStatus(result.denied ? 'denied' : 'error')
        setMessage(result.message)
        setSeat(null)
        return
      }
      setSeat(result.seat)
      if (result.seat.mine) {
        const people = await loadBoardSeatShortlist(result.seat.id)
        if (cancelled) return
        setShortlist(people.ok ? people.rows : 'error')
      } else {
        setShortlist(null)
      }
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [seatId, attempt])

  async function onApply() {
    if (!seat) return
    const problem = boardSeatNoteProblem(note)
    if (problem) {
      setMessage(problem)
      setNotice('')
      return
    }
    setBusy(true)
    setMessage('')
    const result = await applyToBoardSeat(seat.id, note)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setNotice('You put yourself forward.')
    setAttempt((value) => value + 1)
  }

  async function onOpen(id: string) {
    setBusy(true)
    setMessage('')
    const result = await openBoardSeatIntroduction(id)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setNotice('Introduction open. Contact details follow the usual exchange.')
    setAttempt((value) => value + 1)
  }

  return (
    <MemberBoardSeatDetail
      status={status}
      seat={seat}
      shortlist={shortlist}
      note={note}
      message={message}
      notice={notice}
      busy={busy}
      onNote={setNote}
      onApply={() => void onApply()}
      onOpen={(id) => void onOpen(id)}
      onRetry={() => {
        setStatus('loading')
        setMessage('')
        setAttempt((value) => value + 1)
      }}
    />
  )
}

export function PostBoardSeatPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<MemberSeatDraft>(emptyMemberSeatDraft())
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useNoIndex('Post a seat | Board Arabia')

  async function onSubmit() {
    const problem = memberSeatProblem(draft)
    if (problem) {
      setMessage(problem)
      return
    }
    setBusy(true)
    setMessage('')
    const result = await submitMemberBoardSeat(draft)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    navigate(`/dashboard/deals/board-seats/${result.id}`)
  }

  return (
    <MemberBoardSeatForm
      draft={draft}
      message={message}
      busy={busy}
      onDraft={setDraft}
      onSubmit={() => void onSubmit()}
    />
  )
}

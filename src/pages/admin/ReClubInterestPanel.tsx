import { useEffect, useRef, useState } from 'react'
import { schemaMissing } from '../../lib/demoRows'
import { clubStaffError, parseReClubGroups, type ReClubGroup } from '../../lib/reClubInterest'
import { supabase } from '../../lib/supabase'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { ReClubInterestBoard, type ReClubStaffStatus } from './ReClubInterestBoard'

type LoadState =
  | { status: Exclude<ReClubStaffStatus, 'ready'> }
  | { status: 'ready'; rows: ReClubGroup[] }

const copy = STAFF_VIEWS.reClub

export function ReClubInterestPanel() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const lock = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_list_re_club_interest').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        if (schemaMissing(error.message)) {
          setLoad({ status: 'unavailable' })
          return
        }
        const code = 'code' in error ? String(error.code) : ''
        if (code === '42501' || /not_allowed/i.test(error.message)) {
          setLoad({ status: 'denied' })
          return
        }
        setLoad({ status: 'error' })
        return
      }
      setLoad({ status: 'ready', rows: parseReClubGroups(data) })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  function reload() {
    setNotice('')
    setLoad({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  async function run(opportunityId: string, task: PromiseLike<{ error: { message: string } | null }>) {
    if (lock.current) return
    lock.current = opportunityId
    setBusyId(opportunityId)
    setNotice('')
    const { error } = await task
    lock.current = null
    setBusyId(null)
    if (error) {
      setNotice(noticeFor(error.message))
      return
    }
    reload()
  }

  return (
    <ReClubInterestBoard
      status={load.status}
      rows={load.status === 'ready' ? load.rows : []}
      busyId={busyId}
      notice={notice}
      onRetry={reload}
      onCreate={(opportunityId) => {
        void run(
          opportunityId,
          supabase.rpc('staff_open_re_club_room', { p_opportunity_id: opportunityId }),
        )
      }}
      onLink={(opportunityId, roomId) => {
        void run(
          opportunityId,
          supabase.rpc('staff_link_re_club_room', { p_opportunity_id: opportunityId, p_room_id: roomId }),
        )
      }}
    />
  )
}

function noticeFor(message: string): string {
  const kind = clubStaffError(message)
  if (kind === 'denied') return copy.denied
  if (kind === 'linked') return copy.linkedError
  if (kind === 'closed') return copy.closed
  if (kind === 'full') return copy.fullError
  if (kind === 'owner') return copy.ownerError
  if (kind === 'link') return copy.linkError
  return copy.saveError
}

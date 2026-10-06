import { useEffect, useState } from 'react'
import { createStaffMandate, fetchStaffMandates } from '../../lib/mandateMatchApi'
import type { StaffMandateBrief } from '../../lib/mandateMatch'
import { emptyNewMandate, type NewMandateDraft, type NewMandateField } from '../../lib/newMandate'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { AdminMandatesView } from './AdminMandatesView'

const copy = STAFF_VIEWS.mandates

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'denied' }
  | { status: 'ready'; mandates: StaffMandateBrief[] }

export function AdminMandatesPage() {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState<NewMandateDraft>(emptyNewMandate)
  const [field, setField] = useState<NewMandateField | ''>('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useNoIndex('Mandates | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchStaffMandates().then((result) => {
      if (cancelled) return
      if (result.status === 'ready') setList({ status: 'ready', mandates: result.row })
      else if (result.status === 'denied') setList({ status: 'denied' })
      else if (result.status === 'missing') setList({ status: 'missing' })
      else setList({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (list.status === 'loading') {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Mandates</h1>
        <div className="mt-8">
          <CardSkeleton tone="staff" label="Loading mandates" />
        </div>
      </div>
    )
  }

  if (list.status === 'denied') return <PermissionState tone="staff" message={copy.denied} />

  if (list.status === 'missing' || list.status === 'error') {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Mandates</h1>
        <div className="mt-6">
          <ErrorBanner
            tone="staff"
            message={list.status === 'missing' ? copy.missing : copy.error}
            retryLabel={copy.retry}
            onRetry={() => {
              setList({ status: 'loading' })
              setAttempt((value) => value + 1)
            }}
          />
        </div>
      </div>
    )
  }

  async function onSubmit() {
    setNotice('')
    setBusy(true)
    const result = await createStaffMandate(draft)
    setBusy(false)
    if (result.status === 'invalid') {
      setField(result.field)
      setMessage(result.message)
      return
    }
    if (result.status === 'denied') {
      setList({ status: 'denied' })
      return
    }
    if (result.status !== 'ready') {
      setField('')
      setMessage('Could not save the mandate. Try again.')
      return
    }
    setDraft(emptyNewMandate())
    setField('')
    setMessage('')
    setNotice('Mandate saved. It is not an Example.')
    setAttempt((value) => value + 1)
  }

  return (
    <AdminMandatesView
      mandates={list.mandates}
      draft={draft}
      field={field}
      message={message}
      notice={notice}
      busy={busy}
      onDraft={(next) => {
        setDraft(next)
        setMessage('')
        setField('')
      }}
      onSubmit={() => void onSubmit()}
    />
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createDealRoom } from '../../lib/dealRoomApi'
import { fetchMandates, fetchReOpportunities } from '../../lib/demoFetch'
import {
  createRoomBody,
  mandateOptions,
  opportunityOptions,
  type SubjectKind,
  type SubjectOption,
} from '../../lib/dealRoomView'
import { useNoIndex } from '../../lib/usePageTitle'
import { FormSkeleton } from '../../shell/ViewState'
import { CreateRoomForm } from './CreateRoomForm'

export function CreateRoomPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [subjectKind, setSubjectKind] = useState<SubjectKind>('none')
  const [mandateId, setMandateId] = useState('')
  const [reOpportunityId, setReOpportunityId] = useState('')
  const [mandates, setMandates] = useState<SubjectOption[] | null>(null)
  const [opportunities, setOpportunities] = useState<SubjectOption[] | null>(null)
  const [mandatesNote, setMandatesNote] = useState<string | null>(null)
  const [opportunitiesNote, setOpportunitiesNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Create a room | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchMandates().then((result) => {
      if (cancelled) return
      if (result.status === 'ready') {
        setMandates(mandateOptions(result.rows))
        setMandatesNote(null)
        return
      }
      setMandates([])
      setMandatesNote(result.status === 'error' ? "Couldn't load mandates. Retry." : null)
    })
    void fetchReOpportunities().then((result) => {
      if (cancelled) return
      if (result.status === 'ready') {
        setOpportunities(opportunityOptions(result.rows))
        setOpportunitiesNote(null)
        return
      }
      setOpportunities([])
      if (result.status === 'denied') {
        setOpportunitiesNote('Real estate opportunities are not available for this seat.')
        return
      }
      setOpportunitiesNote(result.status === 'error' ? "Couldn't load opportunities. Retry." : null)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (mandates === null || opportunities === null) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Create a room</h1>
        <div className="mt-8">
          <FormSkeleton tone="member" />
        </div>
      </div>
    )
  }

  return (
    <CreateRoomForm
      name={name}
      purpose={purpose}
      subjectKind={subjectKind}
      mandateId={mandateId}
      reOpportunityId={reOpportunityId}
      mandates={mandates}
      opportunities={opportunities}
      mandatesNote={mandatesNote}
      opportunitiesNote={opportunitiesNote}
      busy={busy}
      error={error}
      onRetryLists={
        mandatesNote?.startsWith("Couldn't") || opportunitiesNote?.startsWith("Couldn't")
          ? () => {
              setMandates(null)
              setOpportunities(null)
              setMandatesNote(null)
              setOpportunitiesNote(null)
              setAttempt((value) => value + 1)
            }
          : undefined
      }
      onName={setName}
      onPurpose={setPurpose}
      onSubjectKind={(kind) => {
        setSubjectKind(kind)
        if (kind !== 'mandate') setMandateId('')
        if (kind !== 're') setReOpportunityId('')
        setError('')
      }}
      onMandateId={setMandateId}
      onReOpportunityId={setReOpportunityId}
      onSubmit={() => {
        const parsed = createRoomBody({
          name,
          purpose,
          mandateId: subjectKind === 'mandate' ? mandateId : null,
          reOpportunityId: subjectKind === 're' ? reOpportunityId : null,
        })
        if (!parsed.ok) {
          setError(parsed.error)
          return
        }
        if (subjectKind === 'mandate' && !parsed.body.mandate_id) {
          setError('Choose a mandate, or leave the link blank.')
          return
        }
        if (subjectKind === 're' && !parsed.body.re_opportunity_id) {
          setError('Choose an opportunity, or leave the link blank.')
          return
        }
        setBusy(true)
        setError('')
        void createDealRoom(parsed.body).then((result) => {
          setBusy(false)
          if (result.status === 'ok' && result.roomId) {
            navigate(`/dashboard/deals/rooms/${result.roomId}`)
            return
          }
          setError(result.status === 'ok' ? "Couldn't open the room. Retry." : result.message)
        })
      }}
    />
  )
}

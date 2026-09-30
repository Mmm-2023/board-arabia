import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  daysSince,
  missingRequired,
  optionalDoneCount,
  requiredDoneCount,
  stepDone,
  stepError,
  type StepId,
} from '../../../../supabase/functions/_shared/membership_steps.ts'
import { track } from '../../../lib/analytics'
import { requestMembership, supabase } from '../../../lib/supabase'
import { useAccountRoom } from './context'
import { MembershipChecklistView } from './MembershipChecklistView'

export function MembershipScreen() {
  const room = useAccountRoom()
  const { pathname } = useLocation()
  const [active, setActive] = useState<StepId | null>(null)
  const [draft, setDraft] = useState(room.checklist)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reply, setReply] = useState('')
  const review = pathname.endsWith('/review')

  function open(step: StepId) {
    setError('')
    setDraft(room.checklist)
    setActive((current) => (current === step ? null : step))
  }

  async function save(step: StepId) {
    const problem = stepError(draft, step)
    if (problem) {
      setError(problem)
      return
    }
    const before = requiredDoneCount(room.checklist)
    const wasDone = stepDone(room.checklist, step)
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase
      .from('candidates')
      .update({
        role: draft.role === 'chairperson' || draft.role === 'board_member' || draft.role === 'c_suite' || draft.role === 'other'
          ? draft.role
          : undefined,
        board_seats: draft.boardSeats.trim() || null,
        company_name: draft.companyName.trim() || null,
        job_title: draft.jobTitle.trim() || null,
        company_website: draft.companyWebsite.trim() || null,
        linkedin_url: draft.linkedinUrl.trim() || null,
        scale_kind: draft.scaleKind === 'turnover' || draft.scaleKind === 'aum' ? draft.scaleKind : null,
        scale_band: draft.scaleBand || null,
        sector_tags: draft.sectorTags,
        vision_tags: draft.visionTags,
        statement: draft.statement.trim() || null,
        cr_number: draft.crNumber.trim() || null,
        cr_country: draft.crCountry.trim() || null,
        referral_name: draft.referralName.trim() || null,
        investable_capacity_usd: draft.investable.trim() ? Number(draft.investable) : null,
        phone: draft.phone.trim() || null,
      })
      .eq('user_id', room.userId)
    setSaving(false)
    if (updateError) {
      setError('Could not save. Your answers are still here.')
      return
    }
    const after = requiredDoneCount(draft)
    if (!wasDone && stepDone(draft, step) && step !== 'email') {
      track('checklist_step_done', {
        step,
        required: step !== 'cr_number' && step !== 'referral' && step !== 'capacity' && step !== 'phone',
        steps_done: after,
        path: '/dashboard/membership',
      })
    }
    if (before < 7 && after >= 7) {
      track('checklist_complete', {
        days_since_verified: daysSince(room.emailVerifiedAt),
        path: '/dashboard/membership',
      })
    }
    setActive(null)
    await room.reload()
  }

  async function submit() {
    if (!consent) {
      setError('Confirm the membership notice before you submit.')
      return
    }
    if (missingRequired(room.checklist).length > 0) {
      setError('Finish the required steps before you submit.')
      return
    }
    setSubmitting(true)
    setError('')
    const result = await requestMembership({ action: 'submit', consent: true })
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    track('request_full_membership', {
      days_since_verified: daysSince(room.emailVerifiedAt),
      optional_done_count: optionalDoneCount(room.checklist),
      path: '/dashboard/membership/review',
    })
    await room.reload()
  }

  async function sendReply() {
    setSubmitting(true)
    setError('')
    const result = await requestMembership({
      action: 'reply',
      reply,
      statement: room.needsItems.includes('statement') ? draft.statement : undefined,
      company_name: room.needsItems.includes('company_title') ? draft.companyName : undefined,
      job_title: room.needsItems.includes('company_title') ? draft.jobTitle : undefined,
      linkedin_url: room.needsItems.includes('linkedin') ? draft.linkedinUrl : undefined,
      phone: room.needsItems.includes('phone') ? draft.phone : undefined,
    })
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    await room.reload()
  }

  return (
    <MembershipChecklistView
      model={{
        input: room.checklist,
        state: room.requestState,
        submittedAt: room.submittedAt,
        declinedUntil: room.declinedUntil,
        needsQuestion: room.needsQuestion,
        needsItems: room.needsItems,
        emailVerifiedAt: room.emailVerifiedAt,
      }}
      mode={review ? 'review' : 'list'}
      active={active}
      draft={draft}
      saving={saving}
      error={error}
      consent={consent}
      submitting={submitting}
      reply={reply}
      onOpen={open}
      onDraft={setDraft}
      onSave={(step) => void save(step)}
      onConsent={setConsent}
      onSubmit={() => void submit()}
      onReply={() => void sendReply()}
      onReplyChange={setReply}
    />
  )
}

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { domainMatches } from '../../../supabase/functions/_shared/membership_steps.ts'
import { firstTouchChip, isPaidMedium } from '../../lib/marketing'
import { reviewMembership } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { supabase } from '../../lib/supabase'
import { useAdmin } from './context'
import {
  MembershipDetailView,
  MembershipQueueView,
  stateLabel,
  type DeskDetail,
  type QueueRow,
} from './MembershipDesk'

type CandidateList = {
  user_id: string
  full_name: string
  role: string
  region: string
  company_name: string | null
  referral_name: string | null
  invited_by_member_id: string | null
  submitted_at: string | null
  request_state: string
  owner: string | null
  state_changed_at: string | null
}

export function MembershipQueuePage() {
  const room = useAdmin()
  const [state, setState] = useState('submitted')
  const [vouchedOnly, setVouchedOnly] = useState(false)
  const [region, setRegion] = useState('')
  const [owner, setOwner] = useState('')
  const [rows, setRows] = useState<CandidateList[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Membership requests | Board Arabia')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void supabase
      .from('candidates')
      .select('user_id, full_name, role, region, company_name, referral_name, invited_by_member_id, submitted_at, request_state, owner, state_changed_at')
      .neq('request_state', 'open')
      .order('submitted_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (cancelled) return
        setLoading(false)
        if (loadError) {
          setError('Could not load the queue.')
          setRows([])
          return
        }
        setError('')
        setRows((data || []) as CandidateList[])
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.request_state] = (counts[row.request_state] || 0) + 1
  const visible = rows.filter((row) => {
    if (row.request_state !== state) return false
    if (vouchedOnly && !row.referral_name && !row.invited_by_member_id) return false
    if (region && row.region !== region) return false
    if (owner === 'mine' && row.owner !== room.session?.user.id) return false
    if (owner === 'none' && row.owner) return false
    return true
  })
  const mapped: QueueRow[] = visible.map((row) => ({
    userId: row.user_id,
    name: row.full_name,
    role: row.role,
    region: row.region,
    company: row.company_name || '',
    vouch: row.referral_name || (row.invited_by_member_id ? 'A member' : ''),
    submittedAt: row.submitted_at,
    state: row.request_state,
    owner: row.owner ? 'Assigned' : '',
    stateChangedAt: row.state_changed_at,
  }))

  return (
    <MembershipQueueView
      rows={mapped}
      state={state}
      counts={counts}
      vouchedOnly={vouchedOnly}
      region={region}
      owner={owner}
      onState={setState}
      onVouched={setVouchedOnly}
      onRegion={setRegion}
      onOwner={setOwner}
      loading={loading}
      error={error}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
}

export function MembershipDetailPage() {
  const { candidateId = '' } = useParams()
  const [detail, setDetail] = useState<DeskDetail | null>(null)
  const [seat, setSeat] = useState<'ksa' | 'intl'>('ksa')
  const [tier, setTier] = useState<'founding' | 'member'>('founding')
  const [reason, setReason] = useState('fit')
  const [note, setNote] = useState('')
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<'decline' | 'close' | null>(null)
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Membership request | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      supabase.rpc('staff_read_membership_request', { p_user_id: candidateId }),
      supabase.rpc('founding_capacity'),
    ]).then(([loaded, capacity]) => {
      if (cancelled) return
      const payload = loaded.data as {
        candidate?: {
          user_id: string
          full_name: string
          email: string
          role: string
          region: string
          company_name?: string | null
          job_title?: string | null
          company_website?: string | null
          linkedin_url?: string | null
          statement?: string | null
          cr_number?: string | null
          referral_name?: string | null
          phone?: string | null
          request_state: string
          free_webmail?: boolean | null
          linkedin_checked?: boolean | null
          cr_checked?: boolean | null
          ft_source?: string | null
          ft_medium?: string | null
        }
        notes?: { id: string; body: string; created_at: string }[]
        events?: { id: string; kind: string; detail: unknown; created_at: string }[]
      } | null
      const row = payload?.candidate
      if (loaded.error || !row) {
        setDetail(null)
        setError('Could not load this request.')
        return
      }
      const notes = { data: payload?.notes || [] }
      const events = { data: payload?.events || [] }
      const cap = capacity.data as { ksa?: number; intl?: number; ksa_cap?: number; intl_cap?: number } | null
      const ksaLeft = cap ? Math.max(0, (cap.ksa_cap || 50) - (cap.ksa || 0)) : null
      const intlLeft = cap ? Math.max(0, (cap.intl_cap || 50) - (cap.intl || 0)) : null
      setTier(ksaLeft === 0 ? 'member' : 'founding')
      setDetail({
        userId: row.user_id,
        name: row.full_name,
        email: row.email,
        role: row.role,
        region: row.region,
        company: row.company_name || '',
        title: row.job_title || '',
        website: row.company_website || '',
        linkedin: row.linkedin_url || '',
        statement: row.statement || '',
        crNumber: row.cr_number || '',
        referral: row.referral_name || '',
        phone: row.phone || '',
        vouch: row.referral_name || '',
        state: row.request_state,
        personalEmail: Boolean(row.free_webmail),
        domainMatch: domainMatches(row.email, row.company_website || ''),
        linkedinChecked: Boolean(row.linkedin_checked),
        crChecked: Boolean(row.cr_checked),
        seatsLeft:
          ksaLeft == null
            ? 'Seat counts could not be loaded.'
            : `Founding places left: Saudi Arabia ${ksaLeft}, International ${intlLeft}.`,
        events: (events.data || []).map((item) => ({
          id: item.id,
          label: eventLabel(item.kind, item.detail, item.created_at),
        })),
        notes: (notes.data || []).map((item) => ({
          id: item.id,
          body: item.body,
          at: new Date(item.created_at).toLocaleString('en-GB'),
        })),
        firstTouch: firstTouchChip(row.ft_source, row.ft_medium),
        firstTouchPaid: isPaidMedium(row.ft_medium),
      })
      setError('')
    })
    return () => {
      cancelled = true
    }
  }, [candidateId, attempt])

  async function act(action: string) {
    if (action === 'decline' || action === 'close') {
      setConfirm(action)
      return
    }
    setBusy(true)
    setError('')
    const result = await reviewMembership({
      user_id: candidateId,
      action,
      seat,
      tier,
      reason,
      note,
      question,
      items: action === 'needs_info' ? ['statement'] : undefined,
      capacity_verified: true,
    })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setNote('')
    setAttempt((value) => value + 1)
  }

  if (!detail) {
    return (
      <div>
        <p>{error || 'Loading the request.'}</p>
        {error ? (
          <button type="button" className="mt-3 underline" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <MembershipDetailView
      detail={detail}
      seat={seat}
      tier={tier}
      reason={reason}
      note={note}
      question={question}
      busy={busy}
      error={error}
      confirm={confirm}
      onSeat={setSeat}
      onTier={setTier}
      onReason={setReason}
      onNote={setNote}
      onQuestion={setQuestion}
      onAction={(action) => void act(action)}
      onTick={(field, value) => {
        void reviewMembership({ user_id: candidateId, action: 'tick', [field]: value }).then(() => setAttempt((n) => n + 1))
      }}
      onCancelConfirm={() => setConfirm(null)}
      onConfirm={() => {
        const action = confirm
        setConfirm(null)
        if (action) {
          setBusy(true)
          void reviewMembership({
            user_id: candidateId,
            action,
            reason,
            note,
          }).then((result) => {
            setBusy(false)
            if (result.error) setError(result.error)
            else setAttempt((value) => value + 1)
          })
        }
      }}
    />
  )
}

function eventLabel(kind: string, detail: unknown, at: string) {
  const when = new Date(at).toLocaleString('en-GB')
  if (kind === 'state_change' && detail && typeof detail === 'object') {
    const row = detail as { from?: string; to?: string }
    return `${when}: ${stateLabel(String(row.from || ''))} to ${stateLabel(String(row.to || ''))}`
  }
  if (kind === 'checklist_step' && detail && typeof detail === 'object') {
    const row = detail as { step?: string }
    return `${when}: ${row.step || 'step'} saved`
  }
  return `${when}: ${kind}`
}

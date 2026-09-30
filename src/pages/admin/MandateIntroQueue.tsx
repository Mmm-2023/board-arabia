import { useEffect, useState } from 'react'
import { schemaMissing } from '../../lib/demoRows'
import { supabase } from '../../lib/supabase'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { toneClasses } from '../../shell/ViewState'

type IntroRow = {
  id: string
  sector: string
  deal_type: string
  company_name: string
  member_name: string
  is_demo: boolean
}

const SAMPLE_DECISION = 'Sample requests stay as they are.'
const SAVE_FAILED = 'Could not save that decision. Retry.'

export function MandateIntroQueue() {
  const [rows, setRows] = useState<IntroRow[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [decideError, setDecideError] = useState('')
  const [declineId, setDeclineId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_list_mandate_intros').then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        if (schemaMissing(rpcError.message)) {
          setRows([])
          return
        }
        setLoadError(true)
        setRows([])
        return
      }
      setLoadError(false)
      setRows(parseIntros(data))
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function decide(id: string, decision: 'approved' | 'declined') {
    const row = rows?.find((item) => item.id === id)
    if (row?.is_demo) return
    setBusy(true)
    setDecideError('')
    const { error: rpcError } = await supabase.rpc('staff_decide_mandate_intro', {
      p_intro_id: id,
      p_decision: decision,
    })
    setBusy(false)
    setDeclineId(null)
    if (rpcError) {
      setDecideError(/sample_blocked/i.test(rpcError.message) ? SAMPLE_DECISION : SAVE_FAILED)
      return
    }
    setAttempt((value) => value + 1)
  }

  return (
    <MandateIntroQueueView
      rows={rows}
      loadError={loadError}
      decideError={decideError}
      declineId={declineId}
      busy={busy}
      onApprove={(id) => void decide(id, 'approved')}
      onDecline={setDeclineId}
      onCancelDecline={() => setDeclineId(null)}
      onConfirmDecline={() => {
        if (declineId) void decide(declineId, 'declined')
      }}
    />
  )
}

export function MandateIntroQueueView({
  rows,
  loadError,
  decideError,
  declineId,
  busy,
  onApprove,
  onDecline,
  onCancelDecline,
  onConfirmDecline,
}: {
  rows: IntroRow[] | null
  loadError: boolean
  decideError: string
  declineId: string | null
  busy: boolean
  onApprove: (id: string) => void
  onDecline: (id: string) => void
  onCancelDecline: () => void
  onConfirmDecline: () => void
}) {
  const styles = toneClasses('staff')
  if (!rows || rows.length === 0) {
    if (!loadError) return null
    return (
      <section aria-label="Mandate intros" className="mt-8">
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>
          Mandate intros
        </h2>
        <p className={`mt-3 ${styles.muted}`}>Could not load intro requests.</p>
      </section>
    )
  }

  return (
    <section aria-label="Mandate intros" className="mt-8">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>
        Mandate intros
      </h2>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className={`${styles.panel} px-4 py-4`} data-sample={row.is_demo ? 'true' : 'false'}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-display text-[1.2rem] font-semibold">{row.company_name}</p>
              {row.is_demo ? (
                <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-brass-bright uppercase">Sample</p>
              ) : null}
            </div>
            <p className={`mt-1 ${styles.muted}`}>
              {row.sector}. {row.deal_type}. Requested by {row.member_name}.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || row.is_demo}
                onClick={() => onApprove(row.id)}
                className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
              >
                Approve intro
              </button>
              <button
                type="button"
                disabled={busy || row.is_demo}
                onClick={() => onDecline(row.id)}
                className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 ${styles.secondary}`}
              >
                Decline intro
              </button>
            </div>
          </li>
        ))}
      </ul>
      {decideError ? (
        <p className={`mt-3 ${styles.alert}`} role="alert">
          {decideError}
        </p>
      ) : null}
      {declineId ? (
        <ConfirmDialog
          tone="staff"
          title="Decline this intro?"
          body="The member keeps the general brief. The company, price, and contacts stay locked."
          busy={busy}
          onCancel={onCancelDecline}
          onConfirm={onConfirmDecline}
        />
      ) : null}
    </section>
  )
}

function parseIntros(raw: unknown): IntroRow[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const company = typeof row.company_name === 'string' ? row.company_name.trim() : ''
    const sector = typeof row.sector === 'string' ? row.sector.trim() : ''
    const deal = typeof row.deal_type === 'string' ? row.deal_type.trim() : ''
    const member = typeof row.member_name === 'string' ? row.member_name.trim() : 'Member'
    if (!id || !company) return []
    return [{
      id,
      company_name: company,
      sector,
      deal_type: deal,
      member_name: member,
      is_demo: row.is_demo === true,
    }]
  })
}

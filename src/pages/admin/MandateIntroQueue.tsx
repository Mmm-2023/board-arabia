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
}

export function MandateIntroQueue() {
  const styles = toneClasses('staff')
  const [rows, setRows] = useState<IntroRow[] | null>(null)
  const [error, setError] = useState(false)
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
        setError(true)
        setRows([])
        return
      }
      setError(false)
      setRows(parseIntros(data))
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function decide(id: string, decision: 'approved' | 'declined') {
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('staff_decide_mandate_intro', {
      p_intro_id: id,
      p_decision: decision,
    })
    setBusy(false)
    setDeclineId(null)
    if (rpcError) {
      setError(true)
      return
    }
    setAttempt((value) => value + 1)
  }

  if (!rows || rows.length === 0) {
    if (!error) return null
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
          <li key={row.id} className={`${styles.panel} px-4 py-4`}>
            <p className="font-display text-[1.2rem] font-semibold">{row.company_name}</p>
            <p className={`mt-1 ${styles.muted}`}>
              {row.sector}. {row.deal_type}. Requested by {row.member_name}.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(row.id, 'approved')}
                className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
              >
                Approve intro
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeclineId(row.id)}
                className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 ${styles.secondary}`}
              >
                Decline intro
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className={`mt-3 ${styles.alert}`}>Could not save that decision. Retry.</p> : null}
      {declineId ? (
        <ConfirmDialog
          tone="staff"
          title="Decline this intro?"
          body="The member keeps the general brief. The company, price, and contacts stay locked."
          busy={busy}
          onCancel={() => setDeclineId(null)}
          onConfirm={() => void decide(declineId, 'declined')}
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
    return [{ id, company_name: company, sector, deal_type: deal, member_name: member }]
  })
}

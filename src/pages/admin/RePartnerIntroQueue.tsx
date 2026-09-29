import { useEffect, useState } from 'react'
import { schemaMissing } from '../../lib/demoRows'
import { parseRePartnerIntros, RE_PARTNER_KIND_LABEL, RE_PARTNER_STAFF, type RePartnerIntroRow } from '../../lib/rePartnerView'
import { RE_PARTNER_KINDS } from '../../lib/reRedaction'
import { supabase } from '../../lib/supabase'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { toneClasses } from '../../shell/ViewState'

export function RePartnerIntroQueue() {
  const styles = toneClasses('staff')
  const [rows, setRows] = useState<RePartnerIntroRow[] | null>(null)
  const [error, setError] = useState(false)
  const [declineId, setDeclineId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_list_re_partner_intros').then(({ data, error: rpcError }) => {
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
      setRows(parseRePartnerIntros(data))
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function decide(id: string, decision: 'approved' | 'declined') {
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('staff_decide_re_partner_intro', {
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
      <section aria-label="Partner intros" className="mt-8">
        <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>
          {RE_PARTNER_STAFF.queue}
        </h2>
        <p className={`mt-3 ${styles.muted}`}>{RE_PARTNER_STAFF.queueError}</p>
      </section>
    )
  }

  return (
    <section aria-label="Partner intros" className="mt-8">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>
        {RE_PARTNER_STAFF.queue}
      </h2>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className={`${styles.panel} px-4 py-4`}>
            <p className="font-display text-[1.2rem] font-semibold">{row.name}</p>
            <p className={`mt-1 ${styles.muted}`}>
              {kindLabel(row.kind)}. {row.city}. Requested by {row.member_name}.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(row.id, 'approved')}
                className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
              >
                {RE_PARTNER_STAFF.approve}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeclineId(row.id)}
                className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 ${styles.secondary}`}
              >
                {RE_PARTNER_STAFF.decline}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className={`mt-3 ${styles.alert}`}>{RE_PARTNER_STAFF.decideError}</p> : null}
      {declineId ? (
        <ConfirmDialog
          tone="staff"
          title={RE_PARTNER_STAFF.declineTitle}
          body={RE_PARTNER_STAFF.declineBody}
          busy={busy}
          onCancel={() => setDeclineId(null)}
          onConfirm={() => void decide(declineId, 'declined')}
        />
      ) : null}
    </section>
  )
}

function kindLabel(kind: string) {
  if ((RE_PARTNER_KINDS as readonly string[]).includes(kind)) {
    return RE_PARTNER_KIND_LABEL[kind as keyof typeof RE_PARTNER_KIND_LABEL]
  }
  return kind
}

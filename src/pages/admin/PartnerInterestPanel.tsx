import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { schemaMissing } from '../../lib/demoRows'
import { usePartnerCategories } from '../../lib/usePartnerCategories'
import { supabase } from '../../lib/supabase'
import { toneClasses } from '../../shell/ViewState'

type InterestRow = {
  id: string
  contact_name: string
  firm: string
  category_slug: string
  note: string | null
  status: string
}

export function PartnerInterestAlert() {
  const styles = toneClasses('staff')
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_list_partner_interest').then(({ data, error }) => {
      if (cancelled || error) return
      setCount(parseInterest(data).filter((row) => row.status === 'new').length)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (count < 1) return null

  return (
    <section aria-label="Partner interest" className="mt-8" data-partner-interest-alert="">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>Partner interest</h2>
      <article className={`${styles.panel} mt-3 px-4 py-4`}>
        <p className="font-display text-[1.4rem] font-semibold">{count}</p>
        <p className={`mt-1 ${styles.muted}`}>{count === 1 ? 'New partner note' : 'New partner notes'}</p>
        <Link to="/admin/settings#partner-interest" className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
          Open on Settings
        </Link>
      </article>
    </section>
  )
}

export function PartnerInterestPanel() {
  const styles = toneClasses('staff')
  const categories = usePartnerCategories()
  const names = new Map(categories.map((item) => [item.slug, item.name]))
  const [rows, setRows] = useState<InterestRow[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_list_partner_interest').then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        if (!schemaMissing(rpcError.message)) setError(true)
        setRows([])
        return
      }
      setError(false)
      setRows(parseInterest(data))
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function markSeen(id: string) {
    const { error: rpcError } = await supabase.rpc('staff_mark_partner_interest_seen', { p_id: id })
    if (rpcError) {
      setError(true)
      return
    }
    setAttempt((value) => value + 1)
  }

  const fresh = (rows ?? []).filter((row) => row.status === 'new')

  return (
    <section id="partner-interest" className={`${styles.panel} mt-8 px-5 py-5`}>
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>Partner interest</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">
        Notes from the public partner form. Email to admin is parked, so this count is the alert.
      </p>
      {error ? <p className="mt-3 text-[0.95rem] text-red-300">Could not load partner notes.</p> : null}
      {rows == null ? <p className={`mt-4 ${styles.muted}`}>Loading notes.</p> : null}
      {rows && fresh.length === 0 && !error ? <p className={`mt-4 ${styles.muted}`}>No new notes.</p> : null}
      <ul className="mt-4 space-y-3">
        {fresh.map((row) => (
          <li key={row.id} className="border border-pearl/15 px-4 py-4">
            <p className="font-display text-[1.15rem] font-semibold">{row.firm}</p>
            <p className={`mt-1 ${styles.muted}`}>
              {row.contact_name}. {names.get(row.category_slug) ?? row.category_slug}
            </p>
            {row.note ? <p className="mt-2 text-[0.95rem] text-pearl/80">{row.note}</p> : null}
            <button type="button" className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase" onClick={() => void markSeen(row.id)}>
              Mark seen
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SponsorIntroQueue() {
  const styles = toneClasses('staff')
  const [rows, setRows] = useState<{ id: string; partner_name: string; member_label: string }[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_list_sponsor_intros').then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        if (!schemaMissing(rpcError.message)) setError(true)
        setRows([])
        return
      }
      setRows(parseIntros(data))
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function decide(id: string, decision: 'approved' | 'declined') {
    const { error: rpcError } = await supabase.rpc('staff_decide_sponsor_intro', {
      p_intro_id: id,
      p_decision: decision,
    })
    if (rpcError) {
      setError(true)
      return
    }
    setAttempt((value) => value + 1)
  }

  if (!rows || (rows.length === 0 && !error)) return null

  return (
    <section aria-label="Partner intro requests" className="mt-8">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>Partner intro requests</h2>
      {error ? <p className={`mt-3 ${styles.muted}`}>Could not update a request.</p> : null}
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className={`${styles.panel} px-4 py-4`}>
            <p className="font-display text-[1.2rem] font-semibold">{row.partner_name}</p>
            <p className={`mt-1 ${styles.muted}`}>Requested by {row.member_label}.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase" onClick={() => void decide(row.id, 'approved')}>
                Approve
              </button>
              <button type="button" className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.secondary}`} onClick={() => void decide(row.id, 'declined')}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function parseInterest(raw: unknown): InterestRow[] {
  if (!Array.isArray(raw)) return []
  const rows: InterestRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const contact = typeof row.contact_name === 'string' ? row.contact_name : ''
    const firm = typeof row.firm === 'string' ? row.firm : ''
    const category = typeof row.category_slug === 'string' ? row.category_slug : ''
    if (!id || !contact || !firm || !category) continue
    rows.push({
      id,
      contact_name: contact,
      firm,
      category_slug: category,
      note: typeof row.note === 'string' ? row.note : null,
      status: row.status === 'seen' ? 'seen' : 'new',
    })
  }
  return rows
}

function parseIntros(raw: unknown) {
  if (!Array.isArray(raw)) return []
  const rows: { id: string; partner_name: string; member_label: string }[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const partner = typeof row.partner_name === 'string' ? row.partner_name : ''
    const label = typeof row.member_label === 'string' ? row.member_label : 'Member'
    if (!id || !partner || label.includes('@')) continue
    rows.push({ id, partner_name: partner, member_label: label })
  }
  return rows
}

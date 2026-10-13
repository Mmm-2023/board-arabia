import { useEffect, useState } from 'react'
import { schemaMissing } from '../../lib/demoRows'
import { supabase } from '../../lib/supabase'
import { toneClasses } from '../../shell/ViewState'

type Notice = { id: string; created_at: string; notice: string }

function parseNotices(data: unknown): Notice[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as { id?: unknown; created_at?: unknown; notice?: unknown }
    if (typeof row.id !== 'string' || typeof row.notice !== 'string') return []
    return [{ id: row.id, created_at: typeof row.created_at === 'string' ? row.created_at : '', notice: row.notice }]
  })
}

export function AccountClosureNotices() {
  const styles = toneClasses('staff')
  const [notices, setNotices] = useState<Notice[]>([])

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('list_account_closure_notices').then(({ data, error }) => {
      if (cancelled || (error && schemaMissing(error.message))) return
      if (error) return
      setNotices(parseNotices(data))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (notices.length === 0) return null

  return (
    <section aria-label="Account closures" className="mt-8" data-account-closures="">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>Account closures</h2>
      <ul className="mt-3 space-y-3">
        {notices.map((notice) => (
          <li key={notice.id} className={`${styles.panel} px-4 py-4 text-[1rem] leading-relaxed`}>
            {notice.notice}
          </li>
        ))}
      </ul>
    </section>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toneClasses } from '../../shell/ViewState'

export function NewsletterReadySetting() {
  const styles = toneClasses('staff')
  const [visible, setVisible] = useState(false)
  const [on, setOn] = useState(true)
  const [connected, setConnected] = useState(false)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('own_staff_notice_preference').then(({ data }) => {
      if (cancelled || !data || typeof data !== 'object' || Array.isArray(data)) return
      const row = data as { visible?: boolean; newsletter_ready?: boolean; master_enabled?: boolean }
      if (row.visible !== true) return
      setVisible(true)
      setOn(row.newsletter_ready !== false)
      setConnected(row.master_enabled === true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function choose(next: boolean) {
    setProblem('')
    const previous = on
    setOn(next)
    const { error } = await supabase.rpc('set_email_preference', {
      p_category: 'newsletter_ready',
      p_opt_in: next,
    })
    if (error) {
      setOn(previous)
      setProblem('Could not save this choice. Retry.')
    }
  }

  if (!visible) return null

  return (
    <section className={`${styles.panel} mt-8 px-5 py-5`} data-notice="newsletter_ready" aria-labelledby="staff-newsletter">
      <h2 id="staff-newsletter" className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
        Newsletter ready
      </h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">
        {connected
          ? 'Email an owner when a newsletter is approved.'
          : 'This notice is not connected yet. Your choice is saved for when it is. Nothing is sent now.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Newsletter ready">
        <button
          type="button"
          className={`inline-flex min-h-11 items-center border px-4 text-[0.95rem] ${on ? 'border-pearl/30 text-pearl/80' : 'border-brass text-pearl'}`}
          aria-pressed={!on}
          onClick={() => void choose(false)}
        >
          Off
        </button>
        <button
          type="button"
          className={`inline-flex min-h-11 items-center border px-4 text-[0.95rem] ${on ? 'border-brass text-pearl' : 'border-pearl/30 text-pearl/80'}`}
          aria-pressed={on}
          onClick={() => void choose(true)}
        >
          On
        </button>
      </div>
      {problem ? (
        <p className="mt-3 text-[0.95rem] text-[var(--ba-error)]" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { WeeklyDigestView } from '../../components/digest/WeeklyDigestView'
import { presentWeeklyDigest, type WeeklyDigestModel } from '../../lib/weeklyDigest'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'

export function DigestPage() {
  const [digest, setDigest] = useState<WeeklyDigestModel | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  useNoIndex('This week | Board Arabia')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    void supabase.rpc('my_weekly_digest').then(({ data, error }) => {
      if (cancelled) return
      const next = error ? null : presentWeeklyDigest(data)
      if (!next) {
        setDigest(null)
        setState('error')
        return
      }
      setDigest(next)
      setState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Home</p>
      <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">This week</h1>
      <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-ink/70">
        New members, new mandates, upcoming Majlis, and your introductions.
      </p>
      {state === 'loading' ? (
        <p className="mt-6 text-[0.95rem] text-ink/60" role="status">
          Loading this week.
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="mt-6">
          <p className="text-[1rem] text-ink/70">This week is not available yet.</p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 min-w-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}
      {state === 'ready' && digest ? (
        <div className="mt-6">
          <WeeklyDigestView digest={digest} />
        </div>
      ) : null}
    </div>
  )
}

export function DigestUnsubscribePage() {
  useNoIndex('Weekly email | Board Arabia')
  return (
    <div className="max-w-xl" data-screen="digest-unsubscribe">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Account</p>
      <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Weekly email</h1>
      <p className="mt-4 max-w-xl text-[1rem] leading-relaxed text-ink/75">
        Weekly email is not connected. Nothing is sent. You can set your preference under Your privacy.
      </p>
      <Link
        to="/dashboard/privacy"
        className="mt-4 inline-flex min-h-11 min-w-11 items-center text-[0.95rem] font-semibold underline"
      >
        Your privacy
      </Link>
    </div>
  )
}

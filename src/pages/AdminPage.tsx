import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link } from 'react-router-dom'
import {
  supabase,
  type Application,
  type ApplicationStatus,
} from '../lib/supabase'

export function AdminPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [isStaff, setIsStaff] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [apps, setApps] = useState<Application[]>([])
  const [listError, setListError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Admin — Board Arabia'
  }, [])

  const refreshStaffAndApps = useCallback(async (active: Session | null) => {
    if (!active) {
      setIsStaff(false)
      setApps([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data: staffRow, error: staffError } = await supabase
      .from('staff_users')
      .select('user_id')
      .eq('user_id', active.user.id)
      .maybeSingle()

    if (staffError || !staffRow) {
      setIsStaff(false)
      setApps([])
      setListError(
        staffError?.message ||
          'Signed in, but this account is not in staff_users. See README for promotion SQL.',
      )
      setLoading(false)
      return
    }

    setIsStaff(true)
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setListError(error.message)
      setApps([])
    } else {
      setListError('')
      setApps((data ?? []) as Application[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      void refreshStaffAndApps(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      void refreshStaffAndApps(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [refreshStaffAndApps])

  async function onSignIn(e: FormEvent) {
    e.preventDefault()
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) setAuthError(error.message)
  }

  async function onSignOut() {
    await supabase.auth.signOut()
  }

  async function setStatus(id: string, status: ApplicationStatus) {
    setUpdatingId(id)
    const { error } = await supabase
      .from('applications')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (!error) {
      setApps((prev) =>
        prev.map((row) => (row.id === id ? { ...row, status } : row)),
      )
    } else {
      setListError(error.message)
    }
    setUpdatingId(null)
  }

  return (
    <div className="min-h-dvh bg-ink text-pearl">
      <header className="border-b border-pearl/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 md:px-8">
          <div>
            <Link
              to="/"
              className="font-display text-[1.05rem] font-bold tracking-[-0.02em]"
            >
              Board Arabia
            </Link>
            <p className="mt-1 text-[0.7rem] font-semibold tracking-[0.12em] text-pearl/45 uppercase">
              Ops / Admin
            </p>
          </div>
          {session && (
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="text-[0.75rem] font-semibold tracking-[0.06em] text-pearl/60 uppercase transition-colors hover:text-pearl"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
        {!session ? (
          <div className="mx-auto max-w-md">
            <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">
              Staff sign-in
            </h1>
            <p className="mt-3 text-[0.95rem] text-stone/70">
              Email and password via Supabase Auth. Only{' '}
              <code className="text-brass-bright">staff_users</code> can list
              applications.
            </p>
            <form onSubmit={onSignIn} className="mt-8 space-y-4">
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@boardarabia.com"
                className="w-full border border-pearl/20 bg-pearl/5 px-4 py-3.5 text-[1rem] text-pearl outline-none placeholder:text-pearl/35 focus:border-brass"
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full border border-pearl/20 bg-pearl/5 px-4 py-3.5 text-[1rem] text-pearl outline-none placeholder:text-pearl/35 focus:border-brass"
              />
              {authError && (
                <p className="text-[0.9rem] text-red-300" role="alert">
                  {authError}
                </p>
              )}
              <button
                type="submit"
                className="w-full bg-brass px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:bg-brass-bright"
              >
                Sign in
              </button>
            </form>
          </div>
        ) : loading ? (
          <p className="text-stone/70">Loading…</p>
        ) : !isStaff ? (
          <div className="max-w-lg">
            <h1 className="font-display text-[1.8rem] font-bold">
              Not authorized
            </h1>
            <p className="mt-3 text-stone/70">{listError}</p>
            <p className="mt-4 text-[0.9rem] text-stone/55">
              Signed in as {session.user.email}. Promote this user into{' '}
              <code className="text-brass-bright">staff_users</code> (see
              README).
            </p>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">
                  Applications
                </h1>
                <p className="mt-2 text-[0.9rem] text-stone/60">
                  {session.user.email} · {apps.length} row
                  {apps.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshStaffAndApps(session)}
                className="text-[0.75rem] font-semibold tracking-[0.06em] text-brass-bright uppercase hover:text-brass"
              >
                Refresh
              </button>
            </div>

            {listError && (
              <p className="mt-4 text-[0.9rem] text-red-300">{listError}</p>
            )}

            <ul className="mt-8 space-y-4">
              {apps.length === 0 && (
                <li className="border border-pearl/10 px-5 py-8 text-stone/55">
                  No applications yet.
                </li>
              )}
              {apps.map((app) => (
                <li
                  key={app.id}
                  className="border border-pearl/10 bg-pearl/[0.03] px-5 py-5 md:px-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.7rem] font-semibold tracking-[0.1em] text-pearl/40 uppercase">
                        {new Date(app.created_at).toLocaleString()}
                      </p>
                      <p className="mt-2 font-display text-[1.15rem] font-semibold tracking-[-0.02em]">
                        {app.job_titles}
                      </p>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                  <dl className="mt-4 grid gap-3 text-[0.92rem] md:grid-cols-2">
                    <div>
                      <dt className="text-pearl/40">Turnover</dt>
                      <dd className="mt-0.5 text-stone/85">{app.turnover}</dd>
                    </div>
                    <div>
                      <dt className="text-pearl/40">Calendar slot</dt>
                      <dd className="mt-0.5 text-stone/85">
                        {app.calendar_slot || '—'}
                      </dd>
                    </div>
                    <div className="md:col-span-2">
                      <dt className="text-pearl/40">Companies</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-stone/85">
                        {app.companies}
                      </dd>
                    </div>
                    {app.linkedin_url && (
                      <div className="md:col-span-2">
                        <dt className="text-pearl/40">LinkedIn</dt>
                        <dd className="mt-0.5">
                          <a
                            href={app.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brass-bright underline-offset-2 hover:underline"
                          >
                            {app.linkedin_url}
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(['pending', 'verified', 'declined'] as const).map(
                      (status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={
                            updatingId === app.id || app.status === status
                          }
                          onClick={() => void setStatus(app.id, status)}
                          className={`px-3 py-2 text-[0.68rem] font-semibold tracking-[0.06em] uppercase transition-colors disabled:opacity-40 ${
                            app.status === status
                              ? 'bg-brass text-ink'
                              : 'border border-pearl/20 text-pearl/70 hover:border-pearl/40 hover:text-pearl'
                          }`}
                        >
                          {status}
                        </button>
                      ),
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const tone =
    status === 'verified'
      ? 'text-emerald-300 border-emerald-300/30'
      : status === 'declined'
        ? 'text-red-300 border-red-300/30'
        : 'text-brass-bright border-brass/40'

  return (
    <span
      className={`border px-2.5 py-1 text-[0.68rem] font-semibold tracking-[0.08em] uppercase ${tone}`}
    >
      {status}
    </span>
  )
}

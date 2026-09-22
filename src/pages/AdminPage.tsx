import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, Navigate } from 'react-router-dom'
import {
  decideApplication,
  supabase,
  type Application,
  type ApplicationStatus,
} from '../lib/supabase'

/** Suggest next weekday 10:00 local (browser) as a starting slot Michael can edit. */
function suggestedMeetingLocalValue(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AdminPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [isStaff, setIsStaff] = useState(false)
  const [loading, setLoading] = useState(true)
  const [apps, setApps] = useState<Application[]>([])
  const [listError, setListError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState('')
  const [acceptForId, setAcceptForId] = useState<string | null>(null)
  const [meetingLocal, setMeetingLocal] = useState(suggestedMeetingLocalValue)
  const [durationMin, setDurationMin] = useState(30)

  const suggested = useMemo(() => suggestedMeetingLocalValue(), [])

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

  async function onSignOut() {
    await supabase.auth.signOut()
  }

  function openAccept(id: string) {
    setAcceptForId(id)
    setMeetingLocal(suggestedMeetingLocalValue())
    setDurationMin(30)
    setListError('')
    setActionNote('')
  }

  async function confirmAccept(id: string) {
    const start = new Date(meetingLocal)
    if (Number.isNaN(start.getTime())) {
      setListError('Pick a valid meeting date and time.')
      return
    }
    if (start.getTime() < Date.now() - 60_000) {
      setListError('Meeting time must be in the future.')
      return
    }
    const end = new Date(start.getTime() + durationMin * 60_000)

    setUpdatingId(id)
    setActionNote('')
    setListError('')
    const result = await decideApplication(id, 'accepted', {
      meeting_start: start.toISOString(),
      meeting_end: end.toISOString(),
    })
    if (result.error) {
      setListError(result.error)
      setUpdatingId(null)
      return
    }

    setApps((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: 'accepted',
              decision_at: new Date().toISOString(),
              invite_event_id: result.inviteEventId ?? row.invite_event_id,
              invite_sent_at: new Date().toISOString(),
              calendar_slot: start.toISOString(),
            }
          : row,
      ),
    )
    setActionNote(result.message || 'Accepted — calendar invite sent.')
    setAcceptForId(null)
    setUpdatingId(null)
  }

  async function onReject(id: string) {
    setUpdatingId(id)
    setActionNote('')
    setListError('')
    setAcceptForId(null)
    const result = await decideApplication(id, 'rejected')
    if (result.error) {
      setListError(result.error)
      setUpdatingId(null)
      return
    }
    setApps((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: 'rejected',
              decision_at: new Date().toISOString(),
              invite_event_id: null,
              invite_sent_at: null,
              calendar_slot: null,
            }
          : row,
      ),
    )
    setActionNote(result.message || 'Rejected — decline email sent.')
    setUpdatingId(null)
  }

  if (session === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink text-pearl">
        <p className="text-stone/70">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login?next=/admin" replace />
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
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="text-[0.75rem] font-semibold tracking-[0.06em] text-pearl/60 uppercase transition-colors hover:text-pearl"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
        {loading ? (
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
            {actionNote && (
              <p className="mt-4 text-[0.9rem] text-brass-bright">{actionNote}</p>
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
                        {app.full_name || app.job_titles}
                      </p>
                      {app.email && (
                        <p className="mt-1 text-[0.9rem] text-stone/65">
                          {app.email}
                          {app.phone ? ` · ${app.phone}` : ''}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                  <dl className="mt-4 grid gap-3 text-[0.92rem] md:grid-cols-2">
                    <div>
                      <dt className="text-pearl/40">Turnover</dt>
                      <dd className="mt-0.5 text-stone/85">{app.turnover}</dd>
                    </div>
                    <div>
                      <dt className="text-pearl/40">FO / AUM</dt>
                      <dd className="mt-0.5 text-stone/85">
                        {app.fo_aum || '—'}
                      </dd>
                    </div>
                    <div className="md:col-span-2">
                      <dt className="text-pearl/40">Job titles</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-stone/85">
                        {app.job_titles}
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
                    {app.calendar_slot && (
                      <div className="md:col-span-2">
                        <dt className="text-pearl/40">Meeting / invite meta</dt>
                        <dd className="mt-0.5 text-stone/85">
                          {app.calendar_slot}
                          {app.invite_event_id
                            ? ` · event ${app.invite_event_id}`
                            : ''}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {acceptForId === app.id ? (
                    <div className="mt-5 border border-brass/40 bg-brass/5 px-4 py-4">
                      <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
                        Accept — pick meeting time
                      </p>
                      <p className="mt-2 text-[0.88rem] text-stone/70">
                        Creates a Google Calendar event with Meet and invites{' '}
                        {app.email}. Not a public booking page.
                      </p>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="block flex-1">
                          <span className="mb-1.5 block text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/45 uppercase">
                            Date & time
                          </span>
                          <input
                            type="datetime-local"
                            value={meetingLocal}
                            onChange={(e) => setMeetingLocal(e.target.value)}
                            className="w-full border border-pearl/20 bg-ink px-3 py-2.5 text-[0.95rem] text-pearl outline-none focus:border-brass"
                          />
                        </label>
                        <label className="block sm:w-36">
                          <span className="mb-1.5 block text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/45 uppercase">
                            Minutes
                          </span>
                          <select
                            value={durationMin}
                            onChange={(e) =>
                              setDurationMin(Number(e.target.value))
                            }
                            className="w-full border border-pearl/20 bg-ink px-3 py-2.5 text-[0.95rem] text-pearl outline-none focus:border-brass"
                          >
                            {[30, 45, 60].map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <button
                        type="button"
                        className="mt-3 text-[0.75rem] font-semibold tracking-[0.06em] text-brass-bright uppercase hover:text-brass"
                        onClick={() => setMeetingLocal(suggested)}
                      >
                        Use suggested: {suggested.replace('T', ' ')}
                      </button>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={updatingId === app.id}
                          onClick={() => void confirmAccept(app.id)}
                          className="bg-brass px-4 py-2.5 text-[0.68rem] font-semibold tracking-[0.06em] text-ink uppercase disabled:opacity-40"
                        >
                          {updatingId === app.id
                            ? 'Creating invite…'
                            : 'Confirm & send calendar invite'}
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === app.id}
                          onClick={() => setAcceptForId(null)}
                          className="border border-pearl/20 px-4 py-2.5 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/70 uppercase hover:text-pearl"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          updatingId === app.id ||
                          app.status === 'accepted' ||
                          app.status === 'verified'
                        }
                        onClick={() => openAccept(app.id)}
                        className={`px-3 py-2 text-[0.68rem] font-semibold tracking-[0.06em] uppercase transition-colors disabled:opacity-40 ${
                          app.status === 'accepted' || app.status === 'verified'
                            ? 'bg-brass text-ink'
                            : 'border border-pearl/20 text-pearl/70 hover:border-pearl/40 hover:text-pearl'
                        }`}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={
                          updatingId === app.id ||
                          app.status === 'rejected' ||
                          app.status === 'declined'
                        }
                        onClick={() => void onReject(app.id)}
                        className={`px-3 py-2 text-[0.68rem] font-semibold tracking-[0.06em] uppercase transition-colors disabled:opacity-40 ${
                          app.status === 'rejected' || app.status === 'declined'
                            ? 'bg-brass text-ink'
                            : 'border border-pearl/20 text-pearl/70 hover:border-pearl/40 hover:text-pearl'
                        }`}
                      >
                        Reject
                      </button>
                    </div>
                  )}
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
    status === 'accepted' || status === 'verified'
      ? 'text-emerald-300 border-emerald-300/30'
      : status === 'rejected' || status === 'declined'
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

import { useEffect, useState } from 'react'
import { WeeklyDigestView } from '../../components/digest/WeeklyDigestView'
import { formatUkDateTime } from '../../lib/ukDate'
import {
  digestAuditLabel,
  presentDigestIssue,
  type DigestIssueModel,
} from '../../lib/weeklyDigest'
import { weeklyDigestMail } from '../../../supabase/functions/_shared/weekly_digest_copy.ts'
import { supabase } from '../../lib/supabase'

const SITE = 'https://boardarabia.com'

const actionClass =
  'inline-flex min-h-11 min-w-11 items-center border border-pearl/25 px-3 text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase disabled:opacity-40'

export function DigestIssuePanel() {
  const [model, setModel] = useState<DigestIssueModel | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    void supabase.rpc('staff_digest_issue').then(({ data, error }) => {
      if (cancelled) return
      const next = error ? null : presentDigestIssue(data)
      if (!next) {
        setModel(null)
        setState('error')
        return
      }
      setModel(next)
      setState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function run(kind: 'prepare' | 'approve' | 'withdraw') {
    setBusy(true)
    setNotice('')
    const call =
      kind === 'prepare'
        ? supabase.rpc('staff_create_digest_draft')
        : supabase.rpc('staff_decide_digest_issue', { p_action: kind })
    const { data, error } = await call
    setBusy(false)
    const next = error ? null : presentDigestIssue(data)
    if (!next) {
      setNotice('Could not update this issue.')
      return
    }
    setModel(next)
    setState('ready')
  }

  return (
    <DigestIssuePanelView
      model={model}
      state={state}
      busy={busy}
      notice={notice}
      onPrepare={() => void run('prepare')}
      onApprove={() => void run('approve')}
      onWithdraw={() => void run('withdraw')}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
}

export function DigestIssuePanelView({
  model,
  state,
  busy,
  notice,
  onPrepare,
  onApprove,
  onWithdraw,
  onRetry,
}: {
  model: DigestIssueModel | null
  state: 'loading' | 'ready' | 'error'
  busy?: boolean
  notice?: string
  onPrepare: () => void
  onApprove: () => void
  onWithdraw: () => void
  onRetry: () => void
}) {
  const status = model?.status ?? null
  const letter = model
    ? weeklyDigestMail(
        {
          newMembers: model.preview.newMembers,
          newMandates: model.preview.newMandates,
          upcomingEvents: model.preview.upcomingEvents,
          introductions: model.preview.introductions,
        },
        SITE,
      )
    : null

  return (
    <section className="mt-10 border-t border-pearl/10 pt-8" aria-label="This week" data-digest-admin="">
      <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.03em]">This week</h2>
      <p className="mt-2 max-w-xl text-[0.95rem] text-stone/65">
        Preview the issue as members will see it. Approve it before a future letter can go out.
      </p>
      <p className="mt-4 text-[0.95rem] text-pearl/80" data-send-switch={model?.sendEnabled ? 'on' : 'off'}>
        {model?.sendEnabled
          ? 'Sending is on. Email is not connected.'
          : 'Sending is off. Email is not connected.'}
      </p>
      {state === 'loading' ? (
        <p className="mt-4 text-[0.95rem] text-pearl/60" role="status">
          Loading this week.
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="mt-4">
          <p className="text-[0.95rem] text-pearl/70">This week is not available yet.</p>
          <button type="button" className={`${actionClass} mt-3`} onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      {notice ? (
        <p className="mt-4 text-[0.95rem] text-pearl/80" role="status">
          {notice}
        </p>
      ) : null}
      {state === 'ready' && model ? (
        <>
          <p className="mt-4 text-[0.75rem] font-semibold tracking-[0.1em] text-pearl/50 uppercase" data-issue-status={status ?? 'none'}>
            {status === 'draft' ? 'Draft' : status === 'approved' ? 'Approved' : status === 'withdrawn' ? 'Withdrawn' : 'Not prepared'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={actionClass}
              disabled={busy || status === 'draft' || status === 'approved'}
              onClick={onPrepare}
            >
              Prepare this week
            </button>
            <button type="button" className={actionClass} disabled={busy || status !== 'draft'} onClick={onApprove}>
              Approve
            </button>
            <button
              type="button"
              className={actionClass}
              disabled={busy || (status !== 'draft' && status !== 'approved')}
              onClick={onWithdraw}
            >
              Withdraw
            </button>
          </div>
          <div className="mt-6 border border-pearl/10 bg-pearl p-4 text-ink" data-digest-preview="member">
            <p className="text-[0.7rem] font-semibold tracking-[0.1em] text-ink/45 uppercase">Member view</p>
            <div className="mt-4">
              <WeeklyDigestView
                digest={model.preview}
                introNote="Sample introduction for this preview. Not a member record."
              />
            </div>
          </div>
          {letter ? (
            <div className="mt-6" data-digest-preview="letter">
              <h3 className="text-[0.72rem] font-semibold tracking-[0.14em] text-pearl/45 uppercase">Email</h3>
              <p className="mt-3 text-[0.95rem] text-stone/80">{letter.subject}</p>
              <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap border border-pearl/10 px-4 py-3 text-[0.85rem] leading-relaxed text-pearl/80">
                {letter.text}
              </pre>
              <div
                className="mt-3 max-h-80 overflow-auto border border-pearl/10 bg-white p-4 text-[0.95rem] leading-relaxed text-ink"
                data-email-html=""
                dangerouslySetInnerHTML={{ __html: letter.html }}
              />
            </div>
          ) : null}
          {model.log.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-[0.72rem] font-semibold tracking-[0.14em] text-pearl/45 uppercase">Audit</h3>
              <ul className="mt-3 space-y-2">
                {model.log.map((row, index) => (
                  <li key={`${row.action}-${row.createdAt}-${index}`} className="text-[0.9rem] text-pearl/75">
                    {digestAuditLabel(row.action)}{' '}
                    <span className="ms-2 text-pearl/50">{formatUkDateTime(row.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

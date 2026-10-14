import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DigestDraftEditor, digestPayloadFromModel, type DigestPickLists } from '../../components/digest/DigestDraftEditor'
import { WeeklyDigestView } from '../../components/digest/WeeklyDigestView'
import { formatUkDateTime } from '../../lib/ukDate'
import {
  digestAuditLabel,
  presentDigestIssue,
  presentDigestSources,
  validateDigestForSave,
  type DigestIssueModel,
  type WeeklyDigestModel,
} from '../../lib/weeklyDigest'
import { weeklyDigestMail } from '../../../supabase/functions/_shared/weekly_digest_copy.ts'
import { supabase } from '../../lib/supabase'

const SITE = 'https://boardarabia.com'

function digestSaveNotice(message: string | undefined): string {
  const text = message ?? ''
  if (text.includes('digest_news_count')) return 'News sections need 2 to 4 items.'
  if (text.includes('digest_news_invalid')) return 'A news item needs a headline, 2 to 3 sentences, and a source.'
  if (text.includes('digest_link_invalid')) return 'Links must use http or https. LinkedIn links must use linkedin.com.'
  if (text.includes('digest_diary')) return 'A diary date needs a source.'
  if (text.includes('digest_platform')) return 'Platform notes are limited to 3 lines.'
  if (text.includes('digest_partner')) return 'Partner content needs 2 to 3 sentences and one link.'
  return 'Could not update this issue.'
}

const actionClass =
  'inline-flex min-h-11 min-w-11 items-center border border-pearl/25 px-3 text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase disabled:opacity-40'

export function DigestIssuePanel() {
  const [model, setModel] = useState<DigestIssueModel | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState<WeeklyDigestModel | null>(null)
  const [audience, setAudience] = useState<string[]>([])
  const [sources, setSources] = useState<DigestPickLists>({ members: [], mandates: [], events: [] })

  function applyModel(next: DigestIssueModel) {
    setModel(next)
    setState('ready')
    if (next.status === 'draft') {
      setDraft(next.preview)
      setAudience(next.audience)
      return
    }
    setDraft(null)
  }

  useEffect(() => {
    let cancelled = false
    setState('loading')
    void supabase.rpc('staff_digest_issue').then(({ data, error }) => {
      if (cancelled) return
      const next = error ? null : presentDigestIssue(data)
      if (!next) {
        setModel(null)
        setDraft(null)
        setState('error')
        return
      }
      applyModel(next)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    if (model?.status !== 'draft') return
    let cancelled = false
    void supabase.rpc('staff_digest_sources').then(({ data }) => {
      if (cancelled) return
      setSources(presentDigestSources(data))
    })
    return () => {
      cancelled = true
    }
  }, [model?.status])

  async function saveDraft() {
    if (!draft) return false
    const problem = validateDigestForSave(draft)
    if (problem) {
      setNotice(problem)
      return false
    }
    setBusy(true)
    setNotice('')
    const { data, error } = await supabase.rpc('staff_save_digest_draft', {
      p_payload: digestPayloadFromModel(draft),
      p_audience: audience,
    })
    setBusy(false)
    const next = error ? null : presentDigestIssue(data)
    if (!next) {
      setNotice(digestSaveNotice(error?.message))
      return false
    }
    applyModel(next)
    return true
  }

  async function approve() {
    if (audience.length === 0) return
    const saved = await saveDraft()
    if (!saved) return
    await run('approve')
  }

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
    applyModel(next)
  }

  return (
    <DigestIssuePanelView
      model={model}
      state={state}
      busy={busy}
      notice={notice}
      onPrepare={() => void run('prepare')}
      onApprove={() => void approve()}
      onWithdraw={() => void run('withdraw')}
      onRetry={() => setAttempt((value) => value + 1)}
      draft={draft}
      audience={audience}
      sources={sources}
      onDraftChange={(next, tiers) => {
        setDraft(next)
        setAudience(tiers)
      }}
      onSave={() => void saveDraft()}
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
  draft = null,
  audience = [],
  sources = { members: [], mandates: [], events: [] },
  onDraftChange,
  onSave,
}: {
  model: DigestIssueModel | null
  state: 'loading' | 'ready' | 'error'
  busy?: boolean
  notice?: string
  onPrepare: () => void
  onApprove: () => void
  onWithdraw: () => void
  onRetry: () => void
  draft?: WeeklyDigestModel | null
  audience?: string[]
  sources?: DigestPickLists
  onDraftChange?: (digest: WeeklyDigestModel, audience: string[]) => void
  onSave?: () => void
}) {
  const status = model?.status ?? null
  const shown = status === 'draft' && draft ? draft : model?.preview ?? null
  const letter = shown ? weeklyDigestMail(shown, SITE) : null

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
            <button
              type="button"
              className={actionClass}
              disabled={busy || status !== 'draft' || audience.length === 0}
              onClick={onApprove}
            >
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
            {status === 'approved' ? (
              <Link to="/admin/email#email-campaign" className={actionClass}>
                Email this digest
              </Link>
            ) : null}
          </div>
          {status === 'draft' && draft && onDraftChange ? (
            <>
              <DigestDraftEditor digest={draft} audience={audience} sources={sources} onChange={onDraftChange} />
              {onSave ? (
                <button type="button" className={`${actionClass} mt-4`} disabled={busy} onClick={onSave}>
                  Save draft
                </button>
              ) : null}
            </>
          ) : null}
          <div className="mt-6 border border-pearl/10 bg-pearl p-4 text-ink" data-digest-preview="member">
            <p className="text-[0.7rem] font-semibold tracking-[0.1em] text-ink/45 uppercase">Member view</p>
            <div className="mt-4">
              {shown ? (
                <WeeklyDigestView
                  digest={shown}
                  introNote="Example. Not a member record."
                />
              ) : null}
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

import {
  AUDIENCE_REASON_LABELS,
  categoryLabel,
  confirmMatches,
  pauseBanner,
  releaseBlockers,
  releaseReady,
  statusLabel,
  testSendAllowed,
  tierChoices,
  type CampaignDraft,
  type CampaignSummary,
  type EmailScreen,
  type ReleaseGate,
  type SendLog,
} from '../../lib/emailCampaign'
import { formatUkDateTime } from '../../lib/ukDate'

const actionClass =
  'inline-flex min-h-11 items-center border border-pearl/25 px-3 text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase disabled:opacity-40'
const fieldClass = 'mt-2 block w-full border border-pearl/20 bg-ink px-3 py-3 text-[0.95rem] text-pearl'
const labelClass = 'block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase'

export function EmailCampaignView({
  state,
  screen,
  selected,
  draft,
  digestReady,
  busy = false,
  notice = '',
  confirmOpen = false,
  confirmText = '',
  newsFrom = '',
  mailFrom = '',
  onSelect,
  onNew,
  onDigest,
  onDraft,
  onToggleTier,
  onSave,
  onApprove,
  onTest,
  onMaster,
  onOpenConfirm,
  onConfirmText,
  onRelease,
  onRetry,
  onResume,
}: {
  state: 'loading' | 'ready' | 'error'
  screen: EmailScreen | null
  selected: CampaignSummary | null
  draft: CampaignDraft
  digestReady: boolean
  busy?: boolean
  notice?: string
  confirmOpen?: boolean
  confirmText?: string
  newsFrom?: string
  mailFrom?: string
  onResume?: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onDigest: () => void
  onDraft: (next: CampaignDraft) => void
  onToggleTier: (id: string) => void
  onSave: () => void
  onApprove: () => void
  onTest: () => void
  onMaster: (enabled: boolean) => void
  onOpenConfirm: () => void
  onConfirmText: (value: string) => void
  onRelease: () => void
  onRetry: () => void
}) {
  const gate: ReleaseGate = selected?.release ?? {
    ready: false,
    isOwner: screen?.isOwner === true,
    masterEnabled: screen?.masterEnabled === true,
    approved: draft.status === 'approved' || draft.status === 'test_sent',
    testSentByOwner: false,
    versionMatches: false,
    eligible: selected?.audience.eligible ?? 0,
  }
  const open = releaseReady(gate)
  const reasons = releaseBlockers(gate)
  const confirmed = confirmMatches(confirmText, gate.eligible)
  const pauseReason = screen?.pauseReason === 'complaint_rate' || screen?.pauseReason === 'bounce_rate'
    ? screen.pauseReason
    : ''
  const pauseText = pauseBanner(pauseReason)

  return (
    <section id="email-campaign" className="mt-8 border-t border-pearl/10 pt-8" aria-label="Letters" data-email-campaign="">
      <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.03em]">Letters</h2>
      <p className="mt-2 max-w-xl text-[0.95rem] text-stone/65">
        Write a letter, or email an approved digest. A test goes to the address on your account. Release is for the owner.
      </p>
      <StreamFrom newsFrom={newsFrom} mailFrom={mailFrom} />
      {pauseText ? (
        <div className="mt-4 border border-pearl/20 px-4 py-4" role="status" data-pause={pauseReason}>
          <p className="text-[0.95rem] text-pearl/85">{pauseText}</p>
          {screen?.isOwner === true ? (
            <button type="button" className={`${actionClass} mt-3`} disabled={busy} onClick={onResume}>
              Resume
            </button>
          ) : null}
        </div>
      ) : null}
      <MasterSwitch
        isOwner={screen?.isOwner === true}
        enabled={screen?.masterEnabled === true}
        busy={busy}
        onChange={onMaster}
      />
      {state === 'loading' ? <p className="mt-4 text-[0.95rem] text-pearl/60">Loading letters.</p> : null}
      {state === 'error' ? (
        <div className="mt-4">
          <p className="text-[0.95rem] text-pearl/70">Letters are not available yet.</p>
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
      {state === 'ready' && screen ? (
        <div className="mt-6 grid gap-8 lg:grid-cols-[16rem_1fr]">
          <div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={actionClass} disabled={busy} onClick={onNew}>
                New letter
              </button>
              <button type="button" className={actionClass} disabled={busy || !digestReady} onClick={onDigest}>
                Email this digest
              </button>
            </div>
            <ul className="mt-4 space-y-2" aria-label="Letters">
              {screen.campaigns.length === 0 ? <li className="text-[0.95rem] text-pearl/60">No letters yet.</li> : null}
              {screen.campaigns.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="min-h-11 w-full border border-pearl/15 px-3 py-2 text-left"
                    aria-pressed={item.id === selected?.id}
                    onClick={() => onSelect(item.id)}
                  >
                    <span className="block text-[0.95rem] text-pearl">{item.subject || 'Untitled letter'}</span>
                    <span className="mt-1 block text-[0.75rem] tracking-[0.06em] text-pearl/50 uppercase">
                      {statusLabel(item.status)} · {categoryLabel(item.category)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[0.75rem] font-semibold tracking-[0.1em] text-pearl/50 uppercase" data-letter-status={draft.status}>
              {statusLabel(draft.status)}
            </p>
            {draft.kind === 'digest' ? (
              <p className="mt-3 max-w-xl text-[0.95rem] text-pearl/70">
                This letter uses the approved digest. The digest editor stays the source of truth.
              </p>
            ) : null}
            <label className={`${labelClass} mt-4`}>
              Subject
              <input
                value={draft.subject}
                onChange={(event) => onDraft({ ...draft, subject: event.target.value })}
                className={fieldClass}
              />
            </label>
            <label className={`${labelClass} mt-4`}>
              Preheader
              <input
                value={draft.preheader}
                onChange={(event) => onDraft({ ...draft, preheader: event.target.value })}
                className={fieldClass}
              />
            </label>
            <label className={`${labelClass} mt-4`}>
              Body
              <textarea
                value={draft.bodyText}
                onChange={(event) => onDraft({ ...draft, bodyText: event.target.value })}
                rows={6}
                className={fieldClass}
              />
            </label>
            <fieldset className="mt-4" data-audience-picker="">
              <legend className={labelClass}>Tiers</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {tierChoices().map((tier) => {
                  const on = draft.tiers.includes(tier.id)
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      className={`${actionClass} ${on ? 'border-brass text-brass-bright' : ''}`}
                      aria-pressed={on}
                      onClick={() => onToggleTier(tier.id)}
                    >
                      {tier.label}
                    </button>
                  )
                })}
              </div>
            </fieldset>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={actionClass} disabled={busy} onClick={onSave}>
                Save
              </button>
              <button
                type="button"
                className={actionClass}
                disabled={busy || (draft.status !== 'draft' && draft.status !== 'new')}
                onClick={onApprove}
              >
                Approve
              </button>
              <button type="button" className={actionClass} disabled={busy || !testSendAllowed(draft.status)} onClick={onTest}>
                Send test to me
              </button>
            </div>
            <p className="mt-3 max-w-xl text-[0.9rem] text-pearl/60">
              A test goes to the address on your account. It does not release the letter.
            </p>
            {selected ? <AudiencePreview counts={selected.audience} /> : null}
            {selected ? <SendLogView log={selected.log} /> : null}
            <div className="mt-6 border border-pearl/15 px-4 py-4" data-release={open ? 'enabled' : 'disabled'}>
              <h3 className="font-display text-[1.2rem] font-semibold">Release</h3>
              <p className="mt-2 text-[0.95rem] text-pearl/75" data-release-count={gate.eligible}>
                This letter would go to {gate.eligible} {gate.eligible === 1 ? 'member' : 'members'}.
              </p>
              {reasons.length > 0 ? (
                <ul className="mt-3 space-y-1 text-[0.95rem] text-pearl/70">
                  {reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              <button type="button" className={`${actionClass} mt-4`} disabled={!open || busy} onClick={onOpenConfirm}>
                Release
              </button>
              {open && confirmOpen ? (
                <div className="mt-4">
                  <label className={labelClass}>
                    Type {gate.eligible} to confirm
                    <input
                      value={confirmText}
                      onChange={(event) => onConfirmText(event.target.value)}
                      inputMode="numeric"
                      className={fieldClass}
                      aria-label="Type the count to confirm"
                    />
                  </label>
                  <button type="button" className={`${actionClass} mt-3`} disabled={!confirmed || busy} onClick={onRelease}>
                    Confirm release
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function StreamFrom({ newsFrom, mailFrom }: { newsFrom: string; mailFrom: string }) {
  return (
    <div className="mt-4 border border-pearl/15 px-4 py-4" data-streams="">
      <h3 className="font-display text-[1.2rem] font-semibold">Sending addresses</h3>
      <p className="mt-2 text-[0.95rem] text-pearl/80" data-stream="news">
        Newsletter from: {newsFrom || 'Not configured'}
      </p>
      <p className="mt-1 text-[0.95rem] text-pearl/80" data-stream="mail">
        Transactional from: {mailFrom || 'Not configured'}
      </p>
    </div>
  )
}

function MasterSwitch({
  isOwner,
  enabled,
  busy,
  onChange,
}: {
  isOwner: boolean
  enabled: boolean
  busy: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <div className="mt-4 border border-pearl/15 px-4 py-4" data-master={enabled ? 'on' : 'off'} data-master-control={isOwner ? 'owner' : 'hidden'}>
      <h3 className="font-display text-[1.2rem] font-semibold">Master switch</h3>
      <p className="mt-2 max-w-xl text-[0.95rem] text-pearl/75">
        {enabled
          ? 'The master switch is on. Release can send to members. Nothing is sent on its own.'
          : 'Sending stays off until the owner turns this on. Nothing is sent on its own. The first real send still needs written approval.'}
      </p>
      {isOwner ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Master switch">
          <button type="button" className={actionClass} aria-pressed={!enabled} disabled={busy} onClick={() => onChange(false)}>
            Off
          </button>
          <button type="button" className={actionClass} aria-pressed={enabled} disabled={busy} onClick={() => onChange(true)}>
            On
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[0.95rem] text-pearl/60">Only the owner can change the master switch.</p>
      )}
    </div>
  )
}

function AudiencePreview({ counts }: { counts: CampaignSummary['audience'] }) {
  return (
    <div className="mt-6" data-audience-preview="">
      <h3 className="font-display text-[1.2rem] font-semibold">Who would receive it</h3>
      <p className="mt-2 text-[0.9rem] text-pearl/60">Counts only. Addresses are not shown.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {AUDIENCE_REASON_LABELS.map(([key, label]) => (
          <li key={key} className="flex min-h-11 items-center justify-between border border-pearl/10 px-3">
            <span className="text-[0.95rem] text-pearl/80">{label}</span>
            <span className="text-[0.95rem] text-pearl">{counts[key]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SendLogView({ log }: { log: SendLog }) {
  const rows: Array<[keyof Omit<SendLog, 'events'>, string]> = [
    ['sent', 'Sent'],
    ['delivered', 'Delivered'],
    ['bounced', 'Bounced'],
    ['complained', 'Complained'],
    ['failed', 'Failed'],
    ['skipped', 'Skipped'],
    ['queued', 'Queued'],
    ['test', 'Test'],
  ]
  return (
    <div className="mt-6" data-send-log="">
      <h3 className="font-display text-[1.2rem] font-semibold">Send log</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([key, label]) => (
          <li key={key} className="flex min-h-11 items-center justify-between border border-pearl/10 px-3">
            <span className="text-[0.95rem] text-pearl/80">{label}</span>
            <span className="text-[0.95rem] text-pearl">{log[key]}</span>
          </li>
        ))}
      </ul>
      {log.events.length > 0 ? (
        <ul className="mt-3 space-y-2" aria-label="Latest events">
          {log.events.map((event, index) => (
            <li key={`${event.at}-${event.status}-${index}`} className="text-[0.9rem] text-pearl/70">
              {formatUkDateTime(event.at)} · {event.status}
              {event.isTest ? ' · test' : ''}
              {event.url ? ` · ${event.url}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[0.9rem] text-pearl/60">No send events yet.</p>
      )}
    </div>
  )
}

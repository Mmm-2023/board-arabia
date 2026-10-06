import { ExampleMark } from '../../components/ExampleMark'
import { SampleAction } from '../../components/SampleAction'
import { SAMPLE_NOTE } from '../../lib/sampleAction'
import {
  LOCKED_NOTE,
  LOCKED_PLACEHOLDERS,
  type MandateCardModel,
  type MandateOpen,
} from '../../lib/mandateRedaction'

export function MandateCard({
  mandate,
  busy,
  onRequest,
}: {
  mandate: MandateCardModel
  busy?: boolean
  onRequest?: (id: string) => void
}) {
  return (
    <article className="border border-[var(--ba-line)] bg-white px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
          {mandate.sector}
        </p>
        <div className="text-end">
          {mandate.is_demo ? <ExampleMark /> : null}
          <p className="mt-1 text-[0.85rem] text-ink/55">{mandate.stage}</p>
        </div>
      </div>
      <h2 className="mt-3 font-display text-[1.45rem] font-semibold tracking-[-0.03em]">
        {mandate.deal_type}
      </h2>
      <p className="mt-2 text-[0.95rem] text-ink/70">
        {mandate.ticket_band}
        <span aria-hidden="true"> · </span>
        <span className="sr-only">, </span>
        {mandate.geography}
      </p>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink/80">{mandate.one_liner}</p>
      {mandate.unlocked ? (
        <OpenBrief mandate={mandate} />
      ) : (
        <LockedBrief
          sample={mandate.is_demo}
          status={mandate.intro_status}
          busy={busy}
          onRequest={onRequest ? () => onRequest(mandate.id) : undefined}
        />
      )}
    </article>
  )
}

function OpenBrief({ mandate }: { mandate: MandateOpen }) {
  const rows = [
    ['Company', mandate.company_name],
    ['Amount', mandate.exact_amount],
    ['Terms', mandate.terms],
    ['Contact', mandate.contact_name],
    ['Email', mandate.contact_email],
    ['Phone', mandate.contact_phone],
    ['Deck', mandate.deck_url ?? ''],
  ].filter(([, value]) => value)
  return (
    <div className="mt-5 border-t border-[var(--ba-line)] pt-4">
      <dl className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">{label}</dt>
            <dd className="mt-0.5 text-[0.95rem] text-ink/85">{value}</dd>
          </div>
        ))}
      </dl>
      {mandate.narrative ? (
        <p className="mt-4 text-[0.98rem] leading-relaxed text-ink/75">{mandate.narrative}</p>
      ) : null}
    </div>
  )
}

function LockedBrief({
  sample,
  status,
  busy,
  onRequest,
}: {
  sample: boolean
  status: 'pending' | 'declined' | null
  busy?: boolean
  onRequest?: () => void
}) {
  const note =
    status === 'pending'
      ? 'Intro requested. Our admin team must approve it before the brief opens.'
      : status === 'declined'
        ? 'This intro was not approved.'
        : sample
          ? null
          : 'Request intro to unlock.'
  return (
    <div className="mt-5 border-t border-[var(--ba-line)] pt-4">
      <p className="sr-only">{LOCKED_NOTE}</p>
      <div aria-hidden="true" className="mandate-locked-copy space-y-2 text-[0.95rem] text-ink/70">
        <p>{LOCKED_PLACEHOLDERS.company}</p>
        <p>{LOCKED_PLACEHOLDERS.amount}</p>
        <p>{LOCKED_PLACEHOLDERS.contact}</p>
        <p>{LOCKED_PLACEHOLDERS.deck}</p>
        <p>{LOCKED_PLACEHOLDERS.narrative}</p>
      </div>
      {note ? <p className="mt-4 text-[0.92rem] text-ink/60">{note}</p> : null}
      {sample && status != null ? <p className="mt-4 text-[0.92rem] text-ink/60">{SAMPLE_NOTE}</p> : null}
      {sample && status == null ? (
        <SampleAction label="Request intro" />
      ) : status == null && onRequest ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRequest}
          className="ba-primary mt-3 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
        >
          Request intro
        </button>
      ) : null}
    </div>
  )
}

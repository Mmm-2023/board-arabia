import { CardMeta, PlaceMeta } from '../../components/CardMeta'
import { ExampleMark } from '../../components/ExampleMark'
import { SampleAction } from '../../components/SampleAction'
import { SAMPLE_NOTE } from '../../lib/sampleAction'
import {
  RE_LOCKED_NOTE,
  RE_LOCKED_PLACEHOLDERS,
  reAssetClassLabel,
  reCapitalRoleLabel,
  type ReOpportunityCard,
  type ReOpportunityInventory,
  type ReOpportunityOpen,
} from '../../lib/reRedaction'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { ClubInterestAction } from './ClubInterestAction'
import { ReadinessStrip } from './ReadinessStrip'

export function OpportunityCard({
  card,
  busy,
  fits = false,
  onRequest,
  showInterest = false,
  interestPending = false,
  interested = false,
  interestBusy = false,
  onInterest,
}: {
  card: ReOpportunityCard
  busy?: boolean
  fits?: boolean
  onRequest?: (id: string) => void
  showInterest?: boolean
  interestPending?: boolean
  interested?: boolean
  interestBusy?: boolean
  onInterest?: (id: string) => void
}) {
  return (
    <article
      className="border border-[var(--ba-line)] bg-white px-5 py-5"
      data-re-card={card.id}
      data-re-access={card.access}
      data-re-demo={card.is_demo ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">{card.sector}</p>
        <div className="text-end">
          {card.is_demo ? <ExampleMark /> : null}
          {card.unlocked && card.access === 'inventory' && !card.published ? (
            <p className="mt-1 text-[0.85rem] text-ink/55">Not published</p>
          ) : null}
        </div>
      </div>
      <h2 className="mt-3 font-display text-[1.45rem] font-semibold tracking-[-0.03em] text-balance">{card.one_liner}</h2>
      <PlaceMeta
        city={card.city}
        hint={card.one_liner}
        trailing={[reAssetClassLabel(card.asset_class)]}
        className="mt-2 text-[0.95rem] text-ink/70"
      />
      <CardMeta
        parts={[card.ticket_band, reCapitalRoleLabel(card.capital_role)]}
        className="mt-1 text-[0.95rem] text-ink/70"
      />
      {fits ? (
        <p data-re-fit="true" className="mt-3 text-[0.92rem] font-semibold text-[var(--ba-indigo)]">
          {MEMBER_VIEWS.realEstate.appetite.fit}
        </p>
      ) : null}
      <ReadinessStrip card={card} />
      {card.unlocked ? (
        <OpenBrief card={card} />
      ) : (
        <LockedBrief
          sample={card.is_demo}
          status={card.intro_status}
          busy={busy}
          onRequest={onRequest ? () => onRequest(card.id) : undefined}
        />
      )}
      {showInterest ? (
        <ClubInterestAction
          sample={card.is_demo}
          pending={interestPending}
          recorded={interested}
          busy={interestBusy}
          onExpress={onInterest ? () => onInterest(card.id) : undefined}
        />
      ) : null}
    </article>
  )
}

function OpenBrief({ card }: { card: ReOpportunityOpen | ReOpportunityInventory }) {
  const rows = [
    ['Counterparty', card.counterparty_name],
    ['Terms', card.terms],
    ['Contact', card.contact_name],
    ['Email', card.contact_email],
    ['Phone', card.contact_phone],
  ].filter(([, value]) => value)
  return (
    <div className="mt-5 border-t border-[var(--ba-line)] pt-4">
      <p className="text-[0.92rem] text-ink/60">
        {card.access === 'inventory' ? 'Your sponsor brief.' : 'Intro approved for you.'}
      </p>
      <dl className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">{label}</dt>
            <dd className="mt-0.5 text-[0.95rem] text-ink/85">{value}</dd>
          </div>
        ))}
      </dl>
      {card.narrative ? <p className="mt-4 text-[0.98rem] leading-relaxed text-ink/75">{card.narrative}</p> : null}
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
      ? 'Intro requested. Our admin team must approve it before the counterparty and terms open.'
      : status === 'declined'
        ? 'This intro was not approved.'
        : sample
          ? null
          : 'Request intro to unlock.'
  return (
    <div className="mt-5 border-t border-[var(--ba-line)] pt-4">
      <p className="sr-only">{status == null ? RE_LOCKED_NOTE : note}</p>
      <div aria-hidden="true" className="re-locked-copy space-y-2 text-[0.95rem] text-ink/70">
        <p>{RE_LOCKED_PLACEHOLDERS.counterparty}</p>
        <p>{RE_LOCKED_PLACEHOLDERS.terms}</p>
      </div>
      {note ? <p className="mt-4 text-[0.92rem] text-ink/60">{note}</p> : null}
      {sample && status != null ? <p className="mt-4 text-[0.92rem] text-ink/60">{SAMPLE_NOTE}</p> : null}
      {sample && status == null ? (
        <SampleAction label="Request intro" />
      ) : status == null && onRequest ? (
        <button
          type="button"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={onRequest}
          className="ba-primary mt-3 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
        >
          Request intro
        </button>
      ) : null}
    </div>
  )
}

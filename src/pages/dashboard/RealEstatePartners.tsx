import { ExampleMark } from '../../components/ExampleMark'
import { RePlace } from '../../components/RePlace'
import { SampleAction } from '../../components/SampleAction'
import { SAMPLE_NOTE } from '../../lib/sampleAction'
import { SponsorBadge } from '../../components/SponsorBadge'
import { rePartnerFeedIsForming, rePartnerGroups, RE_PARTNER_KIND_LABEL } from '../../lib/rePartnerView'
import type { RePartnerCard } from '../../lib/reRedaction'
import { CardSkeleton, EmptyState, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'

type PanelStatus = 'loading' | 'error' | 'denied' | 'ready'

export function RealEstatePartners({
  status,
  cards,
  busyId,
  requestError,
  onRetry,
  onRequest,
}: {
  status: PanelStatus
  cards: RePartnerCard[]
  busyId: string | null
  requestError: boolean
  onRetry: () => void
  onRequest: (id: string) => void
}) {
  const copy = MEMBER_VIEWS.realEstate
  const forming = status === 'ready' && rePartnerFeedIsForming(cards)
  const groups = status === 'ready' ? rePartnerGroups(cards) : []
  return (
    <div role="tabpanel" id="re-panel-partners" aria-labelledby="re-tab-partners" data-re-panel="partners">
      {status === 'loading' ? <CardSkeleton tone="member" label="Loading partners" /> : null}
      {status === 'error' ? (
        <div className="mt-4">
          <ErrorBanner tone="member" message={copy.error} retryLabel={copy.retry} onRetry={onRetry} />
        </div>
      ) : null}
      {status === 'denied' ? (
        <div className="mt-4">
          <PermissionState tone="member" message={copy.partnersDenied} />
        </div>
      ) : null}
      {status === 'ready' && cards.length === 0 ? (
        <div className="mt-4">
          <EmptyState tone="member" message={copy.partnersEmpty} />
        </div>
      ) : null}
      {status === 'ready' && cards.length > 0 ? (
        <>
          {forming ? (
            <p data-re-partner-forming="true" className="mt-4 max-w-xl text-[1rem] leading-relaxed text-ink/70">
              {copy.partnersForming}
            </p>
          ) : null}
          <div className="mt-6 space-y-8">
            {groups.map((group) => (
              <section key={group.kind} aria-label={group.label}>
                <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">{group.label}</h2>
                <ul className="mt-3 grid gap-3">
                  {group.rows.map((card) => (
                    <li key={card.id}>
                      <PartnerCard card={card} busy={busyId === card.id} onRequest={onRequest} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : null}
      {requestError ? (
        <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
          Could not send the request. Retry.
        </p>
      ) : null}
    </div>
  )
}

export function PartnerCard({
  card,
  busy,
  onRequest,
}: {
  card: RePartnerCard
  busy?: boolean
  onRequest?: (id: string) => void
}) {
  const copy = MEMBER_VIEWS.realEstate
  const status = card.access === 'locked' ? card.intro_status : null
  const note =
    status === 'pending'
      ? copy.partnersRequested
      : status === 'approved'
        ? copy.partnersApproved
        : status === 'declined'
          ? copy.partnersDeclined
          : null
  return (
    <article
      className="border border-[var(--ba-line)] bg-white px-5 py-5"
      data-re-partner={card.id}
      data-re-kind={card.kind}
      data-re-demo={card.is_demo ? 'true' : 'false'}
      data-re-sponsor={card.sponsor_tied ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
          {RE_PARTNER_KIND_LABEL[card.kind]}
        </p>
        <div className="flex items-center gap-2">
          {card.is_demo ? <ExampleMark /> : null}
          {card.sponsor_tied ? <SponsorBadge /> : null}
        </div>
      </div>
      <h3 className="mt-3 font-display text-[1.45rem] font-semibold tracking-[-0.03em] text-balance">{card.name}</h3>
      <p className="mt-2 text-[0.95rem] text-ink/70">
        <RePlace city={card.city} hint={card.blurb} />
      </p>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink/80">{card.blurb}</p>
      {card.access === 'locked' ? (
        <div className="mt-5 border-t border-[var(--ba-line)] pt-4">
          {note ? (
            <p className="text-[0.92rem] text-ink/60" role="status" data-re-partner-confirm={status === 'pending' ? 'true' : 'false'}>
              {note}
            </p>
          ) : null}
          {card.is_demo && status == null ? (
            <SampleAction label="Request intro" />
          ) : status == null && onRequest ? (
            <button
              type="button"
              disabled={busy}
              aria-busy={busy || undefined}
              onClick={() => onRequest(card.id)}
              className="ba-primary mt-3 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
            >
              Request intro
            </button>
          ) : null}
          {card.is_demo && status != null ? <p className="mt-4 text-[0.92rem] text-ink/60">{SAMPLE_NOTE}</p> : null}
        </div>
      ) : null}
    </article>
  )
}

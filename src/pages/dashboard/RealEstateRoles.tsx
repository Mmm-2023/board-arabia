import { ExampleMark } from '../../components/ExampleMark'
import { SampleAction } from '../../components/SampleAction'
import { SAMPLE_NOTE } from '../../lib/sampleAction'
import {
  reBoardRoleFeedIsForming,
  reBoardSeatLabel,
  type ReBoardRoleCard,
  type ReBoardRoleInventory,
  type ReBoardRoleOpen,
} from '../../lib/reBoardRoles'
import { reAssetClassLabel } from '../../lib/reRedaction'
import { CardSkeleton, EmptyState, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'

type PanelStatus = 'loading' | 'error' | 'denied' | 'ready'

const LOCKED = {
  organisation: 'Organisation name',
  terms: 'Seat terms',
} as const

export function RealEstateRoles({
  status,
  cards,
  busyId,
  requestError,
  onRetry,
  onRequest,
}: {
  status: PanelStatus
  cards: ReBoardRoleCard[]
  busyId: string | null
  requestError: boolean
  onRetry: () => void
  onRequest: (id: string) => void
}) {
  const copy = MEMBER_VIEWS.realEstate
  const forming = status === 'ready' && reBoardRoleFeedIsForming(cards)
  return (
    <div role="tabpanel" id="re-panel-roles" aria-labelledby="re-tab-roles" data-re-panel="roles">
      {status === 'loading' ? <CardSkeleton tone="member" label="Loading board roles" /> : null}
      {status === 'error' ? (
        <div className="mt-4">
          <ErrorBanner tone="member" message={copy.error} retryLabel={copy.retry} onRetry={onRetry} />
        </div>
      ) : null}
      {status === 'denied' ? (
        <div className="mt-4">
          <PermissionState tone="member" message={copy.rolesDenied} />
        </div>
      ) : null}
      {status === 'ready' && cards.length === 0 ? (
        <div className="mt-4" data-re-roles-empty="true">
          <EmptyState
            tone="member"
            message={copy.rolesEmpty}
            action={{ label: copy.rolesEmptyAction, to: '/dashboard/deals/real-estate' }}
          />
        </div>
      ) : null}
      {status === 'ready' && cards.length > 0 ? (
        <>
          {forming ? (
            <p data-re-role-forming="true" className="mt-4 max-w-xl text-[1rem] leading-relaxed text-ink/70">
              {copy.rolesForming}
            </p>
          ) : null}
          <ul className="mt-4 grid gap-3">
            {cards.map((card) => (
              <li key={card.id}>
                <RoleCard card={card} busy={busyId === card.id} onRequest={onRequest} />
              </li>
            ))}
          </ul>
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

export function RoleCard({
  card,
  busy,
  onRequest,
}: {
  card: ReBoardRoleCard
  busy?: boolean
  onRequest?: (id: string) => void
}) {
  return (
    <article
      className="border border-[var(--ba-line)] bg-white px-5 py-5"
      data-re-role={card.id}
      data-re-role-access={card.access}
      data-re-role-demo={card.is_demo ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
          {reBoardSeatLabel(card.seat_kind)}
        </p>
        <div className="text-end">
          {card.is_demo ? <ExampleMark /> : null}
          {card.unlocked && card.access === 'inventory' && !card.published ? (
            <p className="mt-1 text-[0.85rem] text-ink/55">Not published</p>
          ) : null}
        </div>
      </div>
      <h2 className="mt-3 font-display text-[1.45rem] font-semibold tracking-[-0.03em] text-balance">{card.title}</h2>
      <p className="mt-2 text-[0.95rem] text-ink/70">{card.sector}</p>
      <p className="mt-1 text-[0.95rem] text-ink/70">{card.capacity}</p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Fit">
        <li className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-3 text-[0.92rem] text-ink">
          {reAssetClassLabel(card.asset_class)}
        </li>
        <li className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-3 text-[0.92rem] text-ink">
          {card.city}
        </li>
      </ul>
      {card.unlocked ? (
        <OpenSeat card={card} />
      ) : (
        <LockedSeat
          sample={card.is_demo}
          status={card.intro_status}
          busy={busy}
          onRequest={onRequest ? () => onRequest(card.id) : undefined}
        />
      )}
    </article>
  )
}

function OpenSeat({ card }: { card: ReBoardRoleOpen | ReBoardRoleInventory }) {
  const copy = MEMBER_VIEWS.realEstate
  const rows = [
    ['Organisation', card.organisation_name],
    ['Seat terms', card.terms],
    ['Contact', card.contact_name],
    ['Email', card.contact_email],
    ['Phone', card.contact_phone],
  ].filter(([, value]) => value)
  return (
    <div className="mt-5 border-t border-[var(--ba-line)] pt-4" data-re-role-open="true">
      <p className="text-[0.92rem] text-ink/60">
        {card.access === 'inventory' ? copy.rolesInventory : copy.rolesApproved}
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

function LockedSeat({
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
  const copy = MEMBER_VIEWS.realEstate
  const note = status === 'pending' ? copy.rolesRequested : status === 'declined' ? copy.rolesDeclined : null
  return (
    <div className="mt-5 border-t border-[var(--ba-line)] pt-4">
      <p className="sr-only">{status == null ? copy.rolesLocked : note}</p>
      <div aria-hidden="true" className="re-locked-copy space-y-2 text-[0.95rem] text-ink/70">
        <p>{LOCKED.organisation}</p>
        <p>{LOCKED.terms}</p>
      </div>
      {note ? (
        <p className="mt-4 text-[0.92rem] text-ink/60" role="status" data-re-role-confirm={status === 'pending' ? 'true' : 'false'}>
          {note}
        </p>
      ) : null}
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

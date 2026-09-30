import { useState, type ReactNode } from 'react'
import { ExampleMark } from '../../components/ExampleMark'
import { RePlace } from '../../components/RePlace'
import { SponsorBadge } from '../../components/SponsorBadge'
import {
  draftFromPartner,
  emptyPartnerDraft,
  RE_PARTNER_KIND_LABEL,
  RE_PARTNER_STAFF,
  type RePartnerDraft,
} from '../../lib/rePartnerView'
import { RE_PARTNER_KINDS, type RePartnerCard } from '../../lib/reRedaction'
import { RE_REGIONS, type ReRegion } from '../../lib/reRegions'
import { ErrorBanner, toneClasses } from '../../shell/ViewState'

export type RePartnersEditorStatus = 'loading' | 'error' | 'denied' | 'unavailable' | 'ready'

export function RePartnersEditor({
  status,
  cards,
  busyId,
  notice,
  alert,
  onRetry,
  onSave,
  onMove,
}: {
  status: RePartnersEditorStatus
  cards: RePartnerCard[]
  busyId: string | null
  notice: string | null
  alert: string | null
  onRetry: () => void
  onSave: (draft: RePartnerDraft) => void
  onMove: (id: string, direction: -1 | 1) => void
}) {
  const styles = toneClasses('staff')
  const [adding, setAdding] = useState(false)
  const nextOrder = cards.reduce((max, card) => (card.access === 'inventory' ? Math.max(max, card.sort_order) : max), 0) + 1
  return (
    <section aria-label="Real estate partners" className="mt-8" data-re-staff-partners="true">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>
        {RE_PARTNER_STAFF.title}
      </h2>
      <p className={`mt-3 max-w-xl text-[0.98rem] leading-relaxed ${styles.muted}`}>{RE_PARTNER_STAFF.lead}</p>
      {status === 'loading' ? (
        <div aria-busy="true" aria-label={RE_PARTNER_STAFF.loading} className="mt-4 space-y-3">
          {['a', 'b'].map((id) => (
            <div key={id} className={`h-28 ${styles.skeleton} motion-reduce:animate-none animate-pulse`} />
          ))}
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="mt-4">
          <ErrorBanner tone="staff" message={RE_PARTNER_STAFF.loadError} retryLabel={RE_PARTNER_STAFF.retry} onRetry={onRetry} />
        </div>
      ) : null}
      {status === 'denied' ? <p className={`mt-4 ${styles.muted}`}>{RE_PARTNER_STAFF.denied}</p> : null}
      {status === 'unavailable' ? <p className={`mt-4 ${styles.muted}`}>{RE_PARTNER_STAFF.unavailable}</p> : null}
      {status === 'ready' && cards.length === 0 ? <p className={`mt-4 ${styles.muted}`}>{RE_PARTNER_STAFF.empty}</p> : null}
      {status === 'ready' && cards.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {cards.map((card) => (
            <li key={card.id} className={`${styles.panel} px-4 py-4`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass-bright uppercase">
                  {RE_PARTNER_KIND_LABEL[card.kind]}
                </p>
                <div className="flex items-center gap-2">
                  {card.is_demo ? <ExampleMark /> : null}
                  {card.sponsor_tied ? <SponsorBadge /> : null}
                </div>
              </div>
              <p className="mt-2 font-display text-[1.2rem] font-semibold text-balance">{card.name}</p>
              <p className={`mt-1 text-[0.92rem] ${styles.muted}`}>
                <RePlace city={card.city} hint={card.blurb} />
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, </span>
                {card.blurb}
              </p>
              {card.access === 'inventory' && !card.is_demo ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`inline-flex min-h-11 items-center px-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.secondary}`}
                      onClick={() => onMove(card.id, -1)}
                      disabled={busyId === card.id}
                    >
                      {RE_PARTNER_STAFF.up}
                    </button>
                    <button
                      type="button"
                      className={`inline-flex min-h-11 items-center px-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.secondary}`}
                      onClick={() => onMove(card.id, 1)}
                      disabled={busyId === card.id}
                    >
                      {RE_PARTNER_STAFF.down}
                    </button>
                  </div>
                  <PartnerForm
                    initial={draftFromPartner(card)}
                    busy={busyId === card.id}
                    onSave={onSave}
                  />
                </>
              ) : (
                <p className={`mt-3 text-[0.9rem] ${styles.muted}`}>{RE_PARTNER_STAFF.demo}</p>
              )}
              {card.access === 'inventory' && !card.published && !card.is_demo ? (
                <p className={`mt-2 text-[0.85rem] ${styles.muted}`}>{RE_PARTNER_STAFF.hidden}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {status === 'ready' ? (
        <div className="mt-4">
          {adding ? (
            <div className={`${styles.panel} px-4 py-4`}>
              <PartnerForm
                initial={emptyPartnerDraft(nextOrder)}
                busy={busyId === 'new'}
                onSave={onSave}
              />
            </div>
          ) : (
            <button
              type="button"
              className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.primary}`}
              onClick={() => setAdding(true)}
            >
              {RE_PARTNER_STAFF.add}
            </button>
          )}
        </div>
      ) : null}
      {notice ? <p className="mt-4 text-[0.95rem] text-brass-bright">{notice}</p> : null}
      {alert ? (
        <p className={`mt-4 ${styles.alert}`} role="alert">
          {alert}
        </p>
      ) : null}
    </section>
  )
}

function PartnerForm({
  initial,
  busy,
  onSave,
}: {
  initial: RePartnerDraft
  busy: boolean
  onSave: (draft: RePartnerDraft) => void
}) {
  const [draft, setDraft] = useState<RePartnerDraft>(initial)
  const nameId = `partner-name-${initial.id ?? 'new'}`
  const kindId = `partner-kind-${initial.id ?? 'new'}`
  const cityId = `partner-city-${initial.id ?? 'new'}`
  const blurbId = `partner-blurb-${initial.id ?? 'new'}`
  const contactId = `partner-contact-${initial.id ?? 'new'}`
  const emailId = `partner-email-${initial.id ?? 'new'}`
  const phoneId = `partner-phone-${initial.id ?? 'new'}`
  const visibleId = `partner-visible-${initial.id ?? 'new'}`
  return (
    <form
      className="mt-4 space-y-3"
      data-re-partner-edit="true"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(draft)
      }}
    >
      <Field label="Firm name" id={nameId}>
        <input
          id={nameId}
          value={draft.name}
          required
          disabled={busy}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className="min-h-11 w-full border border-white/30 bg-pearl ps-3 pe-3 text-[0.95rem] text-ink"
        />
      </Field>
      <Field label="Category" id={kindId}>
        <select
          id={kindId}
          value={draft.kind}
          required
          disabled={busy}
          onChange={(event) => setDraft({ ...draft, kind: event.target.value as RePartnerDraft['kind'] })}
          className="min-h-11 w-full border border-white/30 bg-pearl ps-3 pe-3 text-[0.95rem] text-ink"
        >
          <option value="">Choose</option>
          {RE_PARTNER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {RE_PARTNER_KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Region" id={cityId}>
        <select
          id={cityId}
          value={draft.city}
          required
          disabled={busy}
          onChange={(event) => setDraft({ ...draft, city: event.target.value as ReRegion | '' })}
          className="min-h-11 w-full border border-white/30 bg-pearl ps-3 pe-3 text-[0.95rem] text-ink"
        >
          <option value="">Choose</option>
          {RE_REGIONS.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What they help with" id={blurbId}>
        <input
          id={blurbId}
          value={draft.blurb}
          required
          disabled={busy}
          onChange={(event) => setDraft({ ...draft, blurb: event.target.value })}
          className="min-h-11 w-full border border-white/30 bg-pearl ps-3 pe-3 text-[0.95rem] text-ink"
        />
      </Field>
      <Field label="Desk contact name" id={contactId}>
        <input
          id={contactId}
          value={draft.contact_name}
          required
          disabled={busy}
          autoComplete="off"
          onChange={(event) => setDraft({ ...draft, contact_name: event.target.value })}
          className="min-h-11 w-full border border-white/30 bg-pearl ps-3 pe-3 text-[0.95rem] text-ink"
        />
      </Field>
      <Field label="Desk email" id={emailId}>
        <input
          id={emailId}
          value={draft.contact_email}
          required
          disabled={busy}
          autoComplete="off"
          inputMode="email"
          onChange={(event) => setDraft({ ...draft, contact_email: event.target.value })}
          className="min-h-11 w-full border border-white/30 bg-pearl ps-3 pe-3 text-[0.95rem] text-ink"
        />
      </Field>
      <Field label="Desk phone" id={phoneId}>
        <input
          id={phoneId}
          value={draft.contact_phone}
          required
          disabled={busy}
          autoComplete="off"
          onChange={(event) => setDraft({ ...draft, contact_phone: event.target.value })}
          className="min-h-11 w-full border border-white/30 bg-pearl ps-3 pe-3 text-[0.95rem] text-ink"
        />
      </Field>
      <div className="flex min-h-11 items-center gap-3">
        <input
          id={visibleId}
          type="checkbox"
          checked={draft.published}
          disabled={busy}
          onChange={(event) => setDraft({ ...draft, published: event.target.checked })}
          className="size-5"
        />
        <label htmlFor={visibleId} className="text-[0.95rem] text-pearl">
          {RE_PARTNER_STAFF.visible}
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy || undefined}
        className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
      >
        {busy ? RE_PARTNER_STAFF.saving : RE_PARTNER_STAFF.save}
      </button>
    </form>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-[0.95rem] text-pearl">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

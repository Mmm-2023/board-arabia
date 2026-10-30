import { useState, type FormEvent } from 'react'
import { ExampleMark } from '../../components/ExampleMark'
import {
  BOARD_SEAT_KINDS,
  BOARD_SEAT_KIND_LABEL,
  BOARD_SEAT_LIMITS,
  BOARD_SEAT_STATUS_LABEL,
  boardSeatKindLabel,
  type BoardSeatApplicant,
  type BoardSeatDraft,
  type BoardSeatRow,
} from '../../lib/boardSeats'
import { BOARD_EXPERTISE } from '../../lib/boardroom'
import { SEAT_SUGGESTION_COPY } from '../../lib/seatMatch'
import { SECTOR_TAGS } from '../../lib/profileTags'
import { RE_REGIONS } from '../../lib/reRegions'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { toneClasses } from '../../shell/ViewState'

const inputClass =
  'mt-2 block min-h-11 w-full border border-pearl/20 bg-transparent px-3 text-[0.95rem] text-pearl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ba-lavender-mist)]'

const labelClass = 'block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase'

export function BoardSeatsView({
  status,
  seats,
  draft,
  editingId,
  message,
  notice,
  busy,
  openId,
  applicants,
  onDraft,
  onSubmit,
  onEdit,
  onPublish,
  onClose,
  onOpenApplicants,
  onRetry,
  suggestionsEnabled,
  onSuggestions,
}: {
  status: 'loading' | 'error' | 'ready'
  seats: BoardSeatRow[]
  draft: BoardSeatDraft
  editingId: string | null
  message: string
  notice: string
  busy: boolean
  openId: string | null
  applicants: Readonly<Record<string, BoardSeatApplicant[] | 'error'>>
  onDraft: (draft: BoardSeatDraft) => void
  onSubmit: () => void
  onEdit: (seat: BoardSeatRow) => void
  onPublish: (id: string) => void
  onClose: (id: string) => void
  onOpenApplicants: (id: string) => void
  onRetry: () => void
  suggestionsEnabled: boolean | null
  onSuggestions: (enabled: boolean) => void
}) {
  const styles = toneClasses('staff')
  const copy = STAFF_VIEWS.boardSeats
  const [confirm, setConfirm] = useState<{ id: string; mode: 'decline' | 'close' } | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <section aria-label="Board seats" className="mt-8" data-board-seats-panel="">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>{copy.title}</h2>
      <p className={`mt-3 max-w-xl text-[0.98rem] leading-relaxed ${styles.muted}`}>{copy.lead}</p>
      {suggestionsEnabled == null ? null : (
        <div className="mt-4 max-w-xl" data-seat-suggestions-switch={suggestionsEnabled ? 'on' : 'off'}>
          <p className="text-[1.0625rem] font-semibold text-pearl">{SEAT_SUGGESTION_COPY.switchLabel}</p>
          <p className={`mt-2 text-[1rem] leading-relaxed ${styles.muted}`}>{SEAT_SUGGESTION_COPY.switchHelper}</p>
          <button
            type="button"
            role="switch"
            aria-checked={suggestionsEnabled}
            disabled={busy}
            onClick={() => onSuggestions(!suggestionsEnabled)}
            className="mt-3 inline-flex min-h-12 items-center px-4 text-[1.0625rem] font-semibold text-pearl disabled:opacity-40"
          >
            {suggestionsEnabled ? 'On' : 'Off'}
          </button>
        </div>
      )}
      {status === 'loading' ? <p className={`mt-3 ${styles.muted}`}>{copy.loading}</p> : null}
      {status === 'error' ? (
        <div className="mt-3">
          <p className={styles.alert}>{copy.error}</p>
          <button
            type="button"
            onClick={onRetry}
            className={`mt-2 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.secondary}`}
          >
            {copy.retry}
          </button>
        </div>
      ) : null}
      {status === 'ready' && seats.length === 0 ? <p className={`mt-3 ${styles.muted}`}>{copy.queueEmpty}</p> : null}
      {status === 'ready' && seats.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {seats.map((seat) => {
            const waiting = seat.status === 'pending_review'
            const closed = seat.status === 'closed'
            const people = applicants[seat.id]
            return (
              <li key={seat.id} className={`${styles.panel} px-4 py-4`} data-board-seat={seat.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-[1.2rem] font-semibold">{seat.title}</p>
                  {seat.isDemo ? <ExampleMark /> : null}
                </div>
                <p className={`mt-1 ${styles.muted}`}>
                  {seat.organisationName}. {boardSeatKindLabel(seat.seatKind)}. {BOARD_SEAT_STATUS_LABEL[seat.status]}.{' '}
                  {seat.posterName ? `Posted by ${seat.posterName}` : copy.postedByAdmin}. {peopleLine(seat.applicantCount)}.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {waiting || seat.status === 'draft' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onPublish(seat.id)}
                      className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
                    >
                      {waiting ? copy.approve : copy.publish}
                    </button>
                  ) : null}
                  {!closed ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm({ id: seat.id, mode: waiting ? 'decline' : 'close' })}
                      className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 ${styles.secondary}`}
                    >
                      {waiting ? copy.decline : copy.close}
                    </button>
                  ) : null}
                  {!closed ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onEdit(seat)}
                      className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 ${styles.secondary}`}
                    >
                      {copy.edit}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onOpenApplicants(seat.id)}
                    className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 ${styles.secondary}`}
                  >
                    {copy.people}
                  </button>
                </div>
                {openId === seat.id ? (
                  <div className="mt-4 border-t border-white/15 pt-3" data-board-seat-applicants={seat.id}>
                    {people === 'error' ? <p className={styles.alert}>{copy.error}</p> : null}
                    {people && people !== 'error' && people.length === 0 ? (
                      <p className={styles.muted}>{copy.peopleEmpty}</p>
                    ) : null}
                    {people && people !== 'error' && people.length > 0 ? (
                      <ul className="space-y-3">
                        {people.map((person) => (
                          <li key={person.id} data-board-seat-applicant={person.id}>
                            <p className="text-[1rem]">{person.memberName}</p>
                            <p className={`mt-1 ${styles.muted}`}>
                              {[person.headline, person.company].filter(Boolean).join('. ')}
                              {person.note ? `. ${person.note}` : ''}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      <form data-board-seat-form="" className="mt-8 max-w-xl" onSubmit={submit}>
        <h3 className="font-display text-[1.45rem] font-semibold tracking-[-0.02em]">
          {editingId ? copy.edit : copy.formTitle}
        </h3>
        <div className="mt-5 space-y-4">
          <label className={labelClass} htmlFor="board-seat-kind">
            Seat kind
            <select
              id="board-seat-kind"
              value={draft.seatKind}
              onChange={(event) => onDraft({ ...draft, seatKind: event.target.value as BoardSeatDraft['seatKind'] })}
              className={inputClass}
            >
              {BOARD_SEAT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {BOARD_SEAT_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </label>
          <Field id="board-seat-title" label="Title" value={draft.title} maxLength={BOARD_SEAT_LIMITS.title} onChange={(title) => onDraft({ ...draft, title })} />
          <Field id="board-seat-org" label="Organisation" value={draft.organisationName} maxLength={BOARD_SEAT_LIMITS.organisation} onChange={(organisationName) => onDraft({ ...draft, organisationName })} />
          <Field id="board-seat-sector" label="Sector" value={draft.sector} maxLength={BOARD_SEAT_LIMITS.sector} onChange={(sector) => onDraft({ ...draft, sector })} />
          <Field id="board-seat-capacity" label="Time commitment" value={draft.capacity} maxLength={BOARD_SEAT_LIMITS.capacity} onChange={(capacity) => onDraft({ ...draft, capacity })} />
          <TagGroup
            legend={copy.sectors}
            hint={copy.sectorHint}
            name="board-seat-sectors"
            options={SECTOR_TAGS}
            selected={draft.sectorTags}
            max={BOARD_SEAT_LIMITS.sectors}
            onToggle={(sectorTags) => onDraft({ ...draft, sectorTags })}
          />
          <TagGroup
            legend={SEAT_SUGGESTION_COPY.skillsLabel}
            hint={SEAT_SUGGESTION_COPY.skillsHint}
            name="board-seat-skills"
            options={BOARD_EXPERTISE}
            selected={draft.skillsWanted}
            max={3}
            onToggle={(skillsWanted) => onDraft({ ...draft, skillsWanted })}
          />
          <TagGroup
            legend={copy.regions}
            hint={copy.regionHint}
            name="board-seat-regions"
            options={RE_REGIONS}
            selected={draft.regions}
            max={BOARD_SEAT_LIMITS.regions}
            onToggle={(regions) => onDraft({ ...draft, regions })}
          />
          <Area id="board-seat-terms" label="Seat terms" value={draft.terms} maxLength={BOARD_SEAT_LIMITS.terms} onChange={(terms) => onDraft({ ...draft, terms })} />
          <Area id="board-seat-narrative" label="Narrative" value={draft.narrative} maxLength={BOARD_SEAT_LIMITS.narrative} onChange={(narrative) => onDraft({ ...draft, narrative })} />
          <Field id="board-seat-contact-name" label="Contact name" hint={copy.contactHint} value={draft.contactName} maxLength={BOARD_SEAT_LIMITS.contactName} onChange={(contactName) => onDraft({ ...draft, contactName })} />
          <Field id="board-seat-contact-email" label="Contact email" value={draft.contactEmail} maxLength={320} type="email" placeholder="name@example.com" onChange={(contactEmail) => onDraft({ ...draft, contactEmail })} />
          <Field id="board-seat-contact-phone" label="Contact phone" value={draft.contactPhone} maxLength={BOARD_SEAT_LIMITS.contactPhone} onChange={(contactPhone) => onDraft({ ...draft, contactPhone })} />
        </div>
        {message ? (
          <p className="mt-4 text-[0.95rem] text-red-300" role="alert" data-board-seat-error="">
            {message}
          </p>
        ) : null}
        {notice ? <p className="mt-4 text-[0.95rem] text-brass-bright">{notice}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-60"
        >
          {busy ? copy.saving : copy.save}
        </button>
      </form>
      {confirm ? (
        <ConfirmDialog
          tone="staff"
          title={confirm.mode === 'decline' ? copy.declineTitle : copy.closeTitle}
          body={confirm.mode === 'decline' ? copy.declineBody : copy.closeBody}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.id
            setConfirm(null)
            onClose(id)
          }}
        />
      ) : null}
    </section>
  )
}

function peopleLine(count: number) {
  if (count === 1) return '1 person put themselves forward'
  return `${count} people put themselves forward`
}

function Field({
  id,
  label,
  hint,
  value,
  maxLength,
  type = 'text',
  placeholder,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: string
  maxLength: number
  type?: 'text' | 'email'
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label className={labelClass} htmlFor={id}>
      {label}
      {hint ? <span className="mt-1 block text-[0.8rem] font-normal tracking-normal text-pearl/50 normal-case">{hint}</span> : null}
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  )
}

function Area({
  id,
  label,
  value,
  maxLength,
  onChange,
}: {
  id: string
  label: string
  value: string
  maxLength: number
  onChange: (value: string) => void
}) {
  return (
    <label className={labelClass} htmlFor={id}>
      {label}
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  )
}

function TagGroup({
  legend,
  hint,
  name,
  options,
  selected,
  max,
  onToggle,
}: {
  legend: string
  hint: string
  name: string
  options: readonly string[]
  selected: readonly string[]
  max: number
  onToggle: (next: string[]) => void
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      <p className="mt-1 text-[0.8rem] text-pearl/50">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = selected.includes(option)
          return (
            <label
              key={option}
              className="inline-flex min-h-11 items-center gap-2 border border-pearl/15 px-3 text-[0.85rem] font-normal tracking-normal text-pearl normal-case"
            >
              <input
                type="checkbox"
                name={name}
                className="size-4"
                checked={checked}
                disabled={!checked && selected.length >= max}
                onChange={() => {
                  const next = checked ? selected.filter((item) => item !== option) : [...selected, option]
                  onToggle(next.slice(0, max))
                }}
              />
              {option}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

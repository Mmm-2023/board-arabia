import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ExampleMark } from '../../components/ExampleMark'
import { boardSeatKindLabel, BOARD_SEAT_KINDS, BOARD_SEAT_KIND_LABEL, BOARD_SEAT_LIMITS, BOARD_SEAT_STATUS_LABEL } from '../../lib/boardSeats'
import {
  applicationStatusLabel,
  BOARD_SEAT_NOTE_LIMIT,
  type BoardSeatApplication,
  type BoardSeatDetail,
  type MemberSeatDraft,
  type PostedBoardSeat,
  type PublishedBoardSeat,
  type ShortlistPerson,
} from '../../lib/memberBoardSeats'
import { SECTOR_TAGS } from '../../lib/profileTags'
import { RE_REGIONS } from '../../lib/reRegions'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { CardSkeleton, EmptyState, ErrorBanner, PermissionState } from '../../shell/ViewState'

const fieldClass =
  'mt-2 w-full min-h-11 border border-ink/15 bg-white px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'

const labelClass = 'block text-[0.68rem] font-semibold tracking-[0.08em] text-ink/45 uppercase'

const buttonClass =
  'ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40'

const formLabelClass = 'block text-[1rem] font-semibold text-ink/70'

const formButtonClass =
  'ba-primary inline-flex min-h-11 min-w-11 items-center px-4 text-[1.0625rem] font-semibold disabled:opacity-40'

export function MemberBoardSeatList({
  status,
  seats,
  applications,
  posted,
  onRetry,
}: {
  status: 'loading' | 'error' | 'denied' | 'ready'
  seats: PublishedBoardSeat[]
  applications: BoardSeatApplication[]
  posted: PostedBoardSeat[]
  onRetry: () => void
}) {
  const copy = MEMBER_VIEWS.boardSeats
  return (
    <div className="max-w-3xl" data-board-seat-list="">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">{copy.title}</h1>
        <Link to="/dashboard/deals/board-seats/new" className={buttonClass}>
          {copy.post}
        </Link>
      </div>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/60">{copy.lead}</p>
      <p className="mt-3">
        <Link to="/dashboard/deals/real-estate?view=roles" className="text-[0.95rem] font-semibold text-ink underline">
          {copy.realEstateLink}
        </Link>
      </p>
      <div className="mt-8">
        {status === 'loading' ? <CardSkeleton tone="member" label={copy.loading} /> : null}
        {status === 'error' ? (
          <ErrorBanner tone="member" message={copy.error} retryLabel={copy.retry} onRetry={onRetry} />
        ) : null}
        {status === 'denied' ? <PermissionState tone="member" message={copy.denied} /> : null}
        {status === 'ready' && seats.length === 0 ? <EmptyState tone="member" message={copy.empty} /> : null}
        {status === 'ready' && seats.length > 0 ? (
          <ul className="grid gap-3">
            {seats.map((seat) => (
              <li key={seat.id}>
                <SeatCard seat={seat} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {status === 'ready' ? (
        <>
          <ApplicationList rows={applications} />
          <PostedList rows={posted} />
        </>
      ) : null}
    </div>
  )
}

function SeatCard({ seat }: { seat: PublishedBoardSeat }) {
  return (
    <article className="border border-[var(--ba-line)] bg-white px-5 py-5" data-board-seat={seat.id}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
          {boardSeatKindLabel(seat.seatKind)}
        </p>
        {seat.isDemo ? <ExampleMark /> : null}
      </div>
      <h2 className="mt-3 font-display text-[1.45rem] font-semibold tracking-[-0.03em]">
        <Link to={`/dashboard/deals/board-seats/${seat.id}`} className="underline decoration-transparent hover:decoration-ink">
          {seat.title}
        </Link>
      </h2>
      <p className="mt-2 text-[0.95rem] text-ink/70">{seat.organisationName}</p>
      <p className="mt-1 text-[0.95rem] text-ink/70">{seat.sector}</p>
      <p className="mt-1 text-[0.95rem] text-ink/70">{seat.capacity}</p>
      {seat.posterIsPartner ? (
        <p className="mt-3 text-[0.92rem] text-ink/60" data-board-seat-partner="true">
          {MEMBER_VIEWS.boardSeats.partnerPoster}
        </p>
      ) : null}
    </article>
  )
}

function ApplicationList({ rows }: { rows: BoardSeatApplication[] }) {
  const copy = MEMBER_VIEWS.boardSeats
  return (
    <section className="mt-10" aria-label={copy.applications} data-my-applications="">
      <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">{copy.applications}</h2>
      {rows.length === 0 ? <p className="mt-3 text-[0.95rem] text-ink/60">{copy.applicationsEmpty}</p> : null}
      {rows.length > 0 ? (
        <ul className="mt-3 grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="border border-[var(--ba-line)] bg-white px-5 py-4" data-board-application={row.id}>
              <Link to={`/dashboard/deals/board-seats/${row.roleId}`} className="font-display text-[1.15rem] font-semibold">
                {row.title}
              </Link>
              <p className="mt-1 text-[0.95rem] text-ink/70">
                {row.organisationName}. {BOARD_SEAT_STATUS_LABEL[row.seatStatus]}. {applicationStatusLabel(row.status)}.
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function PostedList({ rows }: { rows: PostedBoardSeat[] }) {
  const copy = MEMBER_VIEWS.boardSeats
  return (
    <section className="mt-10" aria-label={copy.posted} data-my-seats="">
      <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">{copy.posted}</h2>
      {rows.length === 0 ? <p className="mt-3 text-[0.95rem] text-ink/60">{copy.postedEmpty}</p> : null}
      {rows.length > 0 ? (
        <ul className="mt-3 grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="border border-[var(--ba-line)] bg-white px-5 py-4" data-posted-seat={row.id}>
              <Link to={`/dashboard/deals/board-seats/${row.id}`} className="font-display text-[1.15rem] font-semibold">
                {row.title}
              </Link>
              <p className="mt-1 text-[0.95rem] text-ink/70">
                {row.organisationName}. {BOARD_SEAT_STATUS_LABEL[row.status]}. {peopleLine(row.applicantCount)}.
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function peopleLine(count: number) {
  if (count === 1) return '1 person put themselves forward'
  return `${count} people put themselves forward`
}

export function MemberBoardSeatDetail({
  status,
  seat,
  shortlist,
  note,
  message,
  notice,
  busy,
  onNote,
  onApply,
  onOpen,
  onRetry,
}: {
  status: 'loading' | 'error' | 'denied' | 'ready'
  seat: BoardSeatDetail | null
  shortlist: ShortlistPerson[] | 'error' | null
  note: string
  message: string
  notice: string
  busy: boolean
  onNote: (value: string) => void
  onApply: () => void
  onOpen: (id: string) => void
  onRetry: () => void
}) {
  const copy = MEMBER_VIEWS.boardSeats
  const [confirmId, setConfirmId] = useState<string | null>(null)
  return (
    <div className="max-w-3xl" data-board-seat-detail="">
      <p className="text-[0.95rem]">
        <Link to="/dashboard/deals/board-seats" className="font-semibold text-ink underline">
          {copy.title}
        </Link>
      </p>
      {status === 'loading' ? (
        <div className="mt-6">
          <CardSkeleton tone="member" label={copy.loading} />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="mt-6">
          <ErrorBanner tone="member" message={message || copy.error} retryLabel={copy.retry} onRetry={onRetry} />
        </div>
      ) : null}
      {status === 'denied' ? (
        <div className="mt-6">
          <PermissionState tone="member" message={copy.denied} />
        </div>
      ) : null}
      {status === 'ready' && seat ? (
        <article className="mt-6 border border-[var(--ba-line)] bg-white px-5 py-5" data-board-seat={seat.id}>
          <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
            {boardSeatKindLabel(seat.seatKind)}
          </p>
          <h1 className="mt-3 font-display text-[2rem] font-bold tracking-[-0.03em]">{seat.title}</h1>
          <p className="mt-2 text-[0.95rem] text-ink/70">
            {seat.organisationName}. {BOARD_SEAT_STATUS_LABEL[seat.status]}.
          </p>
          <p className="mt-3 text-[0.98rem] text-ink/75">{seat.sector}</p>
          <p className="mt-1 text-[0.98rem] text-ink/75">{seat.capacity}</p>
          <p className="mt-4 text-[0.98rem] leading-relaxed text-ink/75">{seat.terms}</p>
          <p className="mt-4 text-[0.98rem] leading-relaxed text-ink/75">{seat.narrative}</p>
          {seat.mine && seat.status === 'pending_review' ? (
            <p className="mt-5 text-[0.95rem] text-ink/60" role="status">
              {copy.waiting}
            </p>
          ) : null}
          {seat.mine ? (
            <Shortlist
              people={shortlist}
              busy={busy}
              notice={notice}
              message={message}
              onAsk={setConfirmId}
            />
          ) : (
            <ApplyBlock
              seat={seat}
              note={note}
              message={message}
              notice={notice}
              busy={busy}
              onNote={onNote}
              onApply={onApply}
            />
          )}
        </article>
      ) : null}
      {confirmId ? (
        <ConfirmDialog
          tone="member"
          title={copy.openTitle}
          body={copy.openBody}
          busy={busy}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => {
            const id = confirmId
            setConfirmId(null)
            onOpen(id)
          }}
        />
      ) : null}
    </div>
  )
}

function ApplyBlock({
  seat,
  note,
  message,
  notice,
  busy,
  onNote,
  onApply,
}: {
  seat: BoardSeatDetail
  note: string
  message: string
  notice: string
  busy: boolean
  onNote: (value: string) => void
  onApply: () => void
}) {
  const copy = MEMBER_VIEWS.boardSeats
  function submit(event: FormEvent) {
    event.preventDefault()
    onApply()
  }
  return (
    <form className="mt-6 border-t border-[var(--ba-line)] pt-5" onSubmit={submit} data-board-seat-apply="">
      <p className="max-w-xl text-[0.98rem] leading-relaxed text-ink/75" data-board-seat-disclosure="">
        {copy.disclosure}
      </p>
      {seat.posterIsPartner ? (
        <div className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink/70" data-board-seat-partner="true">
          <p>{copy.partnerPoster}</p>
          <p className="mt-2">{seat.showCardToPartners ? copy.partnerOn : copy.partnerOff}</p>
          {seat.showCardToPartners ? null : (
            <p className="mt-2">
              <Link to="/dashboard/privacy" className="font-semibold text-ink underline">
                {copy.privacyLink}
              </Link>
            </p>
          )}
        </div>
      ) : null}
      {seat.applicationStatus ? (
        <p className="mt-4 text-[0.95rem] text-ink/60" role="status">
          {copy.applied} {applicationStatusLabel(seat.applicationStatus)}.
        </p>
      ) : seat.status === 'published' ? (
        <>
          <label className={`${labelClass} mt-5`} htmlFor="board-seat-note">
            {copy.noteLabel}
            <span className="mt-1 block text-[0.85rem] font-normal tracking-normal text-ink/50 normal-case">{copy.noteHint}</span>
            <textarea
              id="board-seat-note"
              value={note}
              maxLength={BOARD_SEAT_NOTE_LIMIT}
              rows={3}
              onChange={(event) => onNote(event.target.value)}
              className={fieldClass}
            />
          </label>
          {message ? (
            <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
              {message}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className={`${buttonClass} mt-4`}>
            {copy.putForward}
          </button>
        </>
      ) : null}
      {notice ? <p className="mt-4 text-[0.95rem] text-ink/70">{notice}</p> : null}
    </form>
  )
}

function Shortlist({
  people,
  busy,
  notice,
  message,
  onAsk,
}: {
  people: ShortlistPerson[] | 'error' | null
  busy: boolean
  notice: string
  message: string
  onAsk: (id: string) => void
}) {
  const copy = MEMBER_VIEWS.boardSeats
  return (
    <section className="mt-6 border-t border-[var(--ba-line)] pt-5" aria-label={copy.shortlist} data-board-seat-shortlist="">
      <h2 className="font-display text-[1.25rem] font-semibold">{copy.shortlist}</h2>
      <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-ink/60">{copy.shortlistLead}</p>
      {people === 'error' ? <p className="mt-3 text-[0.95rem] text-[var(--ba-error)]">{copy.error}</p> : null}
      {people && people !== 'error' && people.length === 0 ? (
        <p className="mt-3 text-[0.95rem] text-ink/60">{copy.shortlistEmpty}</p>
      ) : null}
      {people && people !== 'error' && people.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {people.map((person) => (
            <li key={person.id} className="border border-[var(--ba-line)] px-4 py-4" data-shortlist-person={person.id}>
              <p className="text-[1rem] font-semibold">{person.memberName}</p>
              <p className="mt-1 text-[0.95rem] text-ink/70">
                {[person.headline, person.company].filter(Boolean).join('. ')}
                {person.note ? `. ${person.note}` : ''}
              </p>
              {person.status === 'approved' ? (
                <p className="mt-3 text-[0.92rem] text-ink/60">{copy.opened}</p>
              ) : (
                <button type="button" disabled={busy} onClick={() => onAsk(person.id)} className={`${buttonClass} mt-3`}>
                  {copy.openIntro}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
          {message}
        </p>
      ) : null}
      {notice ? <p className="mt-4 text-[0.95rem] text-ink/70">{notice}</p> : null}
    </section>
  )
}

export function MemberBoardSeatForm({
  draft,
  message,
  busy,
  onDraft,
  onSubmit,
}: {
  draft: MemberSeatDraft
  message: string
  busy: boolean
  onDraft: (draft: MemberSeatDraft) => void
  onSubmit: () => void
}) {
  const copy = MEMBER_VIEWS.boardSeats
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }
  return (
    <div className="max-w-xl" data-read-floor="">
      <p>
        <Link to="/dashboard/deals/board-seats" className="inline-flex min-h-11 items-center text-[1.0625rem] font-semibold text-ink underline">
          {copy.title}
        </Link>
      </p>
      <h1 className="mt-4 font-display text-[2.2rem] font-bold tracking-[-0.03em]">{copy.formTitle}</h1>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink/60">{copy.formLead}</p>
      <form data-member-seat-form="" className="mt-8" onSubmit={submit}>
        <div className="space-y-6">
          <label className={formLabelClass} htmlFor="member-seat-kind">
            Seat kind
            <select
              id="member-seat-kind"
              value={draft.seatKind}
              onChange={(event) => onDraft({ ...draft, seatKind: event.target.value as MemberSeatDraft['seatKind'] })}
              className={fieldClass}
            >
              {BOARD_SEAT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {BOARD_SEAT_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </label>
          <Field id="member-seat-title" label="Title" value={draft.title} maxLength={BOARD_SEAT_LIMITS.title} onChange={(title) => onDraft({ ...draft, title })} />
          <Field id="member-seat-org" label="Organisation" value={draft.organisationName} maxLength={BOARD_SEAT_LIMITS.organisation} onChange={(organisationName) => onDraft({ ...draft, organisationName })} />
          <Field id="member-seat-sector" label="Sector" value={draft.sector} maxLength={BOARD_SEAT_LIMITS.sector} onChange={(sector) => onDraft({ ...draft, sector })} />
          <Field id="member-seat-capacity" label="Time commitment" value={draft.capacity} maxLength={BOARD_SEAT_LIMITS.capacity} onChange={(capacity) => onDraft({ ...draft, capacity })} />
          <TagGroup
            legend="Sectors"
            hint="Choose from the profile list."
            name="member-seat-sectors"
            options={SECTOR_TAGS}
            selected={draft.sectorTags}
            max={BOARD_SEAT_LIMITS.sectors}
            onToggle={(sectorTags) => onDraft({ ...draft, sectorTags })}
          />
          <TagGroup
            legend="Regions"
            hint="Choose from the region list."
            name="member-seat-regions"
            options={RE_REGIONS}
            selected={draft.regions}
            max={BOARD_SEAT_LIMITS.regions}
            onToggle={(regions) => onDraft({ ...draft, regions })}
          />
          <Area id="member-seat-terms" label="Seat terms" value={draft.terms} maxLength={BOARD_SEAT_LIMITS.terms} onChange={(terms) => onDraft({ ...draft, terms })} />
          <Area id="member-seat-narrative" label="Narrative" value={draft.narrative} maxLength={BOARD_SEAT_LIMITS.narrative} onChange={(narrative) => onDraft({ ...draft, narrative })} />
        </div>
        {message ? (
          <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={`${formButtonClass} mt-6`}>
          {busy ? copy.saving : copy.save}
        </button>
      </form>
    </div>
  )
}

function Field({
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
    <label className={formLabelClass} htmlFor={id}>
      {label}
      <input id={id} value={value} maxLength={maxLength} autoComplete="off" onChange={(event) => onChange(event.target.value)} className={fieldClass} />
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
    <label className={formLabelClass} htmlFor={id}>
      {label}
      <textarea id={id} value={value} maxLength={maxLength} rows={3} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
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
      <legend className={formLabelClass}>{legend}</legend>
      <p className="mt-2 text-[1rem] leading-relaxed text-ink/70">{hint}</p>
      <div className="mt-3 flex flex-wrap gap-x-2 gap-y-3">
        {options.map((option) => {
          const checked = selected.includes(option)
          const disabled = !checked && selected.length >= max
          return (
            <label
              key={option}
              className="relative inline-flex min-h-11 max-w-full min-w-11 items-center gap-3 border border-ink/15 py-2 pe-3 ps-3 text-[1rem] text-ink has-[:disabled]:opacity-40 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ba-indigo)]"
            >
              <input
                type="checkbox"
                name={name}
                className="absolute inset-0 size-full min-h-11 min-w-11 cursor-pointer opacity-0"
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  const next = checked ? selected.filter((item) => item !== option) : [...selected, option]
                  onToggle(next.slice(0, max))
                }}
              />
              <span
                aria-hidden="true"
                className={`inline-flex size-5 shrink-0 items-center justify-center border ${
                  checked ? 'border-[var(--ba-indigo)] bg-[var(--ba-indigo)]' : 'border-ink/40 bg-white'
                }`}
              >
                {checked ? <span className="size-2.5 bg-white" /> : null}
              </span>
              <span>{option}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

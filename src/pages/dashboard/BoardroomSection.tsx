import { useEffect, useId, useState } from 'react'
import {
  applicationWhereOffer,
  BOARD_EXPERTISE,
  BOARD_ORG_TYPES,
  BOARD_ROLE_TITLES,
  BOARD_SEAT_TYPES,
  BOARD_SEAT_WHERE,
  boardSeatMatchesOn,
  emptyBoardroom,
  MAX_BOARD_EXPERTISE,
  MAX_BOARD_ROLES,
  organisationError,
  toggleAllowed,
  type BoardExpertise,
  type BoardOrgType,
  type BoardRole,
  type BoardRoleTitle,
  type BoardroomRecord,
  type BoardSeatType,
  type BoardSeatWhere,
} from '../../lib/boardroom'

export type BoardroomPreview = BoardroomRecord

const controlClass =
  'inline-flex min-h-12 items-center px-3 text-[0.92rem] md:min-h-11 disabled:opacity-50'
const fieldClass =
  'mt-2 w-full min-h-12 border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] text-ink outline-none focus:border-brass'

type DraftRole = {
  key: string
  organisation: string
  role: string
  orgType: string
  error: string
}

export function BoardroomSection({
  preview,
  enabled = true,
  onMatchChange,
}: {
  preview?: BoardroomPreview
  enabled?: boolean
  onMatchChange?: (on: boolean) => void
}) {
  const offerId = useId()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>(
    preview ? 'ready' : enabled ? 'loading' : 'missing',
  )
  const [record, setRecord] = useState<BoardroomRecord>(preview ?? emptyBoardroom())
  const [draft, setDraft] = useState<DraftRole | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (preview || !enabled) return
    let cancelled = false
    void import('../../lib/boardroomApi').then(({ fetchBoardroom }) =>
      fetchBoardroom().then((result) => {
        if (cancelled) return
        if (!result.ok) {
          setStatus(result.missing ? 'missing' : 'error')
          setError(result.message)
          return
        }
        setRecord(result.record)
        onMatchChange?.(boardSeatMatchesOn(result.record))
        setStatus('ready')
        setError('')
      }),
    )
    return () => {
      cancelled = true
    }
  }, [attempt, enabled, onMatchChange, preview])

  async function persistFocus(next: BoardroomRecord) {
    if (preview) {
      setRecord(next)
      onMatchChange?.(boardSeatMatchesOn(next))
      setNote('Saved')
      setError('')
      return true
    }
    setSaving(true)
    setError('')
    const { saveBoardFocus } = await import('../../lib/boardroomApi')
    const result = await saveBoardFocus(next)
    setSaving(false)
    if (!result.ok) {
      setError(result.message)
      return false
    }
    setRecord(next)
    onMatchChange?.(boardSeatMatchesOn(next))
    setNote('Saved')
    return true
  }

  async function persistRoles(roles: BoardRole[]) {
    if (preview) {
      setRecord((current) => ({ ...current, roles }))
      setNote('Saved')
      setError('')
      return true
    }
    setSaving(true)
    setError('')
    const { saveBoardRoles } = await import('../../lib/boardroomApi')
    const result = await saveBoardRoles(roles)
    setSaving(false)
    if (!result.ok) {
      setError(result.message)
      return false
    }
    setRecord((current) => ({ ...current, roles }))
    setNote('Saved')
    return true
  }

  function onExpertise(value: BoardExpertise) {
    const result = toggleAllowed(record.expertise, value, MAX_BOARD_EXPERTISE)
    if (result.limited) {
      setNote('Five expertise areas is the limit.')
      return
    }
    setNote('')
    void persistFocus({ ...record, expertise: result.next })
  }

  function onOpen(open: boolean) {
    setNote('')
    void persistFocus({
      ...record,
      openToSeats: open,
      seatTypes: open ? record.seatTypes : [],
      seatWhere: open ? record.seatWhere : [],
    })
  }

  function onSeatType(value: BoardSeatType) {
    const result = toggleAllowed(record.seatTypes, value, BOARD_SEAT_TYPES.length)
    void persistFocus({ ...record, seatTypes: result.next })
  }

  function onWhere(value: BoardSeatWhere) {
    const result = toggleAllowed(record.seatWhere, value, BOARD_SEAT_WHERE.length)
    void persistFocus({ ...record, seatWhere: result.next })
  }

  async function onUseApplication() {
    if (!record.applicationRegion) return
    const offer = applicationWhereOffer(record.applicationRegion)
    const next = { ...record, openToSeats: true, seatWhere: [...offer.where] }
    const saved = await persistFocus(next)
    if (!saved) return
    if (preview) {
      setRecord({ ...next, applicationRegion: null })
      return
    }
    const { dismissApplicationField } = await import('../../lib/boardroomApi')
    const dismissed = await dismissApplicationField('region')
    if (!dismissed.ok) {
      setError('Where is saved. The application note could not be cleared.')
      return
    }
    setRecord((current) => ({ ...current, applicationRegion: null }))
  }

  async function onDismissSeats() {
    if (preview) {
      setRecord((current) => ({ ...current, applicationBoardSeats: null }))
      setNote('Saved')
      return
    }
    setSaving(true)
    const { dismissApplicationField } = await import('../../lib/boardroomApi')
    const result = await dismissApplicationField('board_seats')
    setSaving(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setRecord((current) => ({ ...current, applicationBoardSeats: null }))
    setNote('Saved')
  }

  function onSaveDraft() {
    if (!draft) return
    const problem = organisationError(draft.organisation)
    if (problem || !draft.role || !draft.orgType) {
      setDraft({ ...draft, error: problem || 'Choose a role and a type.' })
      return
    }
    const role: BoardRole = {
      organisation: draft.organisation.trim(),
      role: draft.role as BoardRoleTitle,
      orgType: draft.orgType as BoardOrgType,
    }
    void persistRoles([...record.roles, role]).then((ok) => {
      if (ok) setDraft(null)
    })
  }

  const offer = record.applicationRegion ? applicationWhereOffer(record.applicationRegion) : null

  return (
    <section
      id="boardroom"
      aria-labelledby="boardroom-title"
      aria-busy={status === 'loading' || saving}
      className="scroll-mt-24 space-y-5 border-t border-ink/10 pt-10"
      onKeyDown={(event) => {
        const tag = (event.target as HTMLElement).tagName
        if (event.key === 'Enter' && (tag === 'INPUT' || tag === 'SELECT')) event.preventDefault()
      }}
    >
      <div>
        <h2 id="boardroom-title" className="font-display text-[1.6rem] font-semibold tracking-[-0.03em]">
          Boardroom
        </h2>
        <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/60">
          Boards you sit on, whether you are open to new seats, and your expertise. Other members see this on your card.
        </p>
      </div>

      {status === 'loading' ? (
        <div aria-busy="true" aria-label="Loading boardroom" className="space-y-3">
          <div className="h-12 animate-pulse bg-[var(--ba-lavender)] motion-reduce:animate-none" />
          <div className="h-12 animate-pulse bg-[var(--ba-lavender)] motion-reduce:animate-none" />
          <div className="h-12 animate-pulse bg-[var(--ba-lavender)] motion-reduce:animate-none" />
        </div>
      ) : null}

      {status === 'missing' ? (
        <p className="text-[0.95rem] text-ink/60">
          The profile record is missing. Ask our admin team to admit this seat again.
        </p>
      ) : null}

      {status === 'error' ? (
        <div className="space-y-3">
          <p className="text-[0.92rem] text-[var(--ba-error)]" role="alert">
            {error || 'Could not load the boardroom.'}
          </p>
          <button
            type="button"
            className="inline-flex min-h-12 items-center border border-ink/20 px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase md:min-h-11"
            onClick={() => {
              setStatus('loading')
              setError('')
              setAttempt((value) => value + 1)
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {status === 'ready' ? (
        <div className="space-y-6">
          <ChipGroup
            id="boardroom-expertise"
            label="Expertise"
            help="Pick up to 5."
            options={BOARD_EXPERTISE}
            selected={record.expertise}
            disabled={saving}
            onPick={(value) => onExpertise(value as BoardExpertise)}
          />
          <div>
            <p id="boardroom-open-label" className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
              Open to new seats
            </p>
            <p id="boardroom-open-help" className="mt-2 text-[0.95rem] leading-relaxed text-ink/60">
              Yes means you will consider a new seat. Not now keeps seat types and places off your card.
            </p>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="radiogroup"
              aria-labelledby="boardroom-open-label"
              aria-describedby="boardroom-open-help"
            >
              <Choice radio pressed={record.openToSeats} disabled={saving} onClick={() => onOpen(true)}>
                Yes
              </Choice>
              <Choice radio pressed={!record.openToSeats} disabled={saving} onClick={() => onOpen(false)}>
                Not now
              </Choice>
            </div>
          </div>
          {record.openToSeats ? (
            <>
              <ChipGroup
                id="boardroom-seat-types"
                label="Seat types"
                help="The kinds of seat you would consider."
                options={BOARD_SEAT_TYPES}
                selected={record.seatTypes}
                disabled={saving}
                onPick={(value) => onSeatType(value as BoardSeatType)}
              />
              <ChipGroup
                id="boardroom-where"
                label="Where"
                help="Where you would sit."
                options={BOARD_SEAT_WHERE}
                selected={record.seatWhere}
                disabled={saving}
                onPick={(value) => onWhere(value as BoardSeatWhere)}
              />
            </>
          ) : null}
          {offer ? (
            <div className="border border-ink/10 bg-white/60 px-4 py-4" aria-labelledby={offerId}>
              <p id={offerId} className="text-[0.95rem] leading-relaxed text-ink">
                {offer.line}
              </p>
              <button
                type="button"
                className="mt-3 inline-flex min-h-12 items-center bg-[var(--ba-indigo)] px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-[var(--ba-porcelain)] uppercase disabled:opacity-50 md:min-h-11"
                disabled={saving}
                onClick={() => void onUseApplication()}
              >
                Use what you told us
              </button>
            </div>
          ) : null}
          <div>
            <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Board roles</p>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/60">
              Up to 5. Role, type, and organisation show on your card.
            </p>
            {record.roles.length === 0 && !draft ? (
              <p className="mt-3 text-[0.95rem] text-ink/70">No board roles yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {record.roles.map((role) => (
                  <li key={`${role.role}-${role.orgType}-${role.organisation}`} className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[0.95rem] text-ink">
                      {role.role}, {role.orgType}, {role.organisation}
                    </p>
                    <button
                      type="button"
                      className="inline-flex min-h-12 items-center text-[0.95rem] font-semibold text-ink underline disabled:opacity-50 md:min-h-11"
                      disabled={saving}
                      onClick={() =>
                        void persistRoles(
                          record.roles.filter(
                            (item) =>
                              item.organisation !== role.organisation ||
                              item.role !== role.role ||
                              item.orgType !== role.orgType,
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {draft ? (
              <div className="mt-4 space-y-4 border border-ink/10 bg-white/50 px-4 py-4">
                <label className="block" htmlFor={`${draft.key}-org`}>
                  <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Organisation</span>
                  <input
                    id={`${draft.key}-org`}
                    value={draft.organisation}
                    maxLength={120}
                    autoComplete="organization"
                    className={fieldClass}
                    onChange={(event) => setDraft({ ...draft, organisation: event.target.value, error: '' })}
                  />
                </label>
                <label className="block" htmlFor={`${draft.key}-role`}>
                  <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Role</span>
                  <select
                    id={`${draft.key}-role`}
                    value={draft.role}
                    className={fieldClass}
                    onChange={(event) => setDraft({ ...draft, role: event.target.value, error: '' })}
                  >
                    <option value="">Choose a role</option>
                    {BOARD_ROLE_TITLES.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block" htmlFor={`${draft.key}-type`}>
                  <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Type</span>
                  <select
                    id={`${draft.key}-type`}
                    value={draft.orgType}
                    className={fieldClass}
                    onChange={(event) => setDraft({ ...draft, orgType: event.target.value, error: '' })}
                  >
                    <option value="">Choose a type</option>
                    {BOARD_ORG_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.error ? (
                  <p className="text-[0.92rem] text-[var(--ba-error)]" role="alert">
                    {draft.error}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="ba-primary inline-flex min-h-12 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-50 md:min-h-11"
                    disabled={saving}
                    onClick={onSaveDraft}
                  >
                    Save role
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-12 items-center px-4 text-[0.95rem] font-semibold text-ink underline disabled:opacity-50 md:min-h-11"
                    disabled={saving}
                    onClick={() => setDraft(null)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : null}
            {record.roles.length >= MAX_BOARD_ROLES ? (
              <p className="mt-3 text-[0.92rem] text-ink/70" role="status">
                Five board roles is the limit.
              </p>
            ) : draft ? null : (
              <button
                type="button"
                className="mt-3 inline-flex min-h-12 items-center border border-ink/20 px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-50 md:min-h-11"
                disabled={saving}
                onClick={() =>
                  setDraft({
                    key: `role-${record.roles.length + 1}`,
                    organisation: '',
                    role: '',
                    orgType: '',
                    error: '',
                  })
                }
              >
                Add a board role
              </button>
            )}
          </div>
          {record.applicationBoardSeats ? (
            <div className="border border-ink/10 bg-white/60 px-4 py-4">
              <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">From your application</p>
              <p className="mt-2 text-[0.95rem] leading-relaxed whitespace-pre-wrap text-ink">
                You told us: {record.applicationBoardSeats}
              </p>
              <button
                type="button"
                className="mt-3 inline-flex min-h-12 items-center text-[0.95rem] font-semibold text-ink underline disabled:opacity-50 md:min-h-11"
                disabled={saving}
                onClick={() => void onDismissSeats()}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          {note ? (
            <p className="text-[0.92rem] text-ink/70" role="status">
              {note}
            </p>
          ) : null}
          {error ? (
            <p className="text-[0.92rem] text-[var(--ba-error)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function ChipGroup({
  id,
  label,
  help,
  options,
  selected,
  disabled,
  onPick,
}: {
  id: string
  label: string
  help: string
  options: readonly string[]
  selected: readonly string[]
  disabled: boolean
  onPick: (value: string) => void
}) {
  return (
    <div>
      <p id={`${id}-label`} className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
        {label}
      </p>
      <p id={`${id}-help`} className="mt-2 text-[0.95rem] leading-relaxed text-ink/60">
        {help}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`}>
        {options.map((option) => (
          <Choice key={option} pressed={selected.includes(option)} disabled={disabled} onClick={() => onPick(option)}>
            {option}
          </Choice>
        ))}
      </div>
    </div>
  )
}

function Choice({
  pressed,
  onClick,
  disabled,
  radio = false,
  children,
}: {
  pressed: boolean
  onClick: () => void
  disabled?: boolean
  radio?: boolean
  children: string
}) {
  return (
    <button
      type="button"
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? pressed : undefined}
      aria-pressed={radio ? undefined : pressed}
      disabled={disabled}
      onClick={onClick}
      className={`${controlClass} ${
        pressed ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'border border-[var(--ba-line)] bg-white text-ink'
      }`}
    >
      {children}
    </button>
  )
}

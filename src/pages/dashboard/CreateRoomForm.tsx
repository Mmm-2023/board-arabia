import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { DEAL_COPY, type SubjectKind, type SubjectOption } from '../../lib/dealRoomView'

const fieldClass =
  'mt-2 w-full min-h-11 border border-ink/15 bg-white px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'

export function CreateRoomForm({
  name,
  purpose,
  subjectKind,
  mandateId,
  reOpportunityId,
  mandates,
  opportunities,
  mandatesNote,
  opportunitiesNote,
  busy,
  error,
  onRetryLists,
  onName,
  onPurpose,
  onSubjectKind,
  onMandateId,
  onReOpportunityId,
  onSubmit,
}: {
  name: string
  purpose: string
  subjectKind: SubjectKind
  mandateId: string
  reOpportunityId: string
  mandates: SubjectOption[]
  opportunities: SubjectOption[]
  mandatesNote: string | null
  opportunitiesNote: string | null
  busy: boolean
  error: string
  onRetryLists?: () => void
  onName: (value: string) => void
  onPurpose: (value: string) => void
  onSubjectKind: (value: SubjectKind) => void
  onMandateId: (value: string) => void
  onReOpportunityId: (value: string) => void
  onSubmit: () => void
}) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form data-deal-create="" onSubmit={submit} className="max-w-xl" noValidate>
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Rooms</p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em] text-balance">
        Create a room
      </h1>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink/65">{DEAL_COPY.createIntro}</p>

      <label className="mt-8 block">
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
          Room name (required)
        </span>
        <input
          value={name}
          onChange={(event) => onName(event.target.value)}
          maxLength={160}
          required
          autoComplete="off"
          className={fieldClass}
        />
      </label>

      <label className="mt-5 block">
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
          Purpose (required)
        </span>
        <textarea
          value={purpose}
          onChange={(event) => onPurpose(event.target.value)}
          maxLength={400}
          required
          rows={4}
          className={fieldClass}
        />
      </label>

      <fieldset className="mt-6">
        <legend className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
          Link (optional)
        </legend>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/60">
          Link one mandate or one real estate opportunity, or leave this blank.
        </p>
        <div className="mt-3 grid gap-2">
          <Radio
            name="subject"
            checked={subjectKind === 'none'}
            label="No link"
            onChange={() => onSubjectKind('none')}
          />
          <Radio
            name="subject"
            checked={subjectKind === 'mandate'}
            label="A mandate"
            onChange={() => onSubjectKind('mandate')}
          />
          <Radio
            name="subject"
            checked={subjectKind === 're'}
            label="A real estate opportunity"
            onChange={() => onSubjectKind('re')}
          />
        </div>
      </fieldset>

      {subjectKind === 'mandate' ? (
        <label className="mt-4 block">
          <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
            Mandate
          </span>
          {mandates.length === 0 ? (
            <p className="mt-2 text-[0.95rem] text-ink/60">{mandatesNote ?? 'No mandates are available to link.'}</p>
          ) : (
            <select
              value={mandateId}
              onChange={(event) => onMandateId(event.target.value)}
              className={fieldClass}
            >
              <option value="">Choose a mandate</option>
              {mandates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          )}
        </label>
      ) : null}

      {subjectKind === 're' ? (
        <label className="mt-4 block">
          <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
            Real estate opportunity
          </span>
          {opportunities.length === 0 ? (
            <p className="mt-2 text-[0.95rem] text-ink/60">
              {opportunitiesNote ?? 'No opportunities are available to link.'}
            </p>
          ) : (
            <select
              value={reOpportunityId}
              onChange={(event) => onReOpportunityId(event.target.value)}
              className={fieldClass}
            >
              <option value="">Choose an opportunity</option>
              {opportunities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          )}
        </label>
      ) : null}

      {onRetryLists ? (
        <button
          type="button"
          onClick={onRetryLists}
          className="mt-4 inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase"
        >
          Retry lists
        </button>
      ) : null}

      {error ? (
        <p className="mt-5 text-[0.98rem] text-[var(--ba-error)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Create room'}
        </button>
        <Link
          to="/dashboard/rooms"
          className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}

function Radio({
  name,
  checked,
  label,
  onChange,
}: {
  name: string
  checked: boolean
  label: string
  onChange: () => void
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-[1rem] text-ink">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

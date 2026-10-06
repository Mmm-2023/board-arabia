import { Link } from 'react-router-dom'
import { SECTOR_TAGS, VISION_2030_THEMES } from '../../../lib/profileTags'
import {
  AUM_BANDS,
  OPTIONAL_STEP_IDS,
  REQUIRED_STEP_IDS,
  ROLE_OPTIONS,
  STEP_COPY,
  TURNOVER_BANDS,
  gateCopy,
  requiredDoneCount,
  statusCopy,
  stepDone,
  stepError,
  stepSubtitle,
  type ChecklistInput,
  type StepId,
} from '../../../../supabase/functions/_shared/membership_steps.ts'

const card = 'border border-[var(--ba-line)] bg-white'
const primary =
  'ba-primary inline-flex min-h-11 w-full items-center justify-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:cursor-not-allowed disabled:bg-[var(--ba-lavender-mist)] disabled:text-[var(--ba-indigo)]/45'

export type MembershipModel = {
  input: ChecklistInput
  state: string
  submittedAt: string | null
  declinedUntil: string | null
  needsQuestion: string
  needsItems: string[]
  emailVerifiedAt: string | null
}

export function MembershipMeter({ done }: { done: number }) {
  const safe = Math.max(0, Math.min(7, done))
  return (
    <div>
      <div className="flex gap-1.5" role="img" aria-label={`${safe} of 7 required steps done`}>
        {Array.from({ length: 7 }, (_, index) => (
          <span
            key={index}
            className={`h-2 flex-1 ${index < safe ? 'bg-[var(--ba-indigo)]' : 'bg-[var(--ba-lavender-mist)]'}`}
          />
        ))}
      </div>
      <p className="mt-3 text-[0.95rem] text-ink/70">{safe} of 7 required steps done. Saved as you go.</p>
    </div>
  )
}

export function MembershipChecklistView({
  model,
  mode,
  active,
  draft,
  saving,
  error,
  consent,
  submitting,
  onOpen,
  onDraft,
  onSave,
  onConsent,
  onSubmit,
  onReply,
  reply,
  onReplyChange,
}: {
  model: MembershipModel
  mode: 'list' | 'review'
  active: StepId | null
  draft: ChecklistInput
  saving: boolean
  error: string
  consent: boolean
  submitting: boolean
  onOpen: (step: StepId) => void
  onDraft: (next: ChecklistInput) => void
  onSave: (step: StepId) => void
  onConsent: (value: boolean) => void
  onSubmit: () => void
  onReply: () => void
  reply: string
  onReplyChange: (value: string) => void
}) {
  const done = requiredDoneCount(model.input)
  const gate = gateCopy(model.input, model.state, model.declinedUntil)
  const locked = model.state !== 'open' && model.state !== 'declined'
  const status = statusCopy(model.state, model.submittedAt, model.declinedUntil)
  const showMeter = model.state === 'open' || (model.state === 'declined' && gate.enabled)

  if (mode === 'review') {
    return (
      <div className="account-main max-w-xl lg:pe-8" data-screen="membership-review">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Membership</p>
        <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Review and submit</h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-ink/70">You cannot edit after you submit, unless our admin team asks.</p>
        <ul className="mt-6 space-y-3">
          {REQUIRED_STEP_IDS.map((step) => (
            <li key={step} className={`${card} px-4 py-3`}>
              <p className="font-semibold">{STEP_COPY[step].label}</p>
              <p className="mt-1 text-[0.95rem] text-ink/70">{stepSubtitle(model.input, step)}</p>
              <Link to="/dashboard/membership" className="mt-2 inline-flex min-h-11 items-center text-[0.95rem] underline" onClick={() => onOpen(step)}>
                Edit
              </Link>
            </li>
          ))}
        </ul>
        <label className="mt-6 flex min-h-11 items-start gap-3 text-[0.98rem] leading-relaxed">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={consent}
            onChange={(event) => onConsent(event.target.checked)}
          />
          <span>
            I agree that our admin team may review these details to decide on my membership. If I am approved, admitted
            members can see my name, headline, company and city in the Directory.{' '}
            <Link to="/privacy" className="underline">Privacy</Link> and <Link to="/terms" className="underline">Terms</Link>.
          </span>
        </label>
        {error ? (
          <p className="mt-3 text-[0.95rem] text-[var(--ba-copper-deep)]" role="alert">{error}</p>
        ) : null}
        <button type="button" className={`${primary} mt-5`} disabled={!consent || submitting} onClick={onSubmit}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    )
  }

  return (
    <div className="account-main max-w-5xl pb-36 lg:pe-8" data-screen="membership-checklist">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Account · Membership</p>
      <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Your path to full membership</h1>
      {showMeter ? (
        <div className="mt-5">
          <MembershipMeter done={done} />
        </div>
      ) : (
        <p className="mt-5 max-w-xl border-t-2 border-t-[var(--ba-copper)] pt-4 text-[1rem] leading-relaxed text-ink/80" role="status">
          {status}
        </p>
      )}

      {model.state === 'needs_info' ? (
        <section className={`${card} mt-5 px-5 py-5`}>
          <h2 className="font-display text-[1.3rem] font-semibold">Our admin team has one question</h2>
          <p className="mt-3 text-[1rem] leading-relaxed">{model.needsQuestion}</p>
          <label className="mt-4 block">
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Your reply</span>
            <textarea
              value={reply}
              onChange={(event) => onReplyChange(event.target.value)}
              className="mt-2 min-h-28 w-full border border-[var(--ba-line)] px-3 py-2"
            />
          </label>
          {error ? <p className="mt-3 text-[0.95rem] text-[var(--ba-copper-deep)]" role="alert">{error}</p> : null}
          <button type="button" className={`${primary} mt-4`} disabled={submitting} onClick={onReply}>
            {submitting ? 'Sending…' : 'Send reply'}
          </button>
        </section>
      ) : null}

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div>
          <Section
            title="Required"
            steps={REQUIRED_STEP_IDS}
            model={model}
            locked={locked && model.state !== 'needs_info'}
            flagged={model.needsItems}
            onOpen={onOpen}
          />
          <Section
            title="Adds context for our admin team"
            steps={OPTIONAL_STEP_IDS}
            model={model}
            locked={locked && model.state !== 'needs_info'}
            flagged={model.needsItems}
            onOpen={onOpen}
          />
        </div>
        {active ? (
          <Editor
            step={active}
            draft={draft}
            invited={model.input.invited}
            saving={saving}
            error={error}
            onDraft={onDraft}
            onSave={() => onSave(active)}
            onClose={() => onOpen(active)}
          />
        ) : null}
      </div>

      {showMeter ? (
        <div className="fixed inset-x-0 bottom-14 z-30 border-t border-[var(--ba-line)] bg-[var(--ba-porcelain)] px-4 py-3 md:static md:bottom-auto md:z-auto md:mt-6 md:border-0 md:bg-transparent md:px-0">
          <p className="text-[0.95rem] text-ink/70">
            {gate.helper}{' '}
            {gate.links.map((item, index) => (
              <span key={item.id}>
                {index > 0 ? ', ' : ''}
                <button type="button" className="underline" onClick={() => onOpen(item.id)}>
                  {item.label}
                </button>
              </span>
            ))}
            {gate.links.length > 0 ? '.' : ''}
          </p>
          {gate.enabled ? (
            <Link to="/dashboard/membership/review" className={`${primary} mt-3`}>
              {gate.label}
            </Link>
          ) : (
            <button type="button" className={`${primary} mt-3`} disabled>
              {gate.label}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Section({
  title,
  steps,
  model,
  locked,
  flagged,
  onOpen,
}: {
  title: string
  steps: readonly StepId[]
  model: MembershipModel
  locked: boolean
  flagged: string[]
  onOpen: (step: StepId) => void
}) {
  return (
    <section className={`${card} mt-4 px-4 py-2`}>
      <h2 className="px-1 pt-3 text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">{title}</h2>
      <ul>
        {steps.map((step) => {
          const done = stepDone(model.input, step)
          const openable = !locked || flagged.includes(step)
          return (
            <li key={step} className="border-t border-[var(--ba-line)] first:border-t-0">
              <button
                type="button"
                className="flex min-h-16 w-full items-start gap-3 px-1 py-3 text-left"
                onClick={() => openable && onOpen(step)}
                disabled={!openable}
              >
                <Mark done={done} />
                <span>
                  <span className="block font-semibold">{STEP_COPY[step].label}</span>
                  <span className="mt-1 block text-[0.95rem] leading-relaxed text-ink/65">{stepSubtitle(model.input, step)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Mark({ done }: { done: boolean }) {
  if (done) {
    return (
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]" aria-hidden="true">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3.5 8.2 6.4 11 12.5 5" />
        </svg>
      </span>
    )
  }
  return <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 rounded-full border-2 border-[var(--ba-indigo)]" aria-hidden="true" />
}

function Editor({
  step,
  draft,
  invited,
  saving,
  error,
  onDraft,
  onSave,
  onClose,
}: {
  step: StepId
  draft: ChecklistInput
  invited: boolean
  saving: boolean
  error: string
  onDraft: (next: ChecklistInput) => void
  onSave: () => void
  onClose: () => void
}) {
  const field = 'mt-2 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem]'
  const label = 'block text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase'
  return (
    <form
      className="fixed inset-x-0 bottom-14 z-40 max-h-[70dvh] overflow-y-auto border border-[var(--ba-line)] bg-white px-4 py-4 lg:static lg:bottom-auto lg:z-auto lg:max-h-none"
      data-screen="membership-editor"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-[1.35rem] font-semibold">{STEP_COPY[step].label}</h2>
        <button type="button" className="min-h-11 px-2 underline" onClick={onClose}>
          Cancel
        </button>
      </div>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/70">{STEP_COPY[step].why}</p>
      <div className="mt-4 space-y-4">
        {step === 'email' ? <p>Done at sign-up. This sign-in stays yours.</p> : null}
        {step === 'role' ? (
          <>
            <label className="block">
              <span className={label}>Role</span>
              <select className={field} value={draft.role} onChange={(event) => onDraft({ ...draft, role: event.target.value })}>
                {ROLE_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Board seats held</span>
              <textarea
                className={`${field} min-h-28 py-2`}
                maxLength={1000}
                value={draft.boardSeats}
                onChange={(event) => onDraft({ ...draft, boardSeats: event.target.value })}
              />
            </label>
          </>
        ) : null}
        {step === 'company_title' ? (
          <>
            <label className="block">
              <span className={label}>Company</span>
              <input className={field} value={draft.companyName} onChange={(event) => onDraft({ ...draft, companyName: event.target.value })} />
            </label>
            <label className="block">
              <span className={label}>Title</span>
              <input className={field} value={draft.jobTitle} onChange={(event) => onDraft({ ...draft, jobTitle: event.target.value })} />
            </label>
            <label className="block">
              <span className={label}>Company website</span>
              <input className={field} value={draft.companyWebsite} placeholder="https://" onChange={(event) => onDraft({ ...draft, companyWebsite: event.target.value })} />
            </label>
          </>
        ) : null}
        {step === 'linkedin' ? (
          <label className="block">
            <span className={label}>LinkedIn URL</span>
            <input className={field} value={draft.linkedinUrl} placeholder="https://www.linkedin.com/in/" onChange={(event) => onDraft({ ...draft, linkedinUrl: event.target.value })} />
          </label>
        ) : null}
        {step === 'scale_band' ? (
          <>
            <fieldset>
              <legend className={label}>Which figure</legend>
              <label className="mt-2 flex min-h-11 items-center gap-2">
                <input type="radio" name="scale-kind" checked={draft.scaleKind === 'turnover'} onChange={() => onDraft({ ...draft, scaleKind: 'turnover', scaleBand: '' })} />
                Group turnover
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="scale-kind" checked={draft.scaleKind === 'aum'} onChange={() => onDraft({ ...draft, scaleKind: 'aum', scaleBand: '' })} />
                Family office AUM
              </label>
            </fieldset>
            <label className="block">
              <span className={label}>Band</span>
              <select className={field} value={draft.scaleBand} onChange={(event) => onDraft({ ...draft, scaleBand: event.target.value })}>
                <option value="">Choose a band</option>
                {(draft.scaleKind === 'aum' ? AUM_BANDS : TURNOVER_BANDS).map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {step === 'sectors' ? (
          <>
            <TagGroup title="Sectors" options={SECTOR_TAGS} selected={draft.sectorTags} onToggle={(tag) => onDraft(toggleCombined(draft, 'sectorTags', tag))} />
            <TagGroup title="Vision 2030" options={VISION_2030_THEMES} selected={draft.visionTags} onToggle={(tag) => onDraft(toggleCombined(draft, 'visionTags', tag))} />
          </>
        ) : null}
        {step === 'statement' ? (
          <label className="block">
            <span className={label}>Statement</span>
            <textarea className={`${field} min-h-40 py-2`} maxLength={600} value={draft.statement} onChange={(event) => onDraft({ ...draft, statement: event.target.value })} />
            <span className="mt-1 block text-[0.85rem] text-ink/50">{draft.statement.trim().length} / 600</span>
          </label>
        ) : null}
        {step === 'cr_number' ? (
          <>
            <p className="text-[0.95rem] text-ink/70">Number only. Nothing is uploaded.</p>
            <label className="block">
              <span className={label}>Registration number</span>
              <input className={field} inputMode="numeric" value={draft.crNumber} onChange={(event) => onDraft({ ...draft, crNumber: event.target.value })} />
            </label>
            <label className="block">
              <span className={label}>Country, if not Saudi Arabia</span>
              <input className={field} value={draft.crCountry} onChange={(event) => onDraft({ ...draft, crCountry: event.target.value })} />
            </label>
          </>
        ) : null}
        {step === 'referral' ? (
          <label className="block">
            <span className={label}>Member name</span>
            <input className={field} value={invited ? 'Invited by a member' : draft.referralName} readOnly={invited} onChange={(event) => onDraft({ ...draft, referralName: event.target.value })} />
          </label>
        ) : null}
        {step === 'capacity' ? (
          <>
            <label className="block">
              <span className={label}>Investable capacity, USD</span>
              <input className={field} inputMode="decimal" value={draft.investable} onChange={(event) => onDraft({ ...draft, investable: event.target.value })} />
            </label>
          </>
        ) : null}
        {step === 'phone' ? (
          <label className="block">
            <span className={label}>Phone</span>
            <input className={field} inputMode="tel" value={draft.phone} onChange={(event) => onDraft({ ...draft, phone: event.target.value })} />
          </label>
        ) : null}
      </div>
      {error || stepError(draft, step) ? (
        <p className="mt-3 text-[0.95rem] text-[var(--ba-copper-deep)]" role="alert">{error || stepError(draft, step)}</p>
      ) : null}
      {step !== 'email' ? (
        <button type="submit" className={`${primary} mt-4`} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      ) : null}
    </form>
  )
}

function TagGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: readonly string[]
  selected: string[]
  onToggle: (tag: string) => void
}) {
  return (
    <fieldset>
      <legend className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">{title}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((tag) => {
          const on = selected.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              className={`inline-flex min-h-11 items-center border px-3 text-[0.92rem] ${on ? 'border-[var(--ba-indigo)] bg-[var(--ba-lavender-mist)]' : 'border-[var(--ba-line)]'}`}
              onClick={() => onToggle(tag)}
            >
              {tag}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function toggleCombined(draft: ChecklistInput, key: 'sectorTags' | 'visionTags', tag: string): ChecklistInput {
  const current = draft[key]
  if (current.includes(tag)) return { ...draft, [key]: current.filter((item) => item !== tag) }
  if (draft.sectorTags.length + draft.visionTags.length >= 5) return draft
  return { ...draft, [key]: [...current, tag] }
}

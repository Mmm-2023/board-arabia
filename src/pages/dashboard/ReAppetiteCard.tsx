import { useState } from 'react'
import {
  reAppetiteDraft,
  reAppetiteFieldErrors,
  reAppetiteFromDraft,
  reAppetitePlaceLabels,
  type ReAppetite,
  type ReAppetiteDraft,
} from '../../lib/reAppetite'
import {
  RE_ASSET_CLASSES,
  RE_CAPITAL_ROLES,
  RE_TICKET_BANDS,
  reAssetClassLabel,
  reCapitalRoleLabel,
} from '../../lib/reRedaction'
import { RE_GIGA_PROJECTS, RE_REGIONS } from '../../lib/reRegions'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { ErrorBanner, toneClasses } from '../../shell/ViewState'

export type ReAppetiteCardStatus = 'loading' | 'error' | 'denied' | 'unavailable' | 'ready'

const copy = MEMBER_VIEWS.realEstate.appetite

export function ReAppetiteCard({
  status,
  appetite,
  onRetry,
  onSave,
}: {
  status: ReAppetiteCardStatus
  appetite: ReAppetite | null
  onRetry: () => void
  onSave: (appetite: ReAppetite) => Promise<'ok' | 'error'>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ReAppetiteDraft | null>(null)
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof reAppetiteFieldErrors>>(null)
  const [saveError, setSaveError] = useState(false)
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setSaveError(false)
    setFieldErrors(null)
    setDraft(reAppetiteDraft(appetite))
    setEditing(true)
  }

  async function submit() {
    if (!draft || saving) return
    const errors = reAppetiteFieldErrors(draft, copy)
    if (errors) {
      setFieldErrors(errors)
      setSaveError(false)
      return
    }
    const next = reAppetiteFromDraft(draft)
    if (!next) return
    setSaving(true)
    setSaveError(false)
    const result = await onSave(next)
    setSaving(false)
    if (result !== 'ok') {
      setSaveError(true)
      return
    }
    setEditing(false)
    setDraft(null)
    setFieldErrors(null)
  }

  if (status === 'loading') {
    return (
      <div aria-busy="true" aria-label={copy.loading} data-re-appetite="loading" className="border border-[var(--ba-line)] bg-white px-5 py-5">
        <div className="h-6 w-40 bg-[var(--ba-lavender)] motion-reduce:animate-none animate-pulse" />
        <div className="mt-3 h-4 max-w-md bg-[var(--ba-lavender)] motion-reduce:animate-none animate-pulse" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div data-re-appetite="error">
        <ErrorBanner tone="member" message={copy.loadError} retryLabel={copy.retry} onRetry={onRetry} />
      </div>
    )
  }

  if (status === 'denied' || status === 'unavailable') {
    return (
      <section aria-label={copy.title} data-re-appetite={status} className="border border-[var(--ba-line)] bg-white px-5 py-5">
        <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em]">{copy.title}</h2>
        <p className="mt-2 max-w-xl text-[1rem] leading-relaxed text-ink/70">
          {status === 'denied' ? copy.denied : copy.unavailable}
        </p>
      </section>
    )
  }

  if (editing && draft) {
    return (
      <form
        aria-label={copy.title}
        data-re-appetite="editing"
        className="border border-[var(--ba-line)] bg-white px-5 py-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em]">{copy.title}</h2>
        <p className="mt-2 max-w-xl text-[0.98rem] leading-relaxed text-ink/60">{copy.formNote}</p>
        <ChipGroup
          label={copy.ticket}
          error={fieldErrors?.ticket}
          options={RE_TICKET_BANDS}
          pressed={(option) => draft.ticket_band === option}
          onPick={(option) => {
            setDraft({ ...draft, ticket_band: draft.ticket_band === option ? null : option })
            setFieldErrors(null)
          }}
        />
        <ChipGroup
          label={copy.regions}
          error={fieldErrors?.places}
          options={RE_REGIONS}
          pressed={(option) => draft.cities.includes(option)}
          onPick={(option) => {
            setDraft({ ...draft, cities: toggle(draft.cities, option) })
            setFieldErrors(null)
          }}
        />
        <ChipGroup
          label={copy.corridors}
          options={RE_GIGA_PROJECTS}
          pressed={(option) => draft.cities.includes(option)}
          onPick={(option) => {
            setDraft({ ...draft, cities: toggle(draft.cities, option) })
            setFieldErrors(null)
          }}
        />
        <ChipGroup
          label={copy.assets}
          error={fieldErrors?.assets}
          options={RE_ASSET_CLASSES}
          labelFor={reAssetClassLabel}
          pressed={(option) => draft.asset_classes.includes(option)}
          onPick={(option) => {
            setDraft({ ...draft, asset_classes: toggle(draft.asset_classes, option) })
            setFieldErrors(null)
          }}
        />
        <ChipGroup
          label={copy.role}
          hint={copy.roleHint}
          error={fieldErrors?.role}
          options={RE_CAPITAL_ROLES}
          labelFor={reCapitalRoleLabel}
          pressed={(option) => draft.capital_roles.includes(option)}
          onPick={(option) => {
            setDraft({ ...draft, capital_roles: toggle(draft.capital_roles, option) })
            setFieldErrors(null)
          }}
        />
        {saveError ? (
          <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
            {copy.error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving || undefined}
            className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
          >
            {saving ? copy.saving : copy.save}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEditing(false)
              setDraft(null)
              setFieldErrors(null)
              setSaveError(false)
            }}
            className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-40"
          >
            {copy.cancel}
          </button>
        </div>
      </form>
    )
  }

  if (!appetite) {
    return (
      <section aria-label={copy.title} data-re-appetite="empty" className="border border-[var(--ba-line)] bg-white px-5 py-5">
        <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em]">{copy.title}</h2>
        <p className="mt-2 max-w-xl text-[1rem] leading-relaxed text-ink/70">{copy.empty}</p>
        <button
          type="button"
          onClick={startEdit}
          className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
        >
          {copy.set}
        </button>
      </section>
    )
  }

  return (
    <section aria-label={copy.title} data-re-appetite="filled" className="border border-[var(--ba-line)] bg-white px-5 py-5">
      <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em]">{copy.title}</h2>
      <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/60">{copy.lead}</p>
      <dl className="mt-4 space-y-3">
        <Fact label={copy.ticket} value={appetite.ticket_band} />
        <Fact label={copy.places} value={reAppetitePlaceLabels(appetite.cities).join(', ')} />
        <Fact label={copy.assets} value={appetite.asset_classes.map((value) => reAssetClassLabel(value)).join(', ')} />
        <Fact label={copy.role} value={appetite.capital_roles.map((value) => reCapitalRoleLabel(value)).join(', ')} />
      </dl>
      <button
        type="button"
        onClick={startEdit}
        className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
      >
        {copy.edit}
      </button>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">{label}</dt>
      <dd className="mt-0.5 text-[0.98rem] text-ink/85">{value}</dd>
    </div>
  )
}

function toggle<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function ChipGroup<T extends string>({
  label,
  hint,
  error,
  options,
  labelFor = (option: T) => option,
  pressed,
  onPick,
}: {
  label: string
  hint?: string
  error?: string
  options: readonly T[]
  labelFor?: (option: T) => string
  pressed: (option: T) => boolean
  onPick: (option: T) => void
}) {
  const styles = toneClasses('member')
  return (
    <fieldset className="mt-4 border-0 p-0">
      <legend className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/45 uppercase">{label}</legend>
      {hint ? <p className="mt-1 text-[0.92rem] text-ink/55">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((option) => {
          const on = pressed(option)
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(option)}
              className={`inline-flex min-h-11 items-center px-3 text-[0.92rem] ${
                on ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'border border-[var(--ba-line)] bg-white text-ink'
              }`}
            >
              {labelFor(option)}
            </button>
          )
        })}
      </div>
      {error ? (
        <p role="alert" className={`mt-2 text-[0.92rem] ${styles.alert}`}>
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}

import type { CapacityDraft } from '../lib/capacity'

const inputClass =
  'mt-1 w-full border border-pearl/20 bg-ink px-3 py-2 text-[0.9rem] text-pearl normal-case outline-none focus:border-brass'

export function CapacityFields({
  idPrefix,
  draft,
  onChange,
  note,
}: {
  idPrefix: string
  draft: CapacityDraft
  onChange: (next: CapacityDraft) => void
  note?: string
}) {
  function set<K extends keyof CapacityDraft>(key: K, value: CapacityDraft[K]) {
    onChange({ ...draft, [key]: value })
  }

  return (
    <fieldset className="mt-4 grid gap-3 border border-pearl/10 px-4 py-4 md:grid-cols-2">
      <legend className="px-1 text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
        Capacity in USD
      </legend>
      <Amount
        id={`${idPrefix}-investable`}
        label="Investable capacity"
        value={draft.investable}
        onChange={(value) => set('investable', value)}
      />
      <Amount
        id={`${idPrefix}-fo`}
        label="Family office AUM"
        value={draft.foAum}
        onChange={(value) => set('foAum', value)}
      />
      <Amount
        id={`${idPrefix}-turnover`}
        label="Business turnover"
        value={draft.turnover}
        onChange={(value) => set('turnover', value)}
      />
      <div className="flex flex-col justify-end gap-2 pb-1 text-[0.85rem] text-stone/75 normal-case">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={draft.include}
            onChange={(event) => set('include', event.target.checked)}
            className="mt-1"
          />
          <span>Include in public platform totals</span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={draft.verified}
            onChange={(event) => set('verified', event.target.checked)}
            className="mt-1"
          />
          <span>Verified. Required before this member counts.</span>
        </label>
      </div>
      {note && <p className="text-[0.82rem] leading-relaxed text-pearl/45 md:col-span-2">{note}</p>}
    </fieldset>
  )
}

function Amount({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/45 uppercase">
      {label}
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="USD"
        className={inputClass}
      />
    </label>
  )
}

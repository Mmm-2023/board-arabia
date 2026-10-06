import type { FormEvent } from 'react'
import { SECTOR_TAGS, VISION_2030_THEMES } from '../../lib/profileTags'
import {
  NEW_MANDATE_LIMITS,
  type NewMandateDraft,
  type NewMandateField,
} from '../../lib/newMandate'

const inputClass =
  'mt-2 block min-h-11 w-full border border-pearl/20 bg-transparent px-3 text-[0.95rem] text-pearl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ba-lavender-mist)]'

const labelClass = 'block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase'

function toggleTag(current: readonly string[], value: string) {
  if (current.includes(value)) return current.filter((item) => item !== value)
  if (current.length >= 3) return [...current]
  return [...current, value]
}

export function NewMandateForm({
  draft,
  field,
  message,
  notice,
  busy,
  onDraft,
  onSubmit,
}: {
  draft: NewMandateDraft
  field: NewMandateField | ''
  message: string
  notice: string
  busy: boolean
  onDraft: (draft: NewMandateDraft) => void
  onSubmit: () => void
}) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form data-new-mandate="form" className="mt-8 max-w-xl" onSubmit={submit}>
      <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.02em]">New mandate</h2>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-pearl/70">
        Admin adds a mandate here. It is not marked Example. Members see the public fields only after it is published.
      </p>
      <div className="mt-5 space-y-4">
        <TextField
          id="mandate-sector"
          label="Sector"
          value={draft.sector}
          maxLength={NEW_MANDATE_LIMITS.sector}
          invalid={field === 'sector'}
          onChange={(sector) => onDraft({ ...draft, sector })}
        />
        <TextField
          id="mandate-deal-type"
          label="Deal type"
          value={draft.dealType}
          maxLength={NEW_MANDATE_LIMITS.dealType}
          invalid={field === 'dealType'}
          onChange={(dealType) => onDraft({ ...draft, dealType })}
        />
        <TextField
          id="mandate-ticket"
          label="Ticket band"
          value={draft.ticketBand}
          maxLength={NEW_MANDATE_LIMITS.ticketBand}
          invalid={field === 'ticketBand'}
          onChange={(ticketBand) => onDraft({ ...draft, ticketBand })}
        />
        <TextField
          id="mandate-geography"
          label="Geography"
          value={draft.geography}
          maxLength={NEW_MANDATE_LIMITS.geography}
          invalid={field === 'geography'}
          onChange={(geography) => onDraft({ ...draft, geography })}
        />
        <TextField
          id="mandate-stage"
          label="Stage"
          value={draft.stage}
          maxLength={NEW_MANDATE_LIMITS.stage}
          invalid={field === 'stage'}
          onChange={(stage) => onDraft({ ...draft, stage })}
        />
        <TextArea
          id="mandate-one-liner"
          label="One liner"
          hint="Public. Do not include the company name or @."
          value={draft.oneLiner}
          maxLength={NEW_MANDATE_LIMITS.oneLiner}
          invalid={field === 'oneLiner'}
          onChange={(oneLiner) => onDraft({ ...draft, oneLiner })}
        />
        <TextField
          id="mandate-company"
          label="Company name"
          value={draft.companyName}
          maxLength={NEW_MANDATE_LIMITS.companyName}
          invalid={field === 'companyName'}
          onChange={(companyName) => onDraft({ ...draft, companyName })}
        />
        <TextField
          id="mandate-amount"
          label="Exact amount"
          value={draft.exactAmount}
          maxLength={NEW_MANDATE_LIMITS.exactAmount}
          invalid={field === 'exactAmount'}
          onChange={(exactAmount) => onDraft({ ...draft, exactAmount })}
        />
        <TextArea
          id="mandate-terms"
          label="Terms"
          value={draft.terms}
          maxLength={NEW_MANDATE_LIMITS.terms}
          invalid={field === 'terms'}
          onChange={(terms) => onDraft({ ...draft, terms })}
        />
        <TextField
          id="mandate-contact-name"
          label="Contact name"
          value={draft.contactName}
          maxLength={NEW_MANDATE_LIMITS.contactName}
          invalid={field === 'contactName'}
          autoComplete="off"
          onChange={(contactName) => onDraft({ ...draft, contactName })}
        />
        <TextField
          id="mandate-contact-email"
          label="Contact email"
          value={draft.contactEmail}
          maxLength={NEW_MANDATE_LIMITS.contactEmail}
          invalid={field === 'contactEmail'}
          type="email"
          autoComplete="off"
          placeholder="name@example.com"
          onChange={(contactEmail) => onDraft({ ...draft, contactEmail })}
        />
        <TextField
          id="mandate-contact-phone"
          label="Contact phone"
          value={draft.contactPhone}
          maxLength={NEW_MANDATE_LIMITS.contactPhone}
          invalid={field === 'contactPhone'}
          autoComplete="off"
          onChange={(contactPhone) => onDraft({ ...draft, contactPhone })}
        />
        <TextField
          id="mandate-deck"
          label="Deck link"
          hint="Optional. An https link."
          value={draft.deckUrl}
          maxLength={NEW_MANDATE_LIMITS.deckUrl}
          invalid={field === 'deckUrl'}
          type="url"
          autoComplete="off"
          placeholder="https://example.com/brief"
          onChange={(deckUrl) => onDraft({ ...draft, deckUrl })}
        />
        <TextArea
          id="mandate-narrative"
          label="Narrative"
          value={draft.narrative}
          maxLength={NEW_MANDATE_LIMITS.narrative}
          invalid={field === 'narrative'}
          onChange={(narrative) => onDraft({ ...draft, narrative })}
        />
        <TagGroup
          legend="Sector tags"
          hint="3 at most."
          name="sector-tags"
          options={SECTOR_TAGS}
          selected={draft.sectorTags}
          invalid={field === 'sectorTags'}
          onToggle={(value) => onDraft({ ...draft, sectorTags: toggleTag(draft.sectorTags, value) })}
        />
        <TagGroup
          legend="Vision 2030 themes"
          hint="3 at most."
          name="vision-themes"
          options={VISION_2030_THEMES}
          selected={draft.visionThemes}
          invalid={field === 'visionThemes'}
          onToggle={(value) => onDraft({ ...draft, visionThemes: toggleTag(draft.visionThemes, value) })}
        />
        <label className="flex min-h-11 items-center gap-3 text-[0.95rem] text-pearl">
          <input
            type="checkbox"
            className="size-4"
            checked={draft.published}
            onChange={(event) => onDraft({ ...draft, published: event.target.checked })}
          />
          Published. Members can see the public fields.
        </label>
      </div>
      {message ? (
        <p id="mandate-form-error" className="mt-4 text-[0.95rem] text-red-300" role="alert" data-new-mandate-error="">
          {message}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 text-[0.95rem] text-brass-bright" data-new-mandate-notice="">
          {notice}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-60"
      >
        {busy ? 'Saving...' : 'Save mandate'}
      </button>
    </form>
  )
}

function TextField({
  id,
  label,
  hint,
  value,
  maxLength,
  invalid,
  type = 'text',
  autoComplete,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: string
  maxLength: number
  invalid: boolean
  type?: 'text' | 'email' | 'url'
  autoComplete?: string
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
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'mandate-form-error' : undefined}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  )
}

function TextArea({
  id,
  label,
  hint,
  value,
  maxLength,
  invalid,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: string
  maxLength: number
  invalid: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className={labelClass} htmlFor={id}>
      {label}
      {hint ? <span className="mt-1 block text-[0.8rem] font-normal tracking-normal text-pearl/50 normal-case">{hint}</span> : null}
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        rows={3}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'mandate-form-error' : undefined}
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
  invalid,
  onToggle,
}: {
  legend: string
  hint: string
  name: string
  options: readonly string[]
  selected: readonly string[]
  invalid: boolean
  onToggle: (value: string) => void
}) {
  return (
    <fieldset aria-invalid={invalid || undefined}>
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
                onChange={() => onToggle(option)}
              />
              {option}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

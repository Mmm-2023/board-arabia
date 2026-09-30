import type { ReactNode } from 'react'
import { digitsOnly, type PricingDraft } from '../../../supabase/functions/ai-tool-job/tools/pricing_format.ts'
import type { UiLang } from '../../lib/aiToolUi'

const fieldClass = 'mt-2 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem] text-ink'

const COPY = {
  en: {
    legend: 'Pricing inputs',
    hint: 'The check compares the asking figure with the public notes you supply. It does not say whether a figure is suitable.',
    company: 'Company',
    sector: 'Sector',
    stage: 'Stage',
    region: 'Region',
    asking: 'Asking figure (SAR)',
    revenue: 'Revenue, last twelve months (SAR)',
    notes: 'Public notes',
    notesHint: 'One note per line: title | https://... | date | price SAR low to high | multiple low to high',
    optional: 'optional',
    required: 'required',
  },
  ar: {
    legend: 'مدخلات السعر',
    hint: 'يقارن الفحص الرقم المطلوب بالملاحظات العامة التي ترفقها. ولا يقول ما إذا كان الرقم مناسباً.',
    company: 'الشركة',
    sector: 'القطاع',
    stage: 'المرحلة',
    region: 'المنطقة',
    asking: 'الرقم المطلوب (ريال)',
    revenue: 'الإيراد لآخر اثني عشر شهراً (ريال)',
    notes: 'ملاحظات عامة',
    notesHint: 'ملاحظة في كل سطر: العنوان | https://... | التاريخ | السعر من إلى | المضاعف من إلى',
    optional: 'اختياري',
    required: 'مطلوب',
  },
} as const

export function PricingInputs({
  draft,
  lang,
  disabled,
  onChange,
}: {
  draft: PricingDraft
  lang: UiLang
  disabled?: boolean
  onChange: (next: PricingDraft) => void
}) {
  const copy = COPY[lang]
  function set(key: keyof PricingDraft, value: string) {
    onChange({ ...draft, [key]: value })
  }
  return (
    <fieldset className="mt-6 border border-[var(--ba-line)] bg-white px-4 py-4" disabled={disabled}>
      <legend className="px-1 text-[1rem] font-semibold">{copy.legend}</legend>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/70">{copy.hint}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label={copy.company} optional={copy.optional} htmlFor="pricing-company">
          <input id="pricing-company" value={draft.company} className={fieldClass} onChange={(event) => set('company', event.target.value)} />
        </Field>
        <Field label={copy.sector} optional={copy.optional} htmlFor="pricing-sector">
          <input id="pricing-sector" value={draft.sector} className={fieldClass} onChange={(event) => set('sector', event.target.value)} />
        </Field>
        <Field label={copy.stage} optional={copy.optional} htmlFor="pricing-stage">
          <input id="pricing-stage" value={draft.stage} className={fieldClass} onChange={(event) => set('stage', event.target.value)} />
        </Field>
        <Field label={copy.region} optional={copy.optional} htmlFor="pricing-region">
          <input id="pricing-region" value={draft.region} className={fieldClass} onChange={(event) => set('region', event.target.value)} />
        </Field>
        <Field label={copy.asking} required={copy.required} htmlFor="pricing-asking">
          <input
            id="pricing-asking"
            inputMode="numeric"
            dir="ltr"
            value={draft.asking}
            className={fieldClass}
            onChange={(event) => set('asking', digitsOnly(event.target.value))}
          />
        </Field>
        <Field label={copy.revenue} optional={copy.optional} htmlFor="pricing-revenue">
          <input
            id="pricing-revenue"
            inputMode="numeric"
            dir="ltr"
            value={draft.revenue}
            className={fieldClass}
            onChange={(event) => set('revenue', digitsOnly(event.target.value))}
          />
        </Field>
      </div>
      <Field label={copy.notes} optional={copy.optional} htmlFor="pricing-notes">
        <textarea
          id="pricing-notes"
          dir="ltr"
          value={draft.notes}
          rows={4}
          className={`${fieldClass} min-h-28 py-2`}
          onChange={(event) => set('notes', event.target.value)}
        />
      </Field>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-ink/65">{copy.notesHint}</p>
    </fieldset>
  )
}

function Field({
  label,
  htmlFor,
  optional,
  required,
  children,
}: {
  label: string
  htmlFor: string
  optional?: string
  required?: string
  children: ReactNode
}) {
  return (
    <label className="mt-4 block text-[0.95rem] text-ink" htmlFor={htmlFor}>
      {label}
      {required ? <span className="text-ink/55"> ({required})</span> : null}
      {optional ? <span className="text-ink/55"> ({optional})</span> : null}
      {children}
    </label>
  )
}

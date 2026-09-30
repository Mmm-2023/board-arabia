import { MARKET_SECTORS, type MarketSector } from '../../../supabase/functions/ai-tool-job/tools/market_brief.ts'
import { AiToolBanner, AiToolConsent, AiToolWillList } from './AiToolDesk'
import { type UiLang } from '../../lib/aiToolUi'
import type { RenderedToolCopy } from '../../lib/aiToolCopy'

export const MARKET_UI: Record<
  UiLang,
  {
    sector: string
    sectorHint: string
    kept: string
    unavailableTitle: string
    unavailable: string
    run: string
    running: string
  }
> = {
  en: {
    sector: 'Sector',
    sectorHint: 'Choose one sector. The brief is general, and every source is linked and dated.',
    kept: 'Your sector choice is saved with the brief and removed with it.',
    unavailableTitle: 'Not available',
    unavailable: 'This brief is not available right now. Nothing was generated.',
    run: 'Prepare the brief',
    running: 'Preparing',
  },
  ar: {
    sector: 'القطاع',
    sectorHint: 'اختر قطاعاً واحداً. الموجز عام، وكل مصدر له رابط وتاريخ.',
    kept: 'يُحفظ اختيار القطاع مع الموجز ويُحذف معه.',
    unavailableTitle: 'غير متاح',
    unavailable: 'هذا الموجز غير متاح الآن. لم يُنشأ شيء.',
    run: 'إعداد الموجز',
    running: 'جارٍ الإعداد',
  },
}

export function MarketUnavailable({ lang }: { lang: UiLang }) {
  const copy = MARKET_UI[lang]
  return (
    <div data-market-unavailable="" className="border border-[var(--ba-line)] bg-white px-4 py-5">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">AI</p>
      <h2 className="mt-2 font-display text-[1.6rem] font-semibold">{copy.unavailableTitle}</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink/70">{copy.unavailable}</p>
    </div>
  )
}

/** Staff-only. The phrase is the operational state, not member copy. */
export function MarketSearchNotice({ tone }: { tone: 'staff' | 'member' }) {
  const className =
    tone === 'staff'
      ? 'mt-4 border border-[var(--ba-copper)] px-4 py-3 text-[1rem] font-semibold text-pearl'
      : 'mt-4 border border-[var(--ba-copper)] bg-white px-4 py-3 text-[1rem] font-semibold text-ink'
  return (
    <p role="status" data-market-search="not_configured" className={className}>
      search not configured
    </p>
  )
}

export function MarketBriefForm({
  copy,
  lang,
  sector,
  consented,
  busy,
  onSector,
  onConsent,
  onRun,
}: {
  copy: RenderedToolCopy
  lang: UiLang
  sector: MarketSector | ''
  consented: boolean
  busy: boolean
  onSector: (sector: MarketSector) => void
  onConsent: (value: boolean) => void
  onRun: () => void
}) {
  const ui = MARKET_UI[lang]
  const canRun = Boolean(sector) && consented && !busy
  return (
    <form
      data-market-brief=""
      onSubmit={(event) => {
        event.preventDefault()
        if (canRun) onRun()
      }}
    >
      <AiToolBanner text={copy.banner} />
      <AiToolWillList will={copy.will} willNot={copy.willNot} lang={lang} />
      <fieldset className="mt-6" disabled={busy}>
        <legend className="text-[0.95rem] font-semibold text-ink">{ui.sector}</legend>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/65">{ui.sectorHint}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={ui.sector}>
          {MARKET_SECTORS.map((item) => {
            const id = `market-sector-${item.en.replace(/\s+/g, '-').toLowerCase()}`
            const selected = sector === item.en
            return (
              <label
                key={item.en}
                htmlFor={id}
                className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2 text-[1rem] ${
                  selected
                    ? 'border-[var(--ba-indigo)] bg-[var(--ba-lavender-mist)]'
                    : 'border-[var(--ba-line)] bg-white'
                }`}
              >
                <input
                  id={id}
                  type="radio"
                  name="market-sector"
                  className="size-5 shrink-0 accent-[var(--ba-indigo)]"
                  value={item.en}
                  checked={selected}
                  onChange={() => onSector(item.en)}
                />
                <span>{lang === 'ar' ? item.ar : item.en}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
      <p className="mt-3 text-[0.92rem] leading-relaxed text-ink/65">{ui.kept}</p>
      <AiToolConsent text={copy.consent} lang={lang} checked={consented} disabled={busy} onChange={onConsent} />
      <button
        type="submit"
        className="ba-primary mt-6 inline-flex min-h-11 items-center px-4 text-[1rem] font-semibold disabled:opacity-40"
        disabled={!canRun}
        data-ai-run={canRun ? 'on' : 'off'}
        data-consent={consented ? 'on' : 'off'}
      >
        {busy ? ui.running : ui.run}
      </button>
    </form>
  )
}

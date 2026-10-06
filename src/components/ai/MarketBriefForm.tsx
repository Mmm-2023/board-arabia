import { MARKET_SECTORS, type MarketSector } from '../../../supabase/functions/ai-tool-job/tools/market_brief.ts'
import { AiOutputAcknowledgement, AiToolBanner, AiToolConsent, AiToolWillList } from './AiToolDesk'
import type { RenderedToolCopy } from '../../lib/aiToolCopy'

export const MARKET_UI = {
  sector: 'Sector',
  sectorHint: 'Choose one sector. The brief is general, and every source is linked and dated.',
  kept: 'Your sector choice is saved with the brief and removed with it.',
  unavailableTitle: 'Not available',
  unavailable: 'This brief is not available right now. Nothing was generated.',
  run: 'Prepare the brief',
  running: 'Preparing',
} as const

export function MarketUnavailable() {
  return (
    <div data-market-unavailable="" className="border border-[var(--ba-line)] bg-white px-4 py-5">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">AI</p>
      <h2 className="mt-2 font-display text-[1.6rem] font-semibold">{MARKET_UI.unavailableTitle}</h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink/70">{MARKET_UI.unavailable}</p>
    </div>
  )
}

const STAFF_SEARCH = 'Search is not set up yet. Market brief needs the search key before it can run.'

/** Staff only. Members do not see this, because the tool stays off until staff turn it on. */
export function MarketSearchNotice({ surface = 'settings' }: { surface?: 'settings' | 'tool' }) {
  const className = surface === 'settings'
    ? 'mt-4 block w-full border border-pearl/15 px-3 py-3 text-[1rem] leading-relaxed text-pearl'
    : 'block w-full border border-[var(--ba-line)] bg-white px-3 py-3 text-[1rem] leading-relaxed text-ink'
  return (
    <p role="status" data-market-search="not_configured" className={className}>
      {STAFF_SEARCH}
    </p>
  )
}

export function MarketBriefForm({
  copy,
  sector,
  consented,
  acknowledged = false,
  busy,
  onSector,
  onConsent,
  onAcknowledge,
  onRun,
}: {
  copy: RenderedToolCopy
  sector: MarketSector | ''
  consented: boolean
  acknowledged?: boolean
  busy: boolean
  onSector: (sector: MarketSector) => void
  onConsent: (value: boolean) => void
  onAcknowledge?: (value: boolean) => void
  onRun: () => void
}) {
  const canRun = Boolean(sector) && consented && acknowledged && !busy
  return (
    <form
      data-market-brief=""
      onSubmit={(event) => {
        event.preventDefault()
        if (canRun) onRun()
      }}
    >
      <AiToolBanner text={copy.banner} />
      <AiToolWillList will={copy.will} willNot={copy.willNot} />
      <fieldset className="mt-6" disabled={busy}>
        <legend className="text-[0.95rem] font-semibold text-ink">{MARKET_UI.sector}</legend>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/65">{MARKET_UI.sectorHint}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={MARKET_UI.sector}>
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
                <span>{item.en}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
      <p className="mt-3 text-[0.92rem] leading-relaxed text-ink/65">{MARKET_UI.kept}</p>
      <AiToolConsent text={copy.consent} checked={consented} disabled={busy} onChange={onConsent} />
      <AiOutputAcknowledgement checked={acknowledged} disabled={busy} onChange={onAcknowledge ?? (() => undefined)} />
      <button
        type="submit"
        className="ba-primary mt-6 inline-flex min-h-11 items-center px-4 text-[1rem] font-semibold disabled:opacity-40"
        disabled={!canRun}
        data-ai-run={canRun ? 'on' : 'off'}
        data-consent={consented ? 'on' : 'off'}
      >
        {busy ? MARKET_UI.running : MARKET_UI.run}
      </button>
    </form>
  )
}

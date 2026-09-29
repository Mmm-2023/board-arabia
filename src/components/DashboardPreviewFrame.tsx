import { ExampleMark } from './ExampleMark'
import { previewIntro, type LandingDeal } from '../lib/landingPreview'

const RAIL = ['Directory', 'Mandate inbox', 'Availability', 'Introductions', 'Majlis']
const SELECTED = 'Mandate inbox'

export function DashboardPreviewFrame({ deals }: { deals: LandingDeal[] }) {
  return (
    <section
      id="dashboard-preview"
      className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16"
      aria-labelledby="dashboard-preview-heading"
    >
      <h2
        id="dashboard-preview-heading"
        className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold tracking-[-0.03em] text-ink"
      >
        Dashboard, as a preview
      </h2>
      <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-ink/60">{previewIntro(deals)}</p>
      <div className="mt-8 overflow-hidden border border-ink/10 bg-white/70">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3 sm:px-5">
          <p className="text-[0.62rem] font-semibold tracking-[0.12em] text-ink/45 whitespace-nowrap uppercase sm:text-[0.72rem] sm:tracking-[0.14em]">
            Member dashboard
          </p>
          <p className="shrink-0 text-[0.62rem] tracking-[0.06em] text-brass whitespace-nowrap uppercase sm:text-[0.72rem] sm:tracking-[0.08em]">
            Preview · no live data
          </p>
        </div>
        <div className="grid md:grid-cols-[13.5rem_1fr]">
          <ul className="border-b border-ink/10 md:border-e md:border-b-0">
            {RAIL.map((item) => (
              <li
                key={item}
                className={`px-5 py-3 text-[0.92rem] ${item === SELECTED ? 'ba-primary' : 'text-ink/70'}`}
              >
                {item}
              </li>
            ))}
          </ul>
          <div className="p-5 md:p-8">
            <p className="font-display text-[1.45rem] font-semibold tracking-[-0.03em] text-ink">
              Private to admitted members
            </p>
            <p className="mt-3 max-w-lg text-[0.98rem] leading-relaxed text-ink/60">
              A working surface, not a public profile.
            </p>
            {deals.length > 0 ? (
              <ul className="mt-6 grid gap-3" aria-label="Opportunities">
                {deals.map((deal) => (
                  <li key={deal.id}>
                    <article className="border border-ink/10 bg-white px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-brass uppercase">
                          {deal.sector}
                        </h3>
                        <div className="flex items-center gap-3">
                          {deal.is_demo ? <ExampleMark /> : null}
                          <span className="inline-flex min-h-8 items-center border border-ink/15 px-2.5 text-[0.68rem] font-semibold tracking-[0.08em] text-ink/70 uppercase">
                            {deal.status}
                          </span>
                        </div>
                      </div>
                      <p className="mt-3 text-[1rem] leading-relaxed text-ink/85">{deal.ask}</p>
                    </article>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 border border-ink/10 bg-white px-4 py-4 text-[0.98rem] leading-relaxed text-ink/60">
                No opportunities are listed in this preview.
              </p>
            )}
            <p className="mt-5 text-[0.92rem] leading-relaxed text-ink/50">
              Directory, availability, introductions, and the founding mark open after admission.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

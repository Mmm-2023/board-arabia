import { ExampleMark } from '../ExampleMark'
import type { DealChecklistItem } from '../../../supabase/functions/ai-tool-job/tools/types.ts'

export function DealReadinessChecklist({
  items,
  example,
}: {
  items: readonly DealChecklistItem[]
  example?: boolean
}) {
  return (
    <div className="mt-6 space-y-3" data-re-readiness-memo="" data-example={example ? 'yes' : 'no'}>
      {example ? <ExampleMark /> : null}
      {items.map((item) => (
        <section
          key={item.key}
          aria-label={item.label}
          data-re-section={item.key}
          className="border border-[var(--ba-line)] bg-[var(--ba-lavender-mist)] px-4 py-4"
        >
          <h3 className="font-display text-[1.15rem] font-semibold">{item.label}</h3>
          <p className="mt-2 text-[0.98rem] leading-relaxed break-words text-ink">{item.detail}</p>
        </section>
      ))}
    </div>
  )
}

export function DealReadinessSkeleton() {
  return (
    <div aria-busy="true" aria-label="Reading the document" data-re-readiness-skeleton="" className="mt-6 space-y-3">
      <p className="text-[1rem] text-ink">Reading the document</p>
      {['title', 'foreign', 'land', 'gaps'].map((id) => (
        <div key={id} className="h-20 animate-pulse bg-[var(--ba-lavender)] motion-reduce:animate-none" />
      ))}
    </div>
  )
}

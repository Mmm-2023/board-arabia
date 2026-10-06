import type { PrivateWorkCounts } from '../../lib/mfaFlow'

export function PrivateWorkCountsView({ counts }: { counts: PrivateWorkCounts }) {
  return (
    <section aria-label="Private file counts" className="mt-8 max-w-3xl" data-private-counts="">
      <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-pearl/55 uppercase">Private files</h2>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-pearl/70">
        Counts only. File names and member records stay with the member unless they share one result.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <CountCard label="Due diligence decks" value={String(counts.due_diligence_decks)} />
        <CountCard label="Due diligence reports" value={String(counts.due_diligence_reports)} note={`${counts.due_diligence_reports_shared} shared`} />
        <CountCard label="Due diligence jobs" value={statusLine(counts.due_diligence_jobs)} />
        <CountCard label="AI results" value={String(counts.ai_tool_outputs)} note={`${counts.ai_tool_outputs_shared} shared`} />
        <CountCard label="AI jobs" value={statusLine(counts.ai_tool_jobs)} />
        <CountCard label="AI notes" value={String(counts.ai_tool_notes)} />
      </div>
    </section>
  )
}

function CountCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article className="border border-pearl/15 px-4 py-4">
      <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-pearl/50 uppercase">{label}</p>
      <p className="mt-2 font-display text-[1.35rem] font-semibold">{value}</p>
      {note ? <p className="mt-1 text-[0.9rem] text-pearl/60">{note}</p> : null}
    </article>
  )
}

function statusLine(map: Record<string, number>): string {
  const parts = Object.entries(map).map(([status, n]) => `${status} ${n}`)
  return parts.length > 0 ? parts.join(', ') : '0'
}

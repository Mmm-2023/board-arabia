import { useId } from 'react'
import { SAMPLE_NOTE } from '../lib/sampleAction'

export function SampleAction({ label }: { label: string }) {
  const noteId = useId()
  return (
    <div data-sample-action="inert">
      <p id={noteId} className="mt-4 text-[0.92rem] text-ink/60">
        {SAMPLE_NOTE}
      </p>
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-describedby={noteId}
        className="ba-primary mt-3 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
      >
        {label}
      </button>
    </div>
  )
}

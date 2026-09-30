import { Link } from 'react-router-dom'
import {
  AI_TOOL_NAMES,
  toolPath,
  visibleAiTools,
  type AiToolKey,
} from '../../../supabase/functions/_shared/ai_tools.ts'
import { AI_TOOL_CARD_LINES } from '../../lib/aiToolCopy'

export function AiToolCardList({
  flags,
  staff,
}: {
  flags: Record<AiToolKey, boolean>
  staff: boolean
}) {
  const tools = visibleAiTools(flags, staff)
  if (tools.length === 0) return null
  return (
    <ul className="mt-4 space-y-3" data-ai-cards="">
      {tools.map((tool) => {
        const off = !flags[tool]
        return (
          <li key={tool}>
            <Link
              to={toolPath(tool)}
              className="group flex min-h-11 items-center gap-4 border border-[var(--ba-line)] bg-white px-4 py-4 transition-colors hover:border-[var(--ba-indigo)] hover:bg-[var(--ba-lavender-mist)] focus-visible:ring-2 focus-visible:ring-[var(--ba-indigo)] focus-visible:ring-offset-2 focus-visible:outline-none"
              data-ai-card={tool}
              data-ai-off={off ? 'yes' : 'no'}
            >
              <span className="min-w-0 flex-1">
                <span className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">
                  {AI_TOOL_NAMES[tool]}
                </span>
                {off && staff ? (
                  <span className="mt-2 block text-[0.95rem] font-semibold text-[var(--ba-copper-deep)]">
                    Off for members
                  </span>
                ) : null}
                <span className="mt-2 block text-[1rem] leading-relaxed text-ink/65">{AI_TOOL_CARD_LINES[tool]}</span>
                <span className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[1rem] font-semibold">
                  Start a check
                </span>
              </span>
              <Chevron />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-[var(--ba-indigo)]" fill="none">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

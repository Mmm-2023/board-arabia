import { Link } from 'react-router-dom'
import { AI_TOOL_ORDER, toolPath, visibleAiTools, type AiToolKey } from '../../../supabase/functions/_shared/ai_tools.ts'
import { AI_TOOL_CARD_LINES, AI_TOOL_CARD_LINES_AR, toolTitle } from '../../lib/aiToolCopy'
import { AI_UI, type UiLang } from '../../lib/aiToolUi'

export function AiToolEmpty({ lang = 'en' }: { lang?: UiLang }) {
  const ui = AI_UI[lang]
  return (
    <div className="mt-6 border border-[var(--ba-line)] bg-white px-5 py-6" data-ai-empty="">
      <p className="text-[1.05rem] text-ink">{ui.empty}</p>
      <p className="mt-2 text-[1rem] leading-relaxed text-ink/65">{ui.emptyBody}</p>
    </div>
  )
}

export function AiToolCardList({
  flags,
  preview = false,
  lang = 'en',
}: {
  flags: Record<AiToolKey, boolean>
  preview?: boolean
  lang?: UiLang
}) {
  const ui = AI_UI[lang]
  const tools = preview ? [...AI_TOOL_ORDER] : visibleAiTools(flags)
  if (tools.length === 0) return <AiToolEmpty lang={lang} />
  const lines = lang === 'ar' ? AI_TOOL_CARD_LINES_AR : AI_TOOL_CARD_LINES
  return (
    <ul className="mt-4 space-y-3" data-ai-cards="" data-ai-preview={preview ? 'yes' : 'no'}>
      {tools.map((tool) => {
        const off = !flags[tool]
        return (
          <li key={tool}>
            <Link
              to={preview ? `/admin/ai/${toolPath(tool).split('/').pop()}` : toolPath(tool)}
              className="group flex min-h-11 items-center gap-4 border border-[var(--ba-line)] bg-white px-4 py-4 transition-colors hover:border-[var(--ba-indigo)] hover:bg-[var(--ba-lavender-mist)] focus-visible:ring-2 focus-visible:ring-[var(--ba-indigo)] focus-visible:ring-offset-2 focus-visible:outline-none"
              data-ai-card={tool}
              data-ai-off={off ? 'yes' : 'no'}
            >
              <span className="min-w-0 flex-1">
                <span className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">{toolTitle(tool, lang)}</span>
                {preview && off ? (
                  <span className="mt-2 block text-[0.95rem] font-semibold text-[var(--ba-copper-deep)]">{ui.staffPreview}</span>
                ) : null}
                <span className="mt-2 block text-[1rem] leading-relaxed text-ink/65">{lines[tool]}</span>
                <span className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[1rem] font-semibold">
                  {preview && off ? ui.preview : ui.start}
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

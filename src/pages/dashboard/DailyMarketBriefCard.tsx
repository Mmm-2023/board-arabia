import { Link } from 'react-router-dom'
import {
  DAILY_BRIEF_AI_LABEL,
  DAILY_BRIEF_GROUP_LABEL,
  DAILY_BRIEF_PATH,
  DAILY_BRIEF_TITLE,
  briefDateLabel,
  type MemberBrief,
} from '../../lib/dailyMarketBrief'

export function DailyMarketBriefCard({ brief }: { brief: MemberBrief }) {
  const top = brief.items.slice(0, 3)
  return (
    <section
      aria-label={DAILY_BRIEF_TITLE}
      data-daily-brief-card=""
      className="mb-8 max-w-3xl border border-[var(--ba-line)] bg-white px-5 py-4"
    >
      <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">{DAILY_BRIEF_TITLE}</h2>
      <p className="mt-2 text-[0.95rem] text-ink/70">{briefDateLabel(brief.briefDate)}</p>
      <ul className="mt-3 space-y-3">
        {top.map((item) => (
          <li key={item.url} className="border border-[var(--ba-line)] px-3 py-3">
            <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/50 uppercase">
              {DAILY_BRIEF_GROUP_LABEL[item.group]}
            </p>
            <p className="mt-2 text-[0.72rem] font-semibold tracking-[0.08em] text-[var(--ba-indigo)] uppercase">
              {DAILY_BRIEF_AI_LABEL}
            </p>
            <p className="mt-1 text-[1rem] leading-relaxed text-ink">{item.summary}</p>
            <p className="mt-2 text-[0.95rem] text-ink/70">{item.outlet}</p>
            <p className="text-[0.95rem] text-ink/70">{briefDateLabel(item.dated)}</p>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)] underline"
            >
              Source
            </a>
          </li>
        ))}
      </ul>
      <Link
        to={DAILY_BRIEF_PATH}
        className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
      >
        Open the brief
      </Link>
    </section>
  )
}

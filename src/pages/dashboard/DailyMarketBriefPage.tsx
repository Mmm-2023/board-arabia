import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DAILY_BRIEF_AI_LABEL,
  DAILY_BRIEF_EMPTY,
  DAILY_BRIEF_EMPTY_BODY,
  DAILY_BRIEF_ERROR_BODY,
  DAILY_BRIEF_ERROR_BUTTON,
  DAILY_BRIEF_ERROR_TITLE,
  DAILY_BRIEF_FOOTER,
  DAILY_BRIEF_GROUP_LABEL,
  DAILY_BRIEF_INTRO,
  DAILY_BRIEF_LOADING,
  DAILY_BRIEF_TITLE,
  DAILY_BRIEF_WEEKEND_BODY,
  DAILY_BRIEF_WEEKEND_TITLE,
  briefUpdatedLabel,
  calendarLabel,
  loadMemberDailyBrief,
  riyadhIsWeekend,
  riyadhTodayKey,
  type DailyBriefGroup,
  type DailyBriefItem,
  type MemberBrief,
} from '../../lib/dailyMarketBrief'
import { useNoIndex } from '../../lib/usePageTitle'

const actionClass = 'inline-flex min-h-11 items-center text-[1.0625rem] font-semibold text-[var(--ba-indigo)] underline'

export function DailyMarketBriefPage() {
  const [brief, setBrief] = useState<MemberBrief | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  useNoIndex(`${DAILY_BRIEF_TITLE} | Board Arabia`)

  useEffect(() => {
    let cancelled = false
    setPhase('loading')
    void loadMemberDailyBrief().then((next) => {
      if (cancelled) return
      if (next.status === 'error') {
        setBrief(null)
        setPhase('error')
        return
      }
      if (next.status === 'empty') {
        setBrief(null)
        setPhase('empty')
        return
      }
      setBrief(next.brief)
      setPhase('ready')
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <DailyMarketBriefView
      brief={brief}
      phase={phase}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
}

export function DailyMarketBriefView({
  brief,
  phase = brief && brief.items.length > 0 ? 'ready' : 'empty',
  now = new Date(),
  onRetry,
}: {
  brief: MemberBrief | null
  phase?: 'loading' | 'ready' | 'empty' | 'error'
  now?: Date
  onRetry?: () => void
}) {
  if (phase === 'loading') {
    return (
      <div className="max-w-3xl text-base" data-daily-brief-page="" data-daily-brief-loading="" aria-busy="true">
        <p className="text-base text-ink/80">{DAILY_BRIEF_LOADING}</p>
        <div className="mt-4 space-y-3">
          {['a', 'b', 'c'].map((id) => (
            <div key={id} className="h-24 animate-pulse bg-[var(--ba-lavender)] motion-reduce:animate-none" />
          ))}
        </div>
      </div>
    )
  }
  if (phase === 'error') {
    return (
      <div className="max-w-3xl text-base" data-daily-brief-page="" data-daily-brief-error="" role="alert">
        <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">{DAILY_BRIEF_ERROR_TITLE}</h1>
        <p className="mt-3 text-base leading-relaxed text-ink/80">{DAILY_BRIEF_ERROR_BODY}</p>
        {onRetry ? (
          <button type="button" className={`mt-4 ${actionClass}`} onClick={onRetry}>
            {DAILY_BRIEF_ERROR_BUTTON}
          </button>
        ) : null}
      </div>
    )
  }
  if (phase === 'empty' || !brief || brief.items.length === 0) {
    const weekend = riyadhIsWeekend(now)
    return (
      <div className="max-w-3xl text-base" data-daily-brief-page="" data-daily-brief-empty="">
        <BackHome />
        <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">
          {weekend ? DAILY_BRIEF_WEEKEND_TITLE : DAILY_BRIEF_EMPTY}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink/80">
          {weekend ? DAILY_BRIEF_WEEKEND_BODY : DAILY_BRIEF_EMPTY_BODY}
        </p>
      </div>
    )
  }
  const older = brief.briefDate !== riyadhTodayKey(now)
  const updated = briefUpdatedLabel(brief.generatedAt)
  return (
    <div className="max-w-3xl text-base" data-daily-brief-page="">
      <BackHome />
      <p className="text-[0.9375rem] text-ink/70">Home</p>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">{DAILY_BRIEF_TITLE}</h1>
      <p className="mt-2 text-[0.9375rem] text-ink/80">{calendarLabel(brief.briefDate, true)}</p>
      {updated ? <p className="text-[0.9375rem] text-ink/80">{updated}</p> : null}
      {older ? (
        <p className="mt-3 text-base leading-relaxed text-ink/80" data-daily-brief-older="">
          This is the brief from {calendarLabel(brief.briefDate, false)}. Today&apos;s is not ready yet.
        </p>
      ) : null}
      <p className="mt-3 text-base leading-relaxed text-ink/80">{DAILY_BRIEF_INTRO}</p>
      {groupItems(brief.items).map(([group, rows]) => (
        <section key={group} className="mt-6">
          <h2 className="text-[0.9375rem] font-semibold text-ink">{DAILY_BRIEF_GROUP_LABEL[group]}</h2>
          <ul className="mt-3 space-y-3">
            {rows.map((item) => (
              <li key={item.url} className="border border-[var(--ba-line)] bg-white px-4 py-4">
                <p className="text-[0.9375rem] font-semibold text-[var(--ba-indigo)]">{DAILY_BRIEF_AI_LABEL}</p>
                <h3 className="mt-2 text-base font-semibold leading-snug text-ink">{item.headline}</h3>
                <p className="mt-2 text-base leading-relaxed text-ink">{item.summary}</p>
                <p className="mt-3 text-[0.9375rem] text-ink/80">
                  {item.outlet}, {calendarLabel(item.dated, false)}
                </p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Read at ${item.outlet}. Opens the original report.`}
                  className={`mt-1 ${actionClass}`}
                >
                  Read at {item.outlet}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-6 text-base leading-relaxed text-ink/70">{DAILY_BRIEF_FOOTER}</p>
    </div>
  )
}

function BackHome() {
  return (
    <Link to="/dashboard" className={`mb-3 ${actionClass}`}>
      Back to Home
    </Link>
  )
}

function groupItems(items: DailyBriefItem[]): Array<[DailyBriefGroup, DailyBriefItem[]]> {
  const order: DailyBriefGroup[] = ['deals', 'regulation', 'leadership']
  return order
    .map((group) => [group, items.filter((item) => item.group === group)] as [DailyBriefGroup, DailyBriefItem[]])
    .filter((entry) => entry[1].length > 0)
}

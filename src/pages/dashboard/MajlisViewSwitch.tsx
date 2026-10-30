export function MajlisViewSwitch({
  calendar,
  onChange,
}: {
  calendar: boolean
  onChange: (calendar: boolean) => void
}) {
  return (
    <div
      role="group"
      aria-label="Upcoming view"
      data-majlis-view=""
      className="inline-flex shrink-0 gap-1 rounded-3xl bg-[var(--ba-lavender-mist)] p-1"
    >
      <button type="button" className={buttonClass(!calendar)} aria-pressed={!calendar} onClick={() => onChange(false)}>
        List
      </button>
      <button type="button" className={buttonClass(calendar)} aria-pressed={calendar} onClick={() => onChange(true)}>
        Calendar
      </button>
    </div>
  )
}

function buttonClass(on: boolean) {
  return `inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-[1rem] font-semibold ${
    on ? 'bg-[var(--ba-indigo)] text-white' : 'text-[var(--ba-ink)] hover:bg-white'
  }`
}

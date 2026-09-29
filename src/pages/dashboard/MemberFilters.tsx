import { useEffect, type ReactNode } from 'react'

export function chipOptions(values: readonly string[]) {
  return values.map((value) => ({ value, label: value }))
}

export function MemberFilterControls({
  active,
  open,
  onOpenChange,
  clearLabel,
  onClear,
  showClear,
  desktopId,
  sheetId,
  renderGroups,
}: {
  active: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  clearLabel: string
  onClear: () => void
  showClear: boolean
  desktopId: string
  sheetId: string
  renderGroups: () => ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const desktop = window.matchMedia('(min-width: 768px)').matches
    if (desktop) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase md:hidden"
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => onOpenChange(true)}
      >
        {active ? 'Filters on' : 'Filters'}
      </button>
      <div id={desktopId} className="hidden md:block">
        {renderGroups()}
      </div>
      {showClear ? (
        <button
          type="button"
          className="mt-4 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-[var(--ba-indigo)] uppercase"
          onClick={onClear}
        >
          {clearLabel}
        </button>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-ink/45"
            onClick={() => onOpenChange(false)}
          />
          <div
            id={sheetId}
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="shell-safe-bottom absolute inset-x-0 bottom-0 max-h-[min(36rem,85dvh)] overflow-y-auto border-t border-[var(--ba-line)] bg-pearl px-4 pt-4"
          >
            <div className="flex items-start justify-between gap-3 px-1 pb-2">
              <p className="font-display text-[1.15rem] font-semibold tracking-[-0.02em]">Filters</p>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-[0.95rem] font-semibold text-[var(--ba-indigo)]"
                onClick={() => onOpenChange(false)}
              >
                Close
              </button>
            </div>
            {renderGroups()}
            <div className="h-4" />
          </div>
        </div>
      ) : null}
    </>
  )
}

export function FilterRow({
  label,
  value,
  options,
  onPick,
}: {
  label: string
  value: string | null
  options: readonly { value: string; label: string }[]
  onPick: (next: string | null) => void
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/45 uppercase">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Chip pressed={value == null} onClick={() => onPick(null)}>
          All
        </Chip>
        {options.map((option) => (
          <Chip
            key={option.value}
            pressed={value === option.value}
            onClick={() => onPick(value === option.value ? null : option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export function Chip({
  pressed,
  onClick,
  children,
  radio = false,
}: {
  pressed: boolean
  onClick: () => void
  children: string
  radio?: boolean
}) {
  return (
    <button
      type="button"
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? pressed : undefined}
      aria-pressed={radio ? undefined : pressed}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center px-3 text-[0.92rem] whitespace-nowrap ${
        pressed ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'border border-[var(--ba-line)] bg-white text-ink'
      }`}
    >
      {children}
    </button>
  )
}

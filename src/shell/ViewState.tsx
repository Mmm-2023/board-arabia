import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ShellTone } from './destinations'
import type { ViewStatus } from './viewCopy'

export function toneClasses(tone: ShellTone) {
  if (tone === 'staff') {
    return {
      muted: 'text-pearl/80',
      quiet: 'text-[var(--ba-lavender-mist)]',
      border: 'border-white/15',
      panel: 'border border-white/15 bg-white/[0.04]',
      skeleton: 'bg-[var(--ba-lavender)]/35',
      alert: 'text-red-300',
      primary: 'ba-primary',
      secondary: 'border border-white/25 text-pearl',
    }
  }
  return {
    muted: 'text-[var(--ba-muted)]',
    quiet: 'text-[var(--ba-muted)]',
    border: 'border-[var(--ba-line)]',
    panel: 'border border-[var(--ba-line)] bg-white',
    skeleton: 'bg-[var(--ba-lavender)]',
    alert: 'text-[var(--ba-error)]',
    primary: 'ba-primary',
    secondary: 'border border-[var(--ba-line)] bg-white text-ink hover:bg-[var(--ba-lavender-mist)]',
  }
}

export function HomeSkeleton({
  tone,
  pulse = true,
  cards = 4,
}: {
  tone: ShellTone
  pulse?: boolean
  cards?: number
}) {
  const { skeleton } = toneClasses(tone)
  const motion = pulse ? 'motion-reduce:animate-none animate-pulse' : ''
  return (
    <div aria-busy={pulse} aria-label="Loading home" className="max-w-3xl">
      <div className={`h-16 ${skeleton} ${motion}`} />
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className={`h-24 ${skeleton} ${motion}`} />
        ))}
      </div>
      <div className={`mt-4 h-12 w-44 ${skeleton} ${motion}`} />
    </div>
  )
}

export function CardSkeleton({ tone, label }: { tone: ShellTone; label: string }) {
  const { skeleton } = toneClasses(tone)
  return (
    <div aria-busy="true" aria-label={label} className="max-w-3xl space-y-3">
      {['a', 'b', 'c', 'd'].map((id) => (
        <div key={id} className={`h-20 ${skeleton} motion-reduce:animate-none animate-pulse`} />
      ))}
    </div>
  )
}

export function FormSkeleton({ tone }: { tone: ShellTone }) {
  const { skeleton } = toneClasses(tone)
  return (
    <div aria-busy="true" aria-label="Loading form" className="max-w-xl space-y-4">
      {['a', 'b', 'c'].map((id) => (
        <div key={id} className={`h-14 ${skeleton} motion-reduce:animate-none animate-pulse`} />
      ))}
    </div>
  )
}

export function EmptyState({
  tone,
  message,
  action,
}: {
  tone: ShellTone
  message: string
  action?: { label: string; to: string }
}) {
  const styles = toneClasses(tone)
  return (
    <div className={`${styles.panel} px-5 py-6`}>
      <p className={`max-w-xl text-[1.02rem] leading-relaxed ${styles.muted}`}>{message}</p>
      {action && (
        <Link
          to={action.to}
          className={`mt-5 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.primary}`}
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}

export function ErrorBanner({
  tone,
  message,
  onRetry,
  retryLabel,
}: {
  tone: ShellTone
  message: string
  onRetry?: () => void
  retryLabel: string
}) {
  const styles = toneClasses(tone)
  return (
    <div className={`border px-4 py-3 ${styles.border}`} role="alert">
      <p className={`text-[0.98rem] leading-relaxed ${styles.muted}`}>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`mt-3 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.secondary}`}
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}

export function PermissionState({ tone, message }: { tone: ShellTone; message: string }) {
  const styles = toneClasses(tone)
  return (
    <div className="max-w-lg">
      <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">Not available</h1>
      <p className={`mt-4 text-[1.02rem] leading-relaxed ${styles.muted}`}>{message}</p>
    </div>
  )
}

export function FilteredZero({
  tone,
  message,
  onClear,
  clearLabel,
}: {
  tone: ShellTone
  message: string
  onClear: () => void
  clearLabel: string
}) {
  const styles = toneClasses(tone)
  return (
    <div className={`${styles.panel} px-5 py-6`}>
      <p className={`text-[1.02rem] ${styles.muted}`}>{message}</p>
      <button
        type="button"
        onClick={onClear}
        className={`mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.secondary}`}
      >
        {clearLabel}
      </button>
    </div>
  )
}

export function renderStubStatus({
  status,
  tone,
  empty,
  error,
  denied,
  filtered,
  retryLabel,
  clearLabel,
  onRetry,
  onClear,
  action,
}: {
  status: ViewStatus
  tone: ShellTone
  empty: string
  error: string
  denied: string
  filtered: string
  retryLabel: string
  clearLabel: string
  onRetry?: () => void
  onClear?: () => void
  action?: { label: string; to: string }
}): ReactNode {
  if (status === 'loading') return <CardSkeleton tone={tone} label="Loading" />
  if (status === 'error') {
    return <ErrorBanner tone={tone} message={error} onRetry={onRetry} retryLabel={retryLabel} />
  }
  if (status === 'denied') return <PermissionState tone={tone} message={denied} />
  if (status === 'filtered') {
    return (
      <FilteredZero
        tone={tone}
        message={filtered}
        onClear={onClear ?? (() => {})}
        clearLabel={clearLabel}
      />
    )
  }
  if (status === 'empty') return <EmptyState tone={tone} message={empty} action={action} />
  return null
}

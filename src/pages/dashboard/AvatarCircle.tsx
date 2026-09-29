export function AvatarCircle({
  src,
  initials,
  size,
  busy = false,
  alt = '',
  onError,
}: {
  src: string | null
  initials: string
  size: number
  busy?: boolean
  alt?: string
  onError?: () => void
}) {
  const style = { width: size, height: size }
  if (busy) {
    return (
      <div
        style={style}
        className="shrink-0 animate-pulse rounded-full bg-ink/10"
        role="status"
        aria-label="Loading photo"
      />
    )
  }
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        style={style}
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-full object-cover"
        onError={onError}
      />
    )
  }
  const text = size >= 96 ? 'text-[1.7rem]' : 'text-[0.85rem]'
  return (
    <div
      style={style}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--ba-lavender-mist)] font-display font-semibold text-[var(--ba-indigo)] ${text}`}
    >
      {initials}
    </div>
  )
}

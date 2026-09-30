import { AVATAR_ILLUSTRATION, resolveAvatar } from '../lib/avatarStyle'

export function Avatar({
  src,
  avatarStyle,
  size,
  busy = false,
  alt = '',
  onError,
}: {
  src: string | null
  avatarStyle?: unknown
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
        className="shrink-0 animate-pulse rounded-full bg-[var(--ba-lavender-mist)] motion-reduce:animate-none"
        role="status"
        aria-label="Loading photo"
      />
    )
  }
  const choice = resolveAvatar({ photoUrl: src, style: avatarStyle })
  if (choice.kind === 'photo') {
    return (
      <img
        src={choice.src}
        alt={alt}
        style={style}
        referrerPolicy="no-referrer"
        data-avatar="photo"
        className="shrink-0 rounded-full object-cover"
        onError={onError}
      />
    )
  }
  return (
    <img
      src={AVATAR_ILLUSTRATION[choice.style]}
      alt={alt}
      style={style}
      data-avatar="illustration"
      data-avatar-style={choice.style}
      className="shrink-0 rounded-full object-cover"
    />
  )
}

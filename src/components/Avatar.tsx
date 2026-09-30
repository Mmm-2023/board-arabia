import { AVATAR_ILLUSTRATION, avatarSrcSet, resolveAvatar } from '../lib/avatarStyle'

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
        width={size}
        height={size}
        style={style}
        referrerPolicy="no-referrer"
        data-avatar="photo"
        className="shrink-0 rounded-full object-cover"
        onError={onError}
      />
    )
  }
  return (
    <picture className="inline-block shrink-0 overflow-hidden rounded-full" style={style}>
      <source type="image/avif" srcSet={avatarSrcSet(choice.style, 'avif')} sizes={`${size}px`} />
      <source type="image/webp" srcSet={avatarSrcSet(choice.style, 'webp')} sizes={`${size}px`} />
      <img
        src={AVATAR_ILLUSTRATION[choice.style]}
        alt={alt}
        width={size}
        height={size}
        data-avatar="illustration"
        data-avatar-style={choice.style}
        className="h-full w-full object-cover [clip-path:circle(50%)]"
      />
    </picture>
  )
}

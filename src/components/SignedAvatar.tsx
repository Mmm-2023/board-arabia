import { useSignedAvatar } from '../lib/useSignedAvatar'
import { Avatar } from './Avatar'

/** Photo when the signed read works. Illustrated default otherwise. */
export function SignedAvatar({
  path,
  avatarStyle,
  size,
  alt = '',
}: {
  path: string | null
  avatarStyle?: unknown
  size: number
  alt?: string
}) {
  const signed = useSignedAvatar(path)
  return (
    <Avatar
      src={signed.failed ? null : signed.url}
      avatarStyle={avatarStyle}
      size={size}
      busy={signed.loading}
      alt={alt}
      onError={signed.markFailed}
    />
  )
}

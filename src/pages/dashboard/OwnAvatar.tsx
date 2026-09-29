import { Link } from 'react-router-dom'
import { initials } from '../../lib/member'
import { AvatarCircle } from './AvatarCircle'
import { useMember } from './context'
import { useSignedAvatar } from './useSignedAvatar'

export function OwnAvatar({ decorative = false }: { decorative?: boolean }) {
  const { email, profile } = useMember()
  const path = profile?.avatar_path ?? null
  const signed = useSignedAvatar(path)
  const mark = initials(profile?.full_name ?? null, email)
  const circle = (
    <AvatarCircle
      src={signed.failed ? null : signed.url}
      initials={mark}
      size={36}
      busy={signed.loading}
      alt=""
      onError={signed.markFailed}
    />
  )
  if (decorative) return circle
  return (
    <Link
      to="/dashboard/profile"
      aria-label="Profile"
      className="inline-flex min-h-11 min-w-11 items-center justify-center"
    >
      {circle}
    </Link>
  )
}

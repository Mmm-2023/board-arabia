import { Link } from 'react-router-dom'
import { SignedAvatar } from '../../components/SignedAvatar'
import { useMember } from './context'

export function OwnAvatar({ decorative = false, size = 36 }: { decorative?: boolean; size?: number }) {
  const { profile } = useMember()
  const circle = (
    <SignedAvatar path={profile?.avatar_path ?? null} avatarStyle={profile?.avatar_style} size={size} alt="" />
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

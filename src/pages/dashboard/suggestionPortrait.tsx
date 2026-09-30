import { SignedAvatar } from '../../components/SignedAvatar'
import type { IntroSuggestion } from '../../lib/introSuggestions'

export function suggestionPortrait(row: IntroSuggestion) {
  return <SignedAvatar path={row.avatar_path} avatarStyle={row.avatar_style} size={48} alt="" />
}

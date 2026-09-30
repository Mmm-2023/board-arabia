import { useId } from 'react'
import {
  AVATAR_STYLES,
  AVATAR_STYLE_LABEL,
  DEFAULT_PICTURE_LABEL,
  commitAvatarStyle,
  normalizeAvatarStyle,
  type AvatarStyle,
} from '../lib/avatarStyle'
import { Avatar } from './Avatar'

export function DefaultPicturePicker({
  value,
  onSave,
  disabled = false,
  tone = 'member',
}: {
  value: unknown
  onSave: (patch: { avatar_style: AvatarStyle }) => void
  disabled?: boolean
  tone?: 'member' | 'staff'
}) {
  const labelId = useId()
  const selected = normalizeAvatarStyle(value)
  const legend = tone === 'staff' ? 'text-pearl/70' : 'text-ink/55'
  const idle =
    tone === 'staff'
      ? 'border border-pearl/25 text-pearl'
      : 'border border-[var(--ba-line)] bg-white text-ink'
  const pressed =
    tone === 'staff' ? 'border-brass ring-2 ring-brass' : 'border-[var(--ba-indigo)] ring-2 ring-[var(--ba-indigo)]'

  return (
    <div>
      <p id={labelId} className={`text-[0.72rem] font-semibold tracking-[0.08em] uppercase ${legend}`}>
        {DEFAULT_PICTURE_LABEL}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-2 flex flex-wrap gap-2">
        {AVATAR_STYLES.map((style) => {
          const on = selected === style
          return (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              data-avatar-choice={style}
              onClick={() => {
                if (disabled || on) return
                commitAvatarStyle(style, onSave)
              }}
              className={`inline-flex min-h-11 items-center gap-2 px-3 text-[0.95rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ba-indigo)] disabled:opacity-40 ${
                on ? pressed : idle
              }`}
            >
              <Avatar avatarStyle={style} src={null} size={40} alt="" />
              <span>{AVATAR_STYLE_LABEL[style]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

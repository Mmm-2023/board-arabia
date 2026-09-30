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
    tone === 'staff'
      ? 'border-brass ring-2 ring-brass ring-offset-2 ring-offset-ink'
      : 'border-[var(--ba-indigo)] ring-2 ring-[var(--ba-indigo)] ring-offset-2 ring-offset-pearl'

  return (
    <div>
      <p id={labelId} className={`text-[0.72rem] font-semibold tracking-[0.08em] uppercase ${legend}`}>
        {DEFAULT_PICTURE_LABEL}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-2 grid w-fit max-w-full grid-cols-4 justify-items-start gap-2">
        {AVATAR_STYLES.map((style) => {
          const on = selected === style
          const label = AVATAR_STYLE_LABEL[style]
          return (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label}
              disabled={disabled}
              data-avatar-choice={style}
              onClick={() => {
                if (disabled || on) return
                commitAvatarStyle(style, onSave)
              }}
              className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ba-indigo)] disabled:opacity-40 ${
                on ? pressed : idle
              }`}
            >
              <Avatar avatarStyle={style} src={null} size={36} alt="" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

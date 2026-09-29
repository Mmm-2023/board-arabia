import { AVAILABILITY, AVAILABILITY_LABEL, SECTOR_TAGS, VISION_2030_THEMES, type Availability } from '../../lib/profileTags'
import { Chip } from './MemberFilters'

export function ProfileTagFields({
  availability,
  sectors,
  themes,
  limitNote,
  onAvailability,
  onSector,
  onTheme,
}: {
  availability: Availability | null
  sectors: readonly string[]
  themes: readonly string[]
  limitNote: string
  onAvailability: (value: Availability) => void
  onSector: (tag: string) => void
  onTheme: (tag: string) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <p id="profile-availability-label" className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
          Availability
        </p>
        <p id="profile-availability-help" className="mt-2 text-[0.95rem] leading-relaxed text-ink/60">
          Admitted members see this on your directory card. Open means a relevant introduction is welcome. Selective
          means you want a close fit. At capacity means you are not taking new approaches.
        </p>
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="radiogroup"
          aria-labelledby="profile-availability-label"
          aria-describedby="profile-availability-help"
        >
          {AVAILABILITY.map((value) => (
            <Chip key={value} radio pressed={availability === value} onClick={() => onAvailability(value)}>
              {AVAILABILITY_LABEL[value]}
            </Chip>
          ))}
        </div>
      </div>
      <TagGroup
        id="profile-sectors"
        label="Sector"
        help="Pick the sectors where you sit. Up to 3."
        options={SECTOR_TAGS}
        selected={sectors}
        onPick={onSector}
      />
      <TagGroup
        id="profile-vision"
        label="Vision 2030"
        help="Pick the Vision 2030 themes where you sit. Up to 3."
        options={VISION_2030_THEMES}
        selected={themes}
        onPick={onTheme}
      />
      {limitNote ? (
        <p className="text-[0.92rem] text-ink/70" role="status">
          {limitNote}
        </p>
      ) : null}
    </div>
  )
}

function TagGroup({
  id,
  label,
  help,
  options,
  selected,
  onPick,
}: {
  id: string
  label: string
  help: string
  options: readonly string[]
  selected: readonly string[]
  onPick: (tag: string) => void
}) {
  return (
    <div>
      <p id={`${id}-label`} className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
        {label}
      </p>
      <p id={`${id}-help`} className="mt-2 text-[0.95rem] leading-relaxed text-ink/60">
        {help}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`}>
        {options.map((option) => (
          <Chip key={option} pressed={selected.includes(option)} onClick={() => onPick(option)}>
            {option}
          </Chip>
        ))}
      </div>
    </div>
  )
}

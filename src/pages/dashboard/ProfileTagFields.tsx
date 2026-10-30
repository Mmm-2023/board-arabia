import { useState } from 'react'
import { AVAILABILITY, AVAILABILITY_LABEL, SECTOR_TAGS, type Availability } from '../../lib/profileTags'
import { Chip } from './MemberFilters'

export function ProfileTagFields({
  availability,
  sectors,
  onAvailability,
  onSector,
}: {
  availability: Availability | null
  sectors: readonly string[]
  onAvailability: (value: Availability) => void
  onSector: (tag: string) => void
}) {
  const [sectorNote, setSectorNote] = useState('')
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
            <Chip key={value} touch radio pressed={availability === value} onClick={() => onAvailability(value)}>
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
        note={sectorNote}
        onPick={(tag) => {
          if (!sectors.includes(tag) && sectors.length >= 3) {
            setSectorNote('Three sectors is the limit.')
            return
          }
          setSectorNote('')
          onSector(tag)
        }}
      />
    </div>
  )
}

function TagGroup({
  id,
  label,
  help,
  options,
  selected,
  note,
  onPick,
}: {
  id: string
  label: string
  help: string
  options: readonly string[]
  selected: readonly string[]
  note?: string
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
          <Chip key={option} touch pressed={selected.includes(option)} onClick={() => onPick(option)}>
            {option}
          </Chip>
        ))}
      </div>
      {note ? (
        <p className="mt-3 text-[15px] text-ink" role="status">
          {note}
        </p>
      ) : null}
    </div>
  )
}

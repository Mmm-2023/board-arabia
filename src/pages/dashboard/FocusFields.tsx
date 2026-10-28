import {
  CAN_HELP_WITH,
  FOCUS_LINE_MAX,
  LANGUAGES,
  LOOKING_FOR,
  focusLineProblem,
} from '../../../supabase/functions/_shared/focus_fields.ts'
import { Chip } from './MemberFilters'

const fieldClass =
  'mt-2 w-full min-h-12 border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'

export function FocusFields({
  canHelp,
  canHelpLine,
  lookingFor,
  lookingForLine,
  languages,
  onCanHelp,
  onCanHelpLine,
  onLookingFor,
  onLookingForLine,
  onLanguage,
}: {
  canHelp: readonly string[]
  canHelpLine: string
  lookingFor: readonly string[]
  lookingForLine: string
  languages: readonly string[]
  onCanHelp: (tag: string) => void
  onCanHelpLine: (value: string) => void
  onLookingFor: (tag: string) => void
  onLookingForLine: (value: string) => void
  onLanguage: (tag: string) => void
}) {
  return (
    <div className="space-y-8">
      <ChipGroup
        id="profile-can-help"
        label="I can help with"
        help="Pick up to 3. Admitted members see these on your card."
        options={CAN_HELP_WITH}
        selected={canHelp}
        onPick={onCanHelp}
      />
      <LineField
        id="profile-can-help-line"
        label="One line, optional"
        help="Shown when someone opens your card. Do not add an email or a phone number."
        value={canHelpLine}
        onChange={onCanHelpLine}
      />
      <ChipGroup
        id="profile-looking-for"
        label="I am looking for"
        help="Pick up to 3. A match can be the reason for a weekly introduction."
        options={LOOKING_FOR}
        selected={lookingFor}
        onPick={onLookingFor}
      />
      <LineField
        id="profile-looking-for-line"
        label="One line, optional"
        help="Shown when someone opens your card. Do not add an email or a phone number."
        value={lookingForLine}
        onChange={onLookingForLine}
      />
      <ChipGroup
        id="profile-languages"
        label="Languages"
        help="Languages you work in."
        options={LANGUAGES}
        selected={languages}
        onPick={onLanguage}
      />
    </div>
  )
}

function ChipGroup({
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
          <Chip key={option} touch pressed={selected.includes(option)} onClick={() => onPick(option)}>
            {option}
          </Chip>
        ))}
      </div>
    </div>
  )
}

function LineField({
  id,
  label,
  help,
  value,
  onChange,
}: {
  id: string
  label: string
  help: string
  value: string
  onChange: (value: string) => void
}) {
  const problem = focusLineProblem(value)
  return (
    <div>
      <label className="block" htmlFor={id}>
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">{label}</span>
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          maxLength={FOCUS_LINE_MAX}
          aria-describedby={`${id}-help`}
          className={fieldClass}
        />
      </label>
      <p id={`${id}-help`} className="mt-2 text-[0.92rem] leading-relaxed text-ink/55">
        {help}
      </p>
      <p className="mt-1 text-[0.85rem] text-ink/45">
        {value.trim().length} / {FOCUS_LINE_MAX}
      </p>
      {problem ? (
        <p className="mt-1 text-[0.92rem] text-ink/70" role="status">
          {problem}
        </p>
      ) : null}
    </div>
  )
}

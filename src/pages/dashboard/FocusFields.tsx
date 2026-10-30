import { useState } from 'react'
import {
  CAN_HELP_WITH,
  FOCUS_LINE_MAX,
  LANGUAGES,
  LOOKING_FOR,
  MAX_FOCUS_CHIPS,
  suggestedVisionThemes,
  focusLineProblem,
} from '../../../supabase/functions/_shared/focus_fields.ts'
import { VISION_2030_THEMES } from '../../lib/profileTags'

const LIMIT_MESSAGE = 'You have 3. Tap a selected one to remove it before adding another.'
const LINE_HELPER = 'Shown when someone opens your card. Not used to match introductions. Leave out email and phone.'

export function FocusFields({
  canHelp,
  canHelpLine,
  lookingFor,
  lookingForLine,
  languages,
  sectors,
  themes,
  onCanHelp,
  onCanHelpLine,
  onLookingFor,
  onLookingForLine,
  onLanguage,
  onTheme,
}: {
  canHelp: readonly string[]
  canHelpLine: string
  lookingFor: readonly string[]
  lookingForLine: string
  languages: readonly string[]
  sectors: readonly string[]
  themes: readonly string[]
  onCanHelp: (tag: string) => void
  onCanHelpLine: (value: string) => void
  onLookingFor: (tag: string) => void
  onLookingForLine: (value: string) => void
  onLanguage: (tag: string) => void
  onTheme: (tag: string) => void
}) {
  return (
    <div className="space-y-4">
      <QuestionCard
        id="profile-can-help"
        title="I can help with"
        count={`${canHelp.length} of ${MAX_FOCUS_CHIPS}`}
        full={canHelp.length >= MAX_FOCUS_CHIPS}
        help="Pick up to 3. These show on your directory card."
        options={CAN_HELP_WITH}
        selected={canHelp}
        max={MAX_FOCUS_CHIPS}
        onPick={onCanHelp}
        line={canHelpLine}
        onLine={onCanHelpLine}
        linePlaceholder="For example: introductions to energy operators in the GCC"
      />
      <QuestionCard
        id="profile-looking-for"
        title="I am looking for"
        count={`${lookingFor.length} of ${MAX_FOCUS_CHIPS}`}
        full={lookingFor.length >= MAX_FOCUS_CHIPS}
        help="Pick up to 3. A match with what another member can help with can be the reason for a weekly introduction."
        options={LOOKING_FOR}
        selected={lookingFor}
        max={MAX_FOCUS_CHIPS}
        onPick={onLookingFor}
        line={lookingForLine}
        onLine={onLookingForLine}
        linePlaceholder="For example: a board seat with a family-owned group"
      />
      <QuestionCard
        id="profile-languages"
        title="Languages"
        count={`${languages.length} selected`}
        full={false}
        help="Choose every language you work in. Shown on your card as a short list."
        options={LANGUAGES}
        selected={languages}
        max={LANGUAGES.length}
        onPick={onLanguage}
      />
      <VisionDisclosure sectors={sectors} themes={themes} onTheme={onTheme} />
    </div>
  )
}

function QuestionCard({
  id,
  title,
  count,
  full,
  help,
  options,
  selected,
  max,
  onPick,
  line,
  onLine,
  linePlaceholder,
}: {
  id: string
  title: string
  count: string
  full: boolean
  help: string
  options: readonly string[]
  selected: readonly string[]
  max: number
  onPick: (tag: string) => void
  line?: string
  onLine?: (value: string) => void
  linePlaceholder?: string
}) {
  const [limitNote, setLimitNote] = useState('')
  return (
    <section className="border border-[var(--ba-line)] bg-white px-4 py-4" data-focus-card={id}>
      <div className="flex items-start justify-between gap-3">
        <h3 id={`${id}-label`} className="text-[17px] font-semibold text-ink">
          {title}
        </h3>
        <CountPill full={full} label={count} />
      </div>
      <p id={`${id}-help`} className="mt-2 text-[15px] leading-relaxed text-ink/70">
        {help}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`}>
        {options.map((option) => {
          const pressed = selected.includes(option)
          const blocked = !pressed && selected.length >= max
          return (
            <FocusChip
              key={option}
              pressed={pressed}
              blocked={blocked}
              onClick={() => {
                if (blocked) {
                  setLimitNote(LIMIT_MESSAGE)
                  return
                }
                setLimitNote('')
                onPick(option)
              }}
            >
              {option}
            </FocusChip>
          )
        })}
      </div>
      {limitNote ? (
        <p className="mt-3 border border-[var(--ba-line)] bg-[var(--ba-porcelain)] px-3 py-3 text-[15px] leading-relaxed text-ink" role="status">
          {limitNote}
        </p>
      ) : null}
      {onLine && line !== undefined && linePlaceholder ? (
        <OptionalLine id={id} value={line} placeholder={linePlaceholder} onChange={onLine} />
      ) : null}
    </section>
  )
}

function OptionalLine({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  const [opened, setOpened] = useState(false)
  const shown = opened || value.length > 0
  const problem = focusLineProblem(value)
  if (!shown) {
    return (
      <button
        type="button"
        className="mt-3 inline-flex min-h-11 items-center text-[15px] font-semibold text-[var(--ba-indigo)]"
        onClick={() => setOpened(true)}
      >
        Add a line (optional)
      </button>
    )
  }
  const fieldId = `${id}-line`
  return (
    <div className="mt-4">
      <label className="block" htmlFor={fieldId}>
        <span className="text-[15px] font-semibold text-ink">One line about this (optional)</span>
        <textarea
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          maxLength={FOCUS_LINE_MAX}
          placeholder={placeholder}
          aria-describedby={`${fieldId}-help`}
          className="mt-2 w-full min-h-12 border border-[var(--ba-line)] bg-white px-3 py-3 text-[15px] text-ink outline-none placeholder:text-ink/40 focus:border-[var(--ba-indigo)]"
        />
      </label>
      <p id={`${fieldId}-help`} className="mt-2 text-[15px] leading-relaxed text-ink/70">
        {LINE_HELPER}
      </p>
      <p className="mt-1 text-[15px] text-ink/60">
        {value.length} of {FOCUS_LINE_MAX}
      </p>
      {problem ? (
        <p className="mt-2 text-[15px] text-ink" role="status">
          {problem}
        </p>
      ) : null}
    </div>
  )
}

function VisionDisclosure({
  sectors,
  themes,
  onTheme,
}: {
  sectors: readonly string[]
  themes: readonly string[]
  onTheme: (tag: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const [limitNote, setLimitNote] = useState('')
  const suggested = suggestedVisionThemes(sectors)
  const full = themes.length >= 3
  return (
    <section className="border border-[var(--ba-line)] bg-white" data-focus-card="profile-vision">
      <button
        type="button"
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-start"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="block text-[17px] font-semibold text-ink">Vision 2030 themes</span>
          <span className="mt-0.5 block text-[15px] text-ink/60">Optional</span>
        </span>
        <CountPill full={full} label={`${themes.length} of 3`} />
      </button>
      {open ? (
        <div className="border-t border-[var(--ba-line)] px-4 py-4">
          <p className="text-[15px] leading-relaxed text-ink/70">
            Add up to 3 if they help members understand your focus. Nothing is added for you.
          </p>
          <p className="mt-4 text-[15px] font-semibold text-ink">Suggested from your sectors</p>
          <ChipList
            options={suggested.length > 0 ? suggested : []}
            selected={themes}
            blocked={full}
            onPick={(tag) => pickTheme(tag, themes, onTheme, setLimitNote)}
          />
          {suggested.length === 0 ? (
            <p className="mt-2 text-[15px] text-ink/60">Choose a sector to see suggestions.</p>
          ) : null}
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center text-[15px] font-semibold text-[var(--ba-indigo)]"
            aria-expanded={all}
            onClick={() => setAll((value) => !value)}
          >
            {all ? 'Hide themes' : 'See all 12 themes'}
          </button>
          {all ? (
            <ChipList
              options={VISION_2030_THEMES}
              selected={themes}
              blocked={full}
              onPick={(tag) => pickTheme(tag, themes, onTheme, setLimitNote)}
            />
          ) : null}
          {limitNote ? (
            <p className="mt-3 border border-[var(--ba-line)] bg-[var(--ba-porcelain)] px-3 py-3 text-[15px] leading-relaxed text-ink" role="status">
              {limitNote}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function pickTheme(
  tag: string,
  themes: readonly string[],
  onTheme: (tag: string) => void,
  setLimitNote: (value: string) => void,
) {
  if (!themes.includes(tag) && themes.length >= 3) {
    setLimitNote(LIMIT_MESSAGE)
    return
  }
  setLimitNote('')
  onTheme(tag)
}

function ChipList({
  options,
  selected,
  blocked,
  onPick,
}: {
  options: readonly string[]
  selected: readonly string[]
  blocked: boolean
  onPick: (tag: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {options.map((option) => {
        const pressed = selected.includes(option)
        return (
          <FocusChip key={option} pressed={pressed} blocked={blocked && !pressed} onClick={() => onPick(option)}>
            {option}
          </FocusChip>
        )
      })}
    </div>
  )
}

function FocusChip({
  pressed,
  blocked,
  onClick,
  children,
}: {
  pressed: boolean
  blocked: boolean
  onClick: () => void
  children: string
}) {
  const tone = pressed
    ? 'bg-[var(--ba-indigo)] font-semibold text-[var(--ba-porcelain)]'
    : blocked
      ? 'border border-dashed border-[var(--ba-line)] bg-[var(--ba-porcelain)] text-[var(--ba-muted)]'
      : 'border border-[var(--ba-line)] bg-white text-ink'
  return (
    <button
      type="button"
      data-chip=""
      aria-pressed={pressed}
      aria-disabled={blocked || undefined}
      onClick={onClick}
      className={`inline-flex min-h-11 min-w-11 items-center gap-2 px-3 text-start text-[15px] ${tone}`}
    >
      {pressed ? <CheckIcon /> : null}
      {children}
    </button>
  )
}

function CountPill({ full, label }: { full: boolean; label: string }) {
  return (
    <span
      data-chip=""
      className={`inline-flex shrink-0 items-center px-3 py-1 text-[15px] font-semibold ${
        full ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'bg-[var(--ba-lavender)] text-ink'
      }`}
    >
      {label}
    </span>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden="true">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

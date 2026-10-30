import {
  CAN_HELP_WITH,
  LANGUAGES,
  LOOKING_FOR,
  LOOKING_FOR_TO_HELP,
  allowedChips,
} from '../../supabase/functions/_shared/focus_fields.ts'

export function directoryLanguageLine(languages: readonly string[]): string {
  const clean = allowedChips(languages, LANGUAGES, LANGUAGES.length)
  if (clean.length === 0) return ''
  const shown = clean.slice(0, 3)
  const extra = clean.length - shown.length
  const list = shown.join(', ')
  return extra > 0 ? `Languages ${list} +${extra} more` : `Languages ${list}`
}

export function matchingAsks(lookingFor: readonly string[], canHelp: readonly string[]): string[] {
  const offered = new Set(allowedChips(canHelp, CAN_HELP_WITH))
  return allowedChips(lookingFor, LOOKING_FOR).filter((ask) => {
    const help = LOOKING_FOR_TO_HELP[ask as (typeof LOOKING_FOR)[number]]
    return Boolean(help && offered.has(help))
  })
}

/** English chrome for the four AI tools. */

import {
  AI_TOOL_NAMES,
  AI_TOOL_ORDER,
  toolPath,
  type AiToolKey,
} from '../../supabase/functions/_shared/ai_tools.ts'

export const OFF_TOOL_LEAD = 'This tool is not open yet.'

/** Live tools only. A switched-off tool is never linked, including the one on screen. */
export function liveToolLinks(flags: Record<AiToolKey, boolean>, current: AiToolKey) {
  return AI_TOOL_ORDER.filter((key) => key !== current && flags[key] === true).map((key) => ({
    key,
    name: AI_TOOL_NAMES[key],
    to: toolPath(key),
  }))
}

export const AI_UI = {
  hub: 'AI tools',
  intro: 'Live tools only. Each one says what it checks and what it will not do.',
  empty: 'No checks are available yet.',
  emptyBody: 'When a check is turned on, it will appear here.',
  start: 'Start a check',
  preview: 'Preview',
  staffPreview: 'Staff preview',
  unavailableTitle: 'Not available',
  unavailable: OFF_TOOL_LEAD,
  upload: 'Upload',
  choose: 'Choose a file',
  fileHint: 'PDF, text, CSV, spreadsheet, or document. 15 MB max.',
  run: 'Run',
  running: 'Running',
  will: 'Will',
  willNot: 'Will not',
  allTools: 'All tools',
  prior: 'Prior notes',
  priorEmpty: 'No earlier checks yet. Run one when you are ready.',
  delete: 'Delete',
  findings: 'Findings',
  metrics: 'From your file',
  redFlags: 'Red flags',
  questions: 'Questions',
  sources: 'Sources',
  dated: 'Dated',
  status: 'Status',
  step: 'Step',
  queued: 'Queued',
  reading: 'Reading',
  checking: 'Checking',
  writing: 'Writing',
  ready: 'Ready',
  failed: 'Could not finish',
  intake: 'Intake',
  draft: 'Draft',
  done: 'Done',
  loadError: 'Could not load this tool. Retry.',
  retry: 'Retry',
  listError: 'Could not load the tool list. Retry.',
  loadingTools: 'Loading tools',
} as const

/** Per-run acknowledgement. Not stored. The longer tool consent stays separate. */
export const AI_OUTPUT_ACK =
  'I understand this is AI output, not legal, financial or investment advice.'

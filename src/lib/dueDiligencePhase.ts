export type DeskLoadState = 'loading' | 'ready' | 'denied' | 'error' | 'unavailable'

export type DeskPhase =
  | 'loading'
  | 'denied'
  | 'load-error'
  | 'running'
  | 'starting'
  | 'job-error'
  | 'file-chosen'
  | 'idle-empty'
  | 'idle'

/** Consecutive status polls that fail before the running bar is replaced. */
export const POLL_FAILURE_LIMIT = 3

export function nextPollFailures(previous: number, ok: boolean): { failures: number; giveUp: boolean } {
  if (ok) return { failures: 0, giveUp: false }
  const failures = previous + 1
  return { failures, giveUp: failures >= POLL_FAILURE_LIMIT }
}

/** One desk status at a time. An error never shares the panel with the empty state. */
export function deskPhase(input: {
  loadState: DeskLoadState
  activeJob: boolean
  jobError: boolean
  formError?: boolean
  fileChosen: boolean
  reportCount: number
  statusError?: boolean
  starting?: boolean
}): DeskPhase {
  if (input.loadState === 'loading') return 'loading'
  if (input.loadState === 'denied') return 'denied'
  if (input.loadState === 'error' || input.loadState === 'unavailable') return 'load-error'
  if (input.statusError) return 'job-error'
  if (input.activeJob) return 'running'
  if (input.starting) return 'starting'
  if (input.jobError || input.formError) return 'job-error'
  if (input.fileChosen) return 'file-chosen'
  if (input.reportCount === 0) return 'idle-empty'
  return 'idle'
}

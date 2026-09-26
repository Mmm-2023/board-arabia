export type DeskLoadState = 'loading' | 'ready' | 'denied' | 'error' | 'unavailable'

export type DeskPhase =
  | 'loading'
  | 'denied'
  | 'load-error'
  | 'running'
  | 'job-error'
  | 'file-chosen'
  | 'idle-empty'
  | 'idle'

/** One desk status at a time. An error never shares the panel with the empty state. */
export function deskPhase(input: {
  loadState: DeskLoadState
  activeJob: boolean
  jobError: boolean
  formError?: boolean
  fileChosen: boolean
  reportCount: number
}): DeskPhase {
  if (input.loadState === 'loading') return 'loading'
  if (input.loadState === 'denied') return 'denied'
  if (input.loadState === 'error' || input.loadState === 'unavailable') return 'load-error'
  if (input.activeJob) return 'running'
  if (input.jobError || input.formError) return 'job-error'
  if (input.fileChosen) return 'file-chosen'
  if (input.reportCount === 0) return 'idle-empty'
  return 'idle'
}

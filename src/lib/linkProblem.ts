import { memberEmailProblem, SIGN_IN_EMAIL, SIGN_IN_NETWORK, SIGN_IN_RESET_WAIT } from './signInNotice.ts'

export const LINK_PROBLEM_HEADING = 'That link did not work. Enter your email to get a new one.'
export const LINK_PROBLEM_SENT = 'If that address has an account, a link is on its way.'
export const LINK_PROBLEM_EMAIL = SIGN_IN_EMAIL
export const LINK_PROBLEM_WAIT = SIGN_IN_RESET_WAIT
export const LINK_PROBLEM_NETWORK = SIGN_IN_NETWORK
export const LINK_PROBLEM_COOLDOWN_MS = 60_000

export type LinkProblemCall = {
  ok: boolean
  status: number
  network?: boolean
}

export type LinkProblemResult =
  | { kind: 'sent'; text: typeof LINK_PROBLEM_SENT }
  | { kind: 'invalid'; text: typeof LINK_PROBLEM_EMAIL }
  | { kind: 'wait'; text: typeof LINK_PROBLEM_WAIT }
  | { kind: 'network'; text: typeof LINK_PROBLEM_NETWORK }

/**
 * Maps the existing request-password-reset reply onto one sentence.
 * The address is not an input, so every address gets the same result.
 */
export function presentLinkProblem(call: LinkProblemCall): LinkProblemResult {
  if (call.network || call.status === 0 || call.status >= 500) {
    return { kind: 'network', text: LINK_PROBLEM_NETWORK }
  }
  if (call.status === 429) {
    return { kind: 'wait', text: LINK_PROBLEM_WAIT }
  }
  if (!call.ok) {
    return { kind: 'invalid', text: LINK_PROBLEM_EMAIL }
  }
  return { kind: 'sent', text: LINK_PROBLEM_SENT }
}

export function linkProblemEmailProblem(value: string) {
  return memberEmailProblem(value)
}

export function linkProblemWaitUntil(now: number) {
  return now + LINK_PROBLEM_COOLDOWN_MS
}

export function linkProblemCooling(now: number, waitUntil: number) {
  return waitUntil > now
}

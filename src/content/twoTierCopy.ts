import type { ProcessStep } from './marketing.ts'

/** Line under the Apply for consideration button. */
export const CONSIDERATION_NOTE = 'Three short steps. No account needed yet.'

/** Visible heading on How it works. The document title stays for the locked prerender check. */
export const HOW_IT_WORKS_HEADING = 'Apply. Review. Create your account.'

export function howItWorksHeading(): string {
  return HOW_IT_WORKS_HEADING
}

export const NO_INSTANT_ACCOUNT_LINE =
  'No account is created until you are accepted. We email you a private link.'

/** The three public steps, verbatim from Brief A. */
export const PUBLIC_PROCESS_STEPS: ProcessStep[] = [
  {
    n: '01',
    title: 'Apply',
    home: 'Apply. Three short steps. Takes only your details and your board record.',
    detail: 'Apply. Three short steps. Takes only your details and your board record.',
  },
  {
    n: '02',
    title: 'Our admin team reviews',
    home: 'Our admin team reviews. A named person reads every application. There is no fixed response time.',
    detail: 'Our admin team reviews. A named person reads every application. There is no fixed response time.',
  },
  {
    n: '03',
    title: 'Create your account',
    home: 'Create your account. If you are accepted, we email you a private link. Your account is created then, not before.',
    detail:
      'Create your account. If you are accepted, we email you a private link. Your account is created then, not before.',
  },
]

export function publicProcessSteps(): ProcessStep[] {
  return PUBLIC_PROCESS_STEPS
}

export function instantAccountLine(): string {
  return NO_INSTANT_ACCOUNT_LINE
}

import { PROCESS_STEPS, type ProcessStep } from './marketing.ts'
import { isTwoTierRegisterEnabled } from '../lib/twoTierRegister.ts'

/** Approved How it works heading. It does not promise an account, so it ships with the flag off. */
export const HOW_IT_WORKS_HEADING = 'Register. Complete. Review.'

export const NO_INSTANT_ACCOUNT_LINE =
  'No instant account. Admission follows review and a conversation.'

export const ACCOUNT_OPENS_LINE = 'An account opens to look around. Membership follows review.'

export const CLOSING_CTA_BODY = 'Register for consideration. Membership is decided by the desk.'

export const LEGACY_CLOSING_BODY =
  'Submit the pre-vet. If you are accepted, the next step arrives by private email.'

export const LEGACY_CTA_BODY =
  'A pre-vet form. The desk reviews credentials. If you are accepted, the next step arrives by private email.'

/** Lines that promise the account flow. Hidden on public pages while the flag is off. */
export const ACCOUNT_FLOW_PROMISES = [
  'Start with an account',
  'An account opens',
  'after you confirm your email',
  'inside the account',
  'same sign-in',
] as const

export const ACCOUNT_FLOW_APPLY_ANSWER =
  'Register for consideration. An account opens so you can see how the membership works. The desk reviews every request personally.'

export const TWO_TIER_PROCESS_STEPS: ProcessStep[] = [
  {
    n: '01',
    title: 'Register for consideration',
    home: 'An account opens so you can see how the membership works.',
    detail: 'An account opens so you can see how the membership works.',
  },
  {
    n: '02',
    title: 'Complete your credentials',
    home: 'Complete your credentials inside the account.',
    detail: 'Complete your credentials inside the account.',
  },
  {
    n: '03',
    title: 'Request full membership',
    home: 'Request full membership.',
    detail: 'Request full membership.',
  },
  {
    n: '04',
    title: 'Desk review',
    home: 'The desk reviews every request personally; founding places may include a short conversation.',
    detail:
      'The desk reviews every request personally; founding places may include a short conversation.',
  },
  {
    n: '05',
    title: 'Approval',
    home: 'On approval, everything opens with the same sign-in.',
    detail: 'On approval, everything opens with the same sign-in.',
  },
]

export function publicProcessSteps(enabled = isTwoTierRegisterEnabled()): ProcessStep[] {
  return enabled ? TWO_TIER_PROCESS_STEPS : PROCESS_STEPS
}

export function instantAccountLine(enabled = isTwoTierRegisterEnabled()): string {
  return enabled ? ACCOUNT_OPENS_LINE : NO_INSTANT_ACCOUNT_LINE
}

export function closingCtaBody(enabled = isTwoTierRegisterEnabled(), legacy = LEGACY_CLOSING_BODY): string {
  return enabled ? CLOSING_CTA_BODY : legacy
}

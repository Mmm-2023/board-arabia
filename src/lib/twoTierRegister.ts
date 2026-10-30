/**
 * The two-tier register switch is removed.
 * Public consideration always opens /apply.
 * isTwoTierRegisterEnabled stays so locked callers still compile.
 * It always returns false, so staff Review stays off the phone tab.
 */

export function isTwoTierRegisterEnabled(): boolean {
  return false
}

/** Older tests call this. It cannot turn the switch back on. */
export function setTwoTierRegisterForTests(_value: boolean | null) {}

export type ConsiderationCta = {
  to: '/apply'
  label: 'Apply for consideration'
}

export function publicConsiderationCta(): ConsiderationCta {
  return { to: '/apply', label: 'Apply for consideration' }
}

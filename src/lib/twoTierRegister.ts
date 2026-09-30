/** Public register gate. Only the exact string true turns consideration CTAs onto /register. */

export function twoTierRegisterEnabled(flag: unknown): boolean {
  return flag === 'true'
}

const FROM_ENV = twoTierRegisterEnabled(import.meta.env?.VITE_TWO_TIER_REGISTER_ENABLED)

let testOverride: boolean | null = null

/** Tests flip the gate. Production reads the env string in this file only. */
export function setTwoTierRegisterForTests(value: boolean | null) {
  testOverride = value
}

export function isTwoTierRegisterEnabled(): boolean {
  return testOverride ?? FROM_ENV
}

export type ConsiderationCta = {
  to: '/apply' | '/register'
  label: 'Apply for consideration' | 'Register for consideration'
}

export function publicConsiderationCta(enabled = isTwoTierRegisterEnabled()): ConsiderationCta {
  if (enabled) return { to: '/register', label: 'Register for consideration' }
  return { to: '/apply', label: 'Apply for consideration' }
}

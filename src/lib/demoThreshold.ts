/**
 * Proposed demo thresholds. The live switch is public.demo_thresholds,
 * read only by server functions.
 * Directory, mandates, rooms, and partners are set in the demo seed migration.
 * Real estate opportunities and partners are added in the real estate migration.
 * Board roles are added in the board roles migration.
 * Demos stay visible while the real count is below the threshold.
 * At the threshold, the server returns real rows only.
 */
export const DEMO_THRESHOLD_DEFAULTS = {
  directory: 12,
  mandates: 6,
  rooms: 4,
  partners: 3,
  re_opportunities: 5,
  re_partners: 3,
  re_board_roles: 3,
} as const

export type DemoSurface = keyof typeof DEMO_THRESHOLD_DEFAULTS

export function demoRowsVisible(realCount: number, threshold: number): boolean {
  if (!Number.isInteger(realCount) || realCount < 0) return false
  if (!Number.isInteger(threshold) || threshold < 0) return false
  return realCount < threshold
}

import { isPartnerLogoPath } from './partnerLogo.ts'

/** Members see sample rows only while every published row is a sample. */
export function visibleMemberPartners<T extends { is_demo: boolean }>(rows: readonly T[]): T[] {
  const real = rows.some((row) => !row.is_demo)
  return real ? rows.filter((row) => !row.is_demo) : [...rows]
}

/** Public landing: real rows that already have a logo. Samples never qualify. */
export function publicGalleryPartners<T extends { is_demo: boolean; logo_path?: string | null }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => !row.is_demo && isPartnerLogoPath(row.logo_path))
}

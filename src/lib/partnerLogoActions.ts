import { PARTNER_LOGO_BUCKET } from './partnerLogo.ts'

export const PARTNER_LOGO_SAVE_ERROR = 'We could not save that. Please try again.'
export const PARTNER_LOGO_AAL_ERROR = 'Please sign in again with two-step verification to change logos.'

export type PartnerLogoRemoveResult = {
  data: { name: string }[] | null
  error: { message: string } | null
}

export type PartnerLogoClient = {
  upload(
    path: string,
    bytes: Uint8Array,
    options: { upsert: true; contentType: string; cacheControl: string },
  ): Promise<{ error: { message: string } | null }>
  remove(paths: string[]): Promise<PartnerLogoRemoveResult>
  setLogo(partnerId: string, logoPath: string | null): Promise<{ error: { message: string; code?: string } | null }>
}

export function partnerLogoObjectPath(partnerId: string): string {
  return `${partnerId}/logo`
}

export function partnerLogoBucket(): string {
  return PARTNER_LOGO_BUCKET
}

/** Upload or replace the logo object, then store that path on the partner row. */
export async function savePartnerLogo(
  client: PartnerLogoClient,
  partnerId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  const path = partnerLogoObjectPath(partnerId)
  const uploaded = await client.upload(path, bytes, {
    upsert: true,
    contentType,
    cacheControl: '3600',
  })
  if (uploaded.error) return PARTNER_LOGO_SAVE_ERROR
  const saved = await client.setLogo(partnerId, path)
  if (saved.error) return PARTNER_LOGO_SAVE_ERROR
  return null
}

/** Staff refusal from staff_set_trusted_partner_logo. aal1 raises not_allowed with 42501. */
export function logoUpdateRefused(error: { message: string; code?: string }): boolean {
  const blob = `${error.code ?? ''} ${error.message}`.toLowerCase()
  return (
    blob.includes('42501') ||
    blob.includes('not authorized') ||
    blob.includes('insufficient privilege') ||
    blob.includes('permission denied') ||
    blob.includes('not_allowed')
  )
}

/**
 * Delete the storage object, then clear the partner row.
 * An empty remove list is also what storage returns when the file is already gone,
 * so the row update still runs. That RPC refuses aal1. A storage error stops first.
 */
export async function removePartnerLogo(client: PartnerLogoClient, partnerId: string): Promise<string | null> {
  const path = partnerLogoObjectPath(partnerId)
  const removed = await client.remove([path])
  if (removed.error) return PARTNER_LOGO_SAVE_ERROR
  const saved = await client.setLogo(partnerId, null)
  if (saved.error) return logoUpdateRefused(saved.error) ? PARTNER_LOGO_AAL_ERROR : PARTNER_LOGO_SAVE_ERROR
  return null
}

import { PARTNER_LOGO_BUCKET } from './partnerLogo.ts'

export const PARTNER_LOGO_SAVE_ERROR = 'We could not save that. Please try again.'

export type PartnerLogoClient = {
  upload(
    path: string,
    bytes: Uint8Array,
    options: { upsert: true; contentType: string; cacheControl: string },
  ): Promise<{ error: { message: string } | null }>
  remove(paths: string[]): Promise<{ error: { message: string } | null }>
  setLogo(partnerId: string, logoPath: string | null): Promise<{ error: { message: string } | null }>
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

/** Delete the storage object, then clear the partner row. A failed delete leaves the row unchanged. */
export async function removePartnerLogo(client: PartnerLogoClient, partnerId: string): Promise<string | null> {
  const path = partnerLogoObjectPath(partnerId)
  const removed = await client.remove([path])
  if (removed.error) return PARTNER_LOGO_SAVE_ERROR
  const saved = await client.setLogo(partnerId, null)
  if (saved.error) return PARTNER_LOGO_SAVE_ERROR
  return null
}

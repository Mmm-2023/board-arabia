const OWN_DECK =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/source\.(pdf|pptx)$/i

/** Path the owner may remove. A different member prefix is refused. */
export function ownDeckPath(data: unknown, ownerId: string): string | null {
  if (!data || typeof data !== 'object') return null
  const path = (data as { storage_path?: unknown }).storage_path
  if (typeof path !== 'string') return null
  const match = OWN_DECK.exec(path)
  if (!match || match[1]?.toLowerCase() !== ownerId.toLowerCase()) return null
  return path
}

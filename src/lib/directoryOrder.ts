/** Client-side directory order. Sorts only the cards list_directory already returned. */

export type DirectoryOrderCard = {
  id: string
  is_demo: boolean
  membership_status?: 'invited' | 'active' | null
}

/**
 * Own card, then admitted members, then invited cards.
 * Sample cards stay together, in the order they arrived, after real cards.
 * That is the list_directory demo_flag place rule, applied without a migration.
 */
export function orderDirectoryCards<T extends DirectoryOrderCard>(cards: readonly T[], selfId: string | null): T[] {
  const samples: T[] = []
  const self: T[] = []
  const admitted: T[] = []
  const invited: T[] = []
  for (const card of cards) {
    if (card.is_demo) {
      samples.push(card)
      continue
    }
    if (selfId != null && card.id === selfId) {
      self.push(card)
      continue
    }
    if (card.membership_status === 'invited') invited.push(card)
    else admitted.push(card)
  }
  return [...self, ...admitted, ...invited, ...samples]
}

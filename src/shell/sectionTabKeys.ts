/** Arrow, Home, and End movement for the hub sub-tab links. */
export function nextSectionTabIndex(key: string, index: number, count: number): number | null {
  if (count < 1 || index < 0 || index >= count) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowLeft') return (index - 1 + count) % count
  return null
}

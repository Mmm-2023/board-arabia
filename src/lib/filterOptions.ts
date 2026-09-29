/** Chip order: known catalog first, then any extra value already on the loaded rows. */

export function uniqueValues(values: readonly string[]) {
  const next: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || next.includes(trimmed)) continue
    next.push(trimmed)
  }
  return next
}

export function optionsInCatalog(present: readonly string[], catalog: readonly string[]) {
  const ordered = catalog.filter((item) => present.includes(item))
  for (const item of present) {
    if (item && !ordered.includes(item)) ordered.push(item)
  }
  return ordered
}

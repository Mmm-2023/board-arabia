/** Visible card meta. Blank parts drop out, and so do the separators around them. */

export function joinCardMeta(parts: readonly (string | null | undefined)[]): string[] {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
}

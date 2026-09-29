/** Sample cards stay on screen. Their actions do not run. */

export const SAMPLE_NOTE = 'Sample'

export function sampleRow(rows: readonly { id: string; is_demo: boolean }[], id: string): boolean {
  return rows.some((row) => row.id === id && row.is_demo)
}

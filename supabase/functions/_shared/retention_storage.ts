/** Storage path checks for the retention sweep. SQL lists the paths. This deletes them. */

export const DD_DECK_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/source\.(pdf|pptx)$/i

export function ddDeckPathOk(path: string): boolean {
  return DD_DECK_PATH.test(path) && !path.includes('..')
}

export async function purgeStoragePaths(
  remove: (path: string) => Promise<boolean>,
  clearQueue: (path: string) => Promise<boolean>,
  paths: string[],
  accept: (path: string) => boolean,
): Promise<{ removed: number; failed: boolean; removedPaths: string[] }> {
  let removed = 0
  let failed = false
  const removedPaths: string[] = []
  for (const path of paths) {
    if (!accept(path)) {
      failed = true
      continue
    }
    const gone = await remove(path)
    if (!gone) {
      failed = true
      continue
    }
    const cleared = await clearQueue(path)
    if (!cleared) {
      failed = true
      continue
    }
    removed += 1
    removedPaths.push(path)
  }
  return { removed, failed, removedPaths }
}

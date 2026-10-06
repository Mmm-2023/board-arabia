/**
 * Storage path checks for the retention sweep. SQL lists the paths. This deletes them.
 * Orphan files in the buckets this sweep already deletes from are reported every run.
 * They are removed only when the request is not dry_run and purge_orphans=1.
 */

import { safeStoragePath } from './ai_tools.ts'
import { aiToolRetentionDue } from './retention_plan.ts'

export const DD_DECK_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/source\.(pdf|pptx)$/i

export const SWEEP_FILE_BUCKETS = ['ai-tool-uploads', 'due-diligence-decks'] as const

export type StorageOrphan = { bucket: string; path: string }

export function orphanPurgeEnabled(url: string): boolean {
  const params = new URL(url).searchParams
  return params.get('dry_run') !== '1' && params.get('purge_orphans') === '1'
}

export function planStorageOrphans(input: {
  objects: { bucket: string; path: string; createdAt: string | null }[]
  ownedPaths: { bucket: string; path: string }[]
  retentionDays: number
  now: Date
  purge: boolean
}): { report: StorageOrphan[]; remove: StorageOrphan[] } {
  const owned = new Set(input.ownedPaths.map((item) => `${item.bucket}\n${item.path}`))
  const report: StorageOrphan[] = []
  for (const object of input.objects) {
    if (!sweepObjectPathOk(object.bucket, object.path)) continue
    if (owned.has(`${object.bucket}\n${object.path}`)) continue
    if (!aiToolRetentionDue(object.createdAt ?? '', input.retentionDays, input.now)) continue
    report.push({ bucket: object.bucket, path: object.path })
  }
  report.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.path.localeCompare(b.path))
  return { report, remove: input.purge ? report.map((item) => ({ ...item })) : [] }
}

function sweepObjectPathOk(bucket: string, path: string): boolean {
  if (bucket === 'ai-tool-uploads') return safeStoragePath(path)
  if (bucket === 'due-diligence-decks') return ddDeckPathOk(path)
  return false
}

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

/** Public preview gate. One dwell constant. Visitors only. */

export const PREVIEW_DWELL_SECONDS = 8

export const PREVIEW_LOCK_KEY = 'ba-preview-lock'

/** A sliver of the frame does not count as viewing it. */
export const PREVIEW_VIEW_MIN_PX = 80

export type PreviewLockStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type PreviewSight = {
  inView: boolean
  scrolledPast: boolean
}

export function isPreviewMember(status: string | null | undefined): boolean {
  return status === 'active' || status === 'invited'
}

export function readPreviewLock(storage: PreviewLockStorage | null): boolean {
  if (!storage) return false
  return storage.getItem(PREVIEW_LOCK_KEY) === '1'
}

export function writePreviewLock(storage: PreviewLockStorage | null): void {
  storage?.setItem(PREVIEW_LOCK_KEY, '1')
}

/** Members stay open, even when this tab already stored a visitor lock. */
export function openingLock(input: { member: boolean; stored: boolean }): boolean {
  if (input.member) return false
  return input.stored
}

export function previewVisibility(input: {
  isIntersecting: boolean
  intersectionHeight: number
  bottom: number
}): PreviewSight {
  return {
    inView: input.isIntersecting && input.intersectionHeight >= PREVIEW_VIEW_MIN_PX,
    scrolledPast: !input.isIntersecting && input.bottom <= 0,
  }
}

/** Blur is instant when the visitor asks for reduced motion. */
export function lockBlurClass(reduceMotion: boolean): string {
  const base = 'blur-md pointer-events-none select-none'
  if (reduceMotion) return base
  return `${base} transition-[filter] duration-300`
}

export function attachPreviewLock(options: {
  member: boolean
  storage: PreviewLockStorage | null
  onLock: () => void
  observe: (report: (sight: PreviewSight) => void) => () => void
  dwellMs?: number
}): () => void {
  if (options.member) return () => {}
  if (readPreviewLock(options.storage)) {
    options.onLock()
    return () => {}
  }

  const dwellMs = options.dwellMs ?? PREVIEW_DWELL_SECONDS * 1000
  let timer: ReturnType<typeof setTimeout> | null = null
  let locked = false

  function lock() {
    if (locked) return
    locked = true
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    writePreviewLock(options.storage)
    options.onLock()
  }

  const stopObserve = options.observe((sight) => {
    if (locked) return
    if (sight.scrolledPast) {
      lock()
      return
    }
    if (sight.inView) {
      if (timer == null) {
        timer = setTimeout(() => {
          timer = null
          lock()
        }, dwellMs)
      }
      return
    }
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  })

  return () => {
    if (timer != null) clearTimeout(timer)
    stopObserve()
  }
}

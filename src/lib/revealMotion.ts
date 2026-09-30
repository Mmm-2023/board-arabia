/** Hide reveal targets only after this class is on the document element. */
export const MOTION_ROOT_CLASS = 'ba-motion'

/** If an observer never fires, reveal every waiting node. */
export const REVEAL_FAILSAFE_MS = 1000

export type ClassListLike = {
  contains(name: string): boolean
  add(name: string): void
}

export type RevealNode = {
  classList: ClassListLike
}

/**
 * Motion may hide content only when script, observers, and motion are all available.
 * Otherwise the node stays in its default visible state.
 */
export function revealShouldHide(opts: { motion: boolean; inView: boolean; failed: boolean }): boolean {
  return opts.motion && !opts.inView && !opts.failed
}

/** Mark every still-hidden reveal or diagram node as shown. */
export function revealUnseen(nodes: Iterable<RevealNode>) {
  for (const node of nodes) {
    if (!node.classList.contains('is-in')) node.classList.add('is-in')
  }
}

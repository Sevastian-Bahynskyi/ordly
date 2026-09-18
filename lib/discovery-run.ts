/**
 * The state rules for a whole-vocabulary discovery run.
 *
 * Pure on purpose. The first version of this lived inline in the component as
 * `if (!targets.length || discovery) return`, which left the button permanently dead once a run
 * had stopped: `discovery` stayed truthy, so every later tap returned before doing anything.
 * iOS suspends the page the moment Ordly leaves the screen, so stopping is the normal case, not
 * the rare one — and it has to be resumable.
 */

export interface DiscoveryRun {
  done: number
  total: number
  /** Why the run ended early. Absent while it is still going. */
  stopped?: string
}

/** A live run swallows a second tap; a stopped one is meant to be tapped again. */
export function canStartDiscovery(run: DiscoveryRun | null | undefined, total: number): boolean {
  if (total <= 0) return false
  return !run || Boolean(run.stopped)
}

/**
 * Where a run should pick up. Resuming from the cursor is what stops a restart paying the AI
 * for entries the previous attempt already finished.
 */
export function discoveryStartIndex(
  run: DiscoveryRun | null | undefined,
  cursor: number,
  total: number,
): number {
  if (!run?.stopped) return 0
  if (!Number.isFinite(cursor) || cursor < 0 || cursor >= total) return 0
  return Math.floor(cursor)
}

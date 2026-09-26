import { seededRandom, shuffled } from './catalog-audit'
import type { ItemKind } from './content-estimate'

/**
 * The seeded audit of a pipeline batch (issue #27): a sample of the items that passed the reviews
 * and the gate, read in full by an auditor before anything is loaded. Every kind of item present
 * gets a share of the sample (at least three, or all of them), the rest proportional to its size.
 * The batch passes at 95% clean with no severe finding, the bar every earlier content batch met.
 */
export type AuditVerdict = 'clean' | 'minor' | 'severe'
export interface AuditEntry { id: string; kind: ItemKind; verdict: AuditVerdict | null; note: string }

export const AUDIT_BAR = 0.95

export function drawBatchAudit(items: readonly { id: string; kind: ItemKind }[], options: { seed: number; size: number }): AuditEntry[] {
  const random = seededRandom(options.seed)
  const byKind = new Map<ItemKind, { id: string; kind: ItemKind }[]>()
  for (const item of items) byKind.set(item.kind, [...(byKind.get(item.kind) || []), item])
  const size = Math.min(options.size, items.length)
  const quotas = new Map<ItemKind, number>()
  for (const [kind, group] of byKind) quotas.set(kind, Math.min(group.length, 3))
  let left = size - [...quotas.values()].reduce((sum, value) => sum + value, 0)
  for (const [kind, group] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    const extra = Math.min(group.length - (quotas.get(kind) ?? 0), Math.max(0, Math.round((group.length / items.length) * size) - (quotas.get(kind) ?? 0)), Math.max(0, left))
    quotas.set(kind, (quotas.get(kind) ?? 0) + extra)
    left -= extra
  }
  // Rounding can leave a few places: they go to whichever kind still has unsampled items.
  for (const [kind, group] of byKind) {
    const extra = Math.min(group.length - (quotas.get(kind) ?? 0), Math.max(0, left))
    quotas.set(kind, (quotas.get(kind) ?? 0) + extra)
    left -= extra
  }
  const sample: AuditEntry[] = []
  for (const [kind, group] of [...byKind].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const item of shuffled(group, random).slice(0, quotas.get(kind))) sample.push({ id: item.id, kind, verdict: null, note: '' })
  }
  return sample
}

export interface AuditTally { total: number; judged: number; clean: number; severe: number; rate: number; complete: boolean; pass: boolean }

export function tallyBatchAudit(entries: readonly AuditEntry[]): AuditTally {
  const judged = entries.filter((entry) => entry.verdict !== null)
  const clean = judged.filter((entry) => entry.verdict === 'clean').length
  const severe = judged.filter((entry) => entry.verdict === 'severe').length
  const complete = judged.length === entries.length && entries.length > 0
  const rate = judged.length ? clean / judged.length : 0
  return { total: entries.length, judged: judged.length, clean, severe, rate, complete, pass: complete && rate >= AUDIT_BAR && severe === 0 }
}

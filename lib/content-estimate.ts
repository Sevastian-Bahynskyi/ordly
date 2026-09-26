import { priceCall, type LedgerLine, type RunRecord, type Service } from './content-ledger'

/**
 * Cost estimates for a content batch before it runs (issue #27).
 *
 * A batch is a number of work units — an `entry` (one catalog headword or phrase: its meanings and
 * examples) or a `family` (one sentence family: its sentences) — and a profile says what one unit
 * of each kind cost when it was measured: the tokens, characters and seconds of every paid op,
 * summed over a calibration run and divided by its units. An estimate scales those quantities to
 * the batch and prices them at today's list prices, so a price change needs no new calibration.
 */
export type UnitType = 'entry' | 'family'
export type ItemKind = 'meaning' | 'example' | 'sentence'

export interface UnitProfile {
  units: number
  /** Reviewed items those units produced. */
  items: Partial<Record<ItemKind, number>>
  /** Summed quantities per op over the measured units (`usd` as recorded, for reference). */
  lines: LedgerLine[]
}

export interface CostProfile {
  /** The calibration batch (or prior) the numbers come from. */
  source: string
  measuredAt: string
  units: Partial<Record<UnitType, UnitProfile>>
}

export interface BatchEstimate {
  usd: number
  byService: Record<Service, number>
  byUnit: Partial<Record<UnitType, number>>
  items: Partial<Record<ItemKind, number>>
}

/** A profile from the ledger records of one measured batch. */
export function profileFromRuns(runs: readonly RunRecord[], counts: Partial<Record<UnitType, { units: number; items: Partial<Record<ItemKind, number>> }>>, source: string, measuredAt = new Date().toISOString()): CostProfile {
  const units: Partial<Record<UnitType, UnitProfile>> = {}
  for (const [type, count] of Object.entries(counts) as [UnitType, { units: number; items: Partial<Record<ItemKind, number>> }][]) {
    if (!count.units) continue
    const lines = new Map<string, LedgerLine>()
    for (const line of runs.flatMap((record) => record.lines).filter((entry) => entry.scope === type)) {
      const key = `${line.op}|${line.model ?? ''}`
      const sum = lines.get(key) || { ...line, calls: 0, inputTokens: 0, outputTokens: 0, chars: 0, seconds: 0, usd: 0 }
      sum.calls += line.calls
      sum.inputTokens += line.inputTokens
      sum.outputTokens += line.outputTokens
      sum.chars += line.chars
      sum.seconds += line.seconds
      sum.usd += line.usd
      lines.set(key, sum)
    }
    units[type] = { units: count.units, items: count.items, lines: [...lines.values()] }
  }
  return { source, measuredAt, units }
}

export function estimateBatch(counts: Partial<Record<UnitType, number>>, profile: CostProfile, options: { audio: boolean }): BatchEstimate {
  const estimate: BatchEstimate = { usd: 0, byService: { deepseek: 0, translator: 0, speech: 0 }, byUnit: {}, items: {} }
  for (const [type, count] of Object.entries(counts) as [UnitType, number][]) {
    if (!count) continue
    const measured = profile.units[type]
    if (!measured?.units) throw new Error(`the cost profile (${profile.source}) has no measured ${type} units; calibrate first`)
    const scale = count / measured.units
    let unitUsd = 0
    for (const line of measured.lines) {
      if (line.service === 'speech' && !options.audio) continue
      const usd = priceCall({ op: line.op, inputTokens: line.inputTokens * scale, outputTokens: line.outputTokens * scale, chars: line.chars * scale, seconds: line.seconds * scale })
      estimate.byService[line.service] += usd
      unitUsd += usd
    }
    estimate.byUnit[type] = unitUsd
    estimate.usd += unitUsd
    for (const [kind, items] of Object.entries(measured.items) as [ItemKind, number][]) estimate.items[kind] = (estimate.items[kind] ?? 0) + Math.round(items * scale)
  }
  return estimate
}

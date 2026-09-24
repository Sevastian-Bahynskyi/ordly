import { createHash } from 'node:crypto'
import { activeSenses, normalizeSenseText, parseSenses } from './senses'
import type { EntrySense, VocabularyEntry } from './types'
import type { PracticeTask } from './practice'

/**
 * What a sense target was built from (D15): the entry's Danish, the sense id and that sense's own
 * normalized text — nothing else. Adding, removing, reordering or re-exemplifying *another*
 * meaning leaves it untouched. Only a change to the Danish or to this meaning itself makes it a
 * different target, and a queued exercise built from the old version is dropped.
 */
export function senseContentVersion(entry: Pick<VocabularyEntry, 'danish' | 'entry_kind'>, sense: Pick<EntrySense, 'id' | 'text'>): string {
  return createHash('sha256').update(JSON.stringify(['sense-v1', entry.danish, entry.entry_kind, sense.id, normalizeSenseText(sense.text)])).digest('hex')
}

/** The version a queued exercise must still match; null once its sense is gone. */
export function currentTaskContentVersion(entry: Pick<VocabularyEntry, 'danish' | 'entry_kind'> & { senses?: unknown }, task: Pick<PracticeTask, 'senseId'>): string | null {
  const sense = activeSenses(parseSenses(entry.senses)).find((candidate) => candidate.id === task.senseId)
  return sense ? senseContentVersion(entry, sense) : null
}

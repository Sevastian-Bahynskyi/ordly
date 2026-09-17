import { createHash } from 'node:crypto'
import { activeSenses, normalizeSenseText, parseSenses, translationFromSenses } from './senses'
import type { EntrySense, ReviewItem, VocabularyEntry } from './types'
import type { PracticeTask } from './practice'

/**
 * What an entry-level task was built from. A stored objective whose version no longer matches is
 * treated as a different target and its FSRS state is not reused.
 *
 * `source: 'user'` senses are left out of the meaning text. They come from `My answer was right`,
 * which accepts an answer the learner already gave — it teaches nothing new, so it must not reset
 * the schedule of the entry the learner just proved they know. A row with no stored senses still
 * hashes its `translation`, which is what every version written before the senses model used.
 */
export function entryContentVersion(entry: Pick<VocabularyEntry, 'danish' | 'translation' | 'example_sentence' | 'entry_kind'> & { senses?: unknown }): string {
  const stored = parseSenses(entry.senses)
  const meaning = stored.length ? translationFromSenses(stored.filter((sense) => sense.source !== 'user')) : entry.translation
  return createHash('sha256').update(JSON.stringify([entry.danish, meaning, entry.example_sentence, entry.entry_kind])).digest('hex')
}

/**
 * What a sense objective was built from (D15): the entry's Danish, the sense id and that sense's
 * own normalized text — nothing else. Adding, removing, reordering or re-exemplifying *another*
 * meaning leaves it untouched, so the objective keeps its schedule. Only a change to the Danish or
 * to this meaning itself makes it a different target.
 */
export function senseContentVersion(entry: Pick<VocabularyEntry, 'danish' | 'entry_kind'>, sense: Pick<EntrySense, 'id' | 'text'>): string {
  return createHash('sha256').update(JSON.stringify(['sense-v1', entry.danish, entry.entry_kind, sense.id, normalizeSenseText(sense.text)])).digest('hex')
}

/**
 * The version a queued task must still match against the entry as it is now. A sense task is
 * checked against its own sense, which must still be live; anything else against the entry.
 */
export function currentTaskContentVersion(entry: Parameters<typeof entryContentVersion>[0], task: Pick<PracticeTask, 'senseId'>): string | null {
  if (!task.senseId) return entryContentVersion(entry)
  const sense = activeSenses(parseSenses(entry.senses)).find((candidate) => candidate.id === task.senseId)
  return sense ? senseContentVersion(entry, sense) : null
}

export function vocabularyTask(item: ReviewItem, objective: 'meaning' | 'production'): PracticeTask {
  const entry = item.vocabulary_entries
  return {
    id: `${entry.id}:${objective}`, targetKey: entry.id, entryId: entry.id, objective,
    kind: objective === 'meaning' ? 'recall' : 'produce', stage: 'remember',
    prompt: objective === 'meaning' ? entry.danish : entry.translation || '',
    answer: objective === 'meaning' ? entry.translation || '' : entry.danish,
    danish: entry.danish, translation: entry.translation || '',
    hint: objective === 'meaning' ? entry.example_sentence || 'Try recalling the situation where you saved this.' : `${entry.danish.slice(0, 1)}…`,
    example: entry.example_sentence || entry.danish, audioText: null,
    source: 'saved', newTarget: item.reps === 0, retry: 0,
    answerIsSentence: entry.entry_kind === 'sentence', cardId: objective === 'meaning' ? item.id : undefined, contentVersion: entryContentVersion(entry),
  }
}

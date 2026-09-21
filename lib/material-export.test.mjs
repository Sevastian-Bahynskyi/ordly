import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMaterialCsv } from './material-export.ts'

const entry = {
  id: 'entry-1', user_id: 'user-1', danish: 'god morgen', pronunciation: 'го морн', audio_path: null,
  translation: 'доброе утро', senses: [{ id: 'sense-1', text: 'доброе утро', pos: 'phrase', gender: null, note: null, example: null, example_translation: null, source: 'user', locked: false, coverage: { recognized: 2, produced: 1, last_seen: '2026-09-20T10:00:00.000Z' }, created_at: '2026-09-01T10:00:00.000Z', removed_at: null }],
  example_sentence: 'God morgen, Anna.', example_translation: 'Доброе утро, Анна.', icon_name: null, catalog_lemma: null,
  entry_kind: 'word', learning_status: 'learning', familiarity: 3, ai_enriched: true, created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-20T10:00:00.000Z',
}

test('exports words and phrases with escaped history, but excludes sentences', () => {
  const csv = buildMaterialCsv({
    entries: [entry, { ...entry, id: 'sentence-1', danish: 'Det er morgen.', entry_kind: 'sentence' }],
    cards: [{ id: 'card-1', user_id: 'user-1', entry_id: 'entry-1', due: '2026-09-25T10:00:00.000Z', stability: 5, difficulty: 4, elapsed_days: 1, scheduled_days: 5, reps: 2, lapses: 0, learning_steps: 0, state: 2, last_review: '2026-09-20T10:00:00.000Z' }],
    reviewLogs: [{ entryId: 'entry-1', rating: 3, answerResult: 'correct', answerText: 'доброе, утро', previousState: 1, stability: 5, difficulty: 4, scheduledDays: 5, reviewedAt: '2026-09-20T10:00:00.000Z', studyDate: '2026-09-20' }],
    practiceAttempts: [{ entryId: 'entry-1', at: '2026-09-20T11:00:00.000Z', kind: 'pick', objective: 'meaning', result: 'correct', rating: null, assistance: 'choices', modality: 'typed', responseMs: 850, replays: 0 }],
    exportedAt: new Date('2026-09-21T10:00:00.000Z'),
  })

  assert.match(csv, /^\uFEFFexport_format,/)
  assert.match(csv, /phrase,entry-1,/) 
  assert.doesNotMatch(csv, /sentence-1/)
  assert.match(csv, /"\[{""reviewed_at"":""2026-09-20T10:00:00.000Z""/)
})

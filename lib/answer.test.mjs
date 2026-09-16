import assert from 'node:assert/strict'
import test from 'node:test'
import { checkAnswer } from './answer.ts'
import { createSense, splitTranslationIntoSenses } from './senses.ts'
import { normalizeMeaningFeedback } from './practice-ai.ts'

test('does not accept a different short word or a meaning-changing sentence as a typo', () => {
  assert.equal(checkAnswer('en', 'er'), 'incorrect')
  assert.equal(checkAnswer('Jeg er sikker', 'Jeg er ikke sikker', { sentence: true }), 'incorrect')
  assert.equal(checkAnswer('Jeg synes, det er svært.', 'Jeg synes, det er svært.', { sentence: true }), 'correct')
  assert.equal(checkAnswer('сложно', 'трудно, сложно'), 'correct')
})

test('accepts Cyrillic spelling variants for meaning recall without weakening Danish checks', () => {
  assert.equal(checkAnswer('обяснять', 'объяснять', { meaning: true }), 'correct')
  assert.equal(checkAnswer('все еще', 'всё ещё', { meaning: true }), 'correct')
  assert.equal(checkAnswer('не знаю', 'знаю', { meaning: true }), 'incorrect')
  assert.equal(checkAnswer('en', 'er'), 'incorrect')
})

test('meaning recall accepts understood wording without imposing a Danish production target', () => {
  const feedback = { result: 'mostly', communication: 'yes', target: 'no', feedback: 'Use å instead of a.' }
  assert.deepEqual(normalizeMeaningFeedback(feedback, 'recall'), {
    result: 'correct', communication: 'yes', target: 'yes', feedback: 'Meaning recalled. Your wording is accepted.',
  })
  assert.deepEqual(normalizeMeaningFeedback(feedback, 'produce'), feedback)
  const wrong = { ...feedback, result: 'incorrect', communication: 'no' }
  assert.deepEqual(normalizeMeaningFeedback(wrong, 'recall'), wrong)
})

test('any non-removed sense is accepted, and the relaxed fallbacks still apply to senses', () => {
  const senses = [
    createSense('трудно', { source: 'split' }),
    createSense('тяжело', { source: 'ai' }),
    createSense('нудно', { source: 'ai', removed_at: '2026-09-16T10:00:00Z' }),
  ]

  // The denormalized translation no longer lists тяжело; the sense does.
  assert.equal(checkAnswer('тяжело', 'трудно, сложно', { senses }), 'correct')
  assert.equal(checkAnswer('трудно', 'трудно, сложно', { senses }), 'correct')
  assert.equal(checkAnswer('сложно', 'трудно, сложно', { senses }), 'correct')
  assert.equal(checkAnswer('нудно', 'трудно, сложно', { senses }), 'incorrect', 'a soft-deleted sense is not an answer')
  assert.equal(checkAnswer('тяжело', 'трудно, сложно'), 'incorrect', 'senses are opt-in; nothing changes without them')

  // æ/ø/å relaxation and the Cyrillic spelling fallback still reach sense texts.
  assert.equal(checkAnswer('sode', 'noget', { senses: [createSense('søde')] }), 'mostly')
  assert.equal(checkAnswer('saert', 'noget', { senses: [createSense('sært')] }), 'mostly')
  assert.equal(checkAnswer('все еще', 'знаю', { meaning: true, senses: [createSense('всё ещё')] }), 'correct')
  assert.equal(checkAnswer('', 'трудно', { senses }), 'incorrect')
  assert.equal(checkAnswer('тяжело', 'трудно', { senses: null }), 'incorrect')
})

test('senses of synonym-linked entries are accepted, and only when they are passed in', () => {
  const senses = [createSense('трудно', { source: 'split' })]
  const linkedSenses = [
    createSense('тяжело', { source: 'ai' }),
    createSense('нудно', { source: 'ai', removed_at: '2026-09-16T10:00:00Z' }),
  ]

  assert.equal(checkAnswer('тяжело', 'трудно', { senses, linkedSenses }), 'correct')
  assert.equal(checkAnswer('нудно', 'трудно', { senses, linkedSenses }), 'incorrect', 'a removed linked sense is not an answer')
  assert.equal(checkAnswer('трудно', 'трудно', { senses, linkedSenses }), 'correct')

  // Opt-in, exactly like senses: grading is byte-identical when the caller passes nothing.
  assert.equal(checkAnswer('тяжело', 'трудно', { senses }), 'incorrect')
  assert.equal(checkAnswer('тяжело', 'трудно'), 'incorrect')
  assert.equal(checkAnswer('тяжело', 'трудно', { senses, linkedSenses: null }), 'incorrect')
  assert.equal(checkAnswer('тяжело', 'трудно', { senses, linkedSenses: [] }), 'incorrect')

  // The relaxed fallbacks reach linked senses too, and an empty answer is still incorrect.
  assert.equal(checkAnswer('sode', 'noget', { linkedSenses: [createSense('søde')] }), 'mostly')
  assert.equal(checkAnswer('', 'трудно', { senses, linkedSenses }), 'incorrect')
})

test('a sentence sense is matched whole and is never comma-split into a shorter answer', () => {
  const senses = splitTranslationIntoSenses('Я думаю, что это хорошо.', 'sentence')
  const expected = 'Я думаю, что это хорошо.'

  assert.equal(checkAnswer(expected, expected, { sentence: true, senses }), 'correct')
  assert.equal(checkAnswer('Я думаю', expected, { sentence: true, senses }), 'incorrect')
  assert.equal(checkAnswer('что это хорошо', expected, { sentence: true, senses }), 'incorrect')
})

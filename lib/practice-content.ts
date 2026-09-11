import { createHash } from 'node:crypto'
import type { TranslationLanguage, ReviewItem, VocabularyEntry } from './types'
import type { PracticeAttempt, PracticeTask } from './practice'

type Localized = Record<TranslationLanguage, string>

export interface PracticeFrame {
  id: string
  title: string
  danish: string
  translation: Localized
  hint: string
  changes: { prompt: string; answer: string }[]
  conversation: { prompt: string; answer: string; translation: Localized }[]
}

export const PRACTICE_FRAMES: readonly PracticeFrame[] = [
  {
    id: 'request', title: 'Ask for what you need', danish: 'Jeg vil gerne have en kaffe.',
    translation: { en: 'I would like a coffee.', ru: 'Я бы хотел(а) кофе.', uk: 'Я хотів би / хотіла б каву.' },
    hint: 'Start with “Jeg vil gerne …”.',
    changes: [
      { prompt: 'Ask for tea instead of coffee.', answer: 'Jeg vil gerne have en te.' },
      { prompt: 'Ask for water instead of coffee.', answer: 'Jeg vil gerne have vand.' },
      { prompt: 'Ask for two coffees.', answer: 'Jeg vil gerne have to kopper kaffe.' },
    ],
    conversation: [
      { prompt: 'Hvad vil du gerne have?', answer: 'Jeg vil gerne have en kaffe.', translation: { en: 'What would you like?', ru: 'Что бы вы хотели?', uk: 'Що б ви хотіли?' } },
      { prompt: 'Vil du have mælk i kaffen?', answer: 'Ja tak, jeg vil gerne have mælk.', translation: { en: 'Would you like milk in your coffee?', ru: 'Хотите молоко в кофе?', uk: 'Хочете молоко в каву?' } },
      { prompt: 'Vil du også have vand?', answer: 'Nej tak.', translation: { en: 'Would you also like water?', ru: 'Хотите ещё воды?', uk: 'Хочете ще води?' } },
    ],
  },
  {
    id: 'uncertainty', title: 'Express uncertainty', danish: 'Jeg er ikke helt sikker.',
    translation: { en: 'I am not completely sure.', ru: 'Я не совсем уверен(а).', uk: 'Я не зовсім впевнений / впевнена.' },
    hint: 'Put “ikke” after “er”.',
    changes: [
      { prompt: 'Say that you ARE completely sure.', answer: 'Jeg er helt sikker.' },
      { prompt: 'Ask whether the other person is sure.', answer: 'Er du sikker?' },
      { prompt: 'Say that you are not sure yet. “Yet” is “endnu”.', answer: 'Jeg er ikke sikker endnu.' },
    ],
    conversation: [
      { prompt: 'Er du sikker?', answer: 'Jeg er ikke helt sikker.', translation: { en: 'Are you sure?', ru: 'Ты уверен(а)?', uk: 'Ти впевнений / впевнена?' } },
      { prompt: 'Vil du tænke over det?', answer: 'Ja tak.', translation: { en: 'Would you like to think about it?', ru: 'Хочешь подумать об этом?', uk: 'Хочеш подумати про це?' } },
    ],
  },
  {
    id: 'routine', title: 'Talk about your day', danish: 'Jeg arbejder i dag.',
    translation: { en: 'I am working today.', ru: 'Я сегодня работаю.', uk: 'Я сьогодні працюю.' },
    hint: 'In a main clause, the verb stays in second position: “I dag arbejder …”.',
    changes: [
      { prompt: 'Say the same thing, starting with “I dag”.', answer: 'I dag arbejder jeg.' },
      { prompt: 'Say that you are NOT working today.', answer: 'Jeg arbejder ikke i dag.' },
      { prompt: 'Say that you are working tomorrow. “Tomorrow” is “i morgen”.', answer: 'Jeg arbejder i morgen.' },
    ],
    conversation: [
      { prompt: 'Hvad laver du i dag?', answer: 'Jeg arbejder i dag.', translation: { en: 'What are you doing today?', ru: 'Что ты сегодня делаешь?', uk: 'Що ти сьогодні робиш?' } },
      { prompt: 'Arbejder du også i morgen?', answer: 'Ja, jeg arbejder også i morgen.', translation: { en: 'Are you also working tomorrow?', ru: 'Ты завтра тоже работаешь?', uk: 'Ти завтра теж працюєш?' } },
    ],
  },
  {
    id: 'clarify', title: 'Keep a conversation going', danish: 'Kan du sige det igen?',
    translation: { en: 'Can you say that again?', ru: 'Можешь сказать это ещё раз?', uk: 'Можеш сказати це ще раз?' },
    hint: 'Start your question with “Kan du …”.',
    changes: [
      { prompt: 'Ask someone to speak slowly. “Speak slowly” is “tale langsomt”.', answer: 'Kan du tale langsomt?' },
      { prompt: 'Say that you do not understand.', answer: 'Jeg forstår ikke.' },
      { prompt: 'Say that you understand now. “Now” is “nu”.', answer: 'Jeg forstår nu.' },
    ],
    conversation: [
      { prompt: 'Vi mødes klokken tre.', answer: 'Kan du sige det igen?', translation: { en: 'We meet at three o’clock.', ru: 'Мы встречаемся в три часа.', uk: 'Ми зустрічаємося о третій годині.' } },
      { prompt: 'Klokken tre. Er det okay?', answer: 'Ja tak.', translation: { en: 'At three. Is that okay?', ru: 'В три. Подходит?', uk: 'О третій. Підходить?' } },
    ],
  },
]

export function entryContentVersion(entry: VocabularyEntry): string {
  return createHash('sha256').update(JSON.stringify([entry.danish, entry.translation, entry.example_sentence, entry.entry_kind])).digest('hex')
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
    cardId: objective === 'meaning' ? item.id : undefined, contentVersion: entryContentVersion(entry),
  }
}

export function frameTasks(frame: PracticeFrame, language: TranslationLanguage, introduction: boolean, variant: number): PracticeTask[] {
  const targetKey = `frame:${frame.id}`
  const base: PracticeTask = {
    id: `${targetKey}:produce`, targetKey, entryId: null, objective: 'production',
    kind: 'produce', stage: 'build', prompt: frame.translation[language],
    answer: frame.danish, danish: frame.danish, translation: frame.translation[language],
    hint: frame.hint, example: frame.danish, audioText: null, source: 'frame', newTarget: false, retry: 0, contentVersion: 'frames-v1',
  }
  const change = frame.changes[variant % frame.changes.length]
  const tasks: PracticeTask[] = []
  if (introduction) tasks.push({ ...base, id: `${targetKey}:teach`, kind: 'teach', stage: 'learn', prompt: frame.title, newTarget: true })
  tasks.push(base)
  tasks.push({ ...base, id: `${targetKey}:build:${variant % frame.changes.length}`, kind: 'build', objective: null, prompt: change.prompt, answer: change.answer })
  frame.conversation.forEach((turn, index) => {
    tasks.push({ ...base, id: `${targetKey}:dialogue:${index}`, kind: index === 0 ? 'listen' : 'dialogue', stage: 'speak', objective: null, prompt: index === 0 ? 'Listen, then reply in Danish.' : turn.prompt, audioText: turn.prompt, answer: turn.answer, translation: turn.translation[language], hint: turn.translation[language] })
  })
  return tasks
}

export function selectFrame(attempts: PracticeAttempt[], canIntroduce: boolean, day: number): { frame: PracticeFrame; introduction: boolean } | null {
  const learned = new Set(attempts.map((attempt) => attempt.targetKey))
  const available = PRACTICE_FRAMES.filter((frame) => learned.has(`frame:${frame.id}`))
  if (canIntroduce) {
    const next = PRACTICE_FRAMES.find((frame) => !learned.has(`frame:${frame.id}`))
    if (next) return { frame: next, introduction: true }
  }
  return available.length ? { frame: available[day % available.length], introduction: false } : null
}

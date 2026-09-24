import type { PracticeFeedbackCode } from './practice-grading'
import type { PracticeKind } from './practice'
import type { TranslationLanguage } from './types'

/**
 * Practice interface text in the learner language (issue #15, spec #12 decision 13). English and
 * Russian are supplied; Ukrainian has no supplied content, so its learners read English here.
 */
export type PracticeLocale = 'en' | 'ru'

export function practiceLocale(language: TranslationLanguage): PracticeLocale {
  return language === 'ru' ? 'ru' : 'en'
}

export interface PracticeCopy {
  kind: Record<PracticeKind, string>
  instruction: Partial<Record<PracticeKind, string>>
  feedback: Record<PracticeFeedbackCode, (values: { answer: string; right: number; total: number }) => string>
  verdict: Record<PracticeFeedbackCode, string>
  check: string
  dontKnow: string
  showHint: string
  continue: string
  pause: string
  finish: string
  finishSession: string
  resume: string
  start: string
  preparing: string
  checking: string
  reviewInstead: string
  openReview: string
  howLong: string
  custom: string
  minutesWord: string
  minuteOption: (minutes: number) => string
  upTo: (max: number) => string
  chooseMinutes: (max: number) => string
  goalEyebrow: (minutes: number) => string
  eyebrow: string
  doneEyebrow: string
  titleStart: string
  titleAgain: string
  intro: string
  retired: string
  emptyMaterial: string
  shortfall: (available: number, requested: number) => string
  startShorter: (minutes: number) => string
  summary: (count: number, minutes: number, right: number) => string
  placeSaved: string
  pickUp: string
  pausedBody: (done: number, withDraft: boolean) => string
  goalReached: string
  outOfExercises: string
  nicelyDone: string
  noMoreExercises: string
  again: string
  footnote: string
  yourAnswer: string
  answer: string
  alsoAccepted: string
  meaning: string
  yourSentence: string
  savedSentence: string
  reportCorrect: string
  reported: string
  missingWord: string
  yourDanish: string
  typeWord: string
  typeDanish: string
  wholeSentence: string
  tapInOrder: string
  allPlaced: string
  clear: string
  senseLead: (danish: string) => string
  otherMeaning: string
  isTrue: string
  isFalse: string
  claim: (danish: string, meaning: string) => string
  reveal: string
  knewIt: string
  notYet: string
  selfRated: string
  danishColumn: string
  meaningColumn: string
  unplaced: string
  categoryName: (category: string) => string
  reconnect: string
  reload: string
  loadFailed: string
  conflict: string
  saveFailed: string
  offline: string
}

const en: PracticeCopy = {
  kind: {
    pick: 'Choose the meaning', choose: 'Fill the gap', assemble: 'Put the words in order', cloze: 'Type the missing word',
    produce: 'Write it in Danish', sense: 'Which meaning is this?', binary: 'True or false', odd: 'Odd one out',
    sort: 'Sort by gender', match: 'Match the pairs', dialogue: 'Choose a reply', flash: 'Recall, then reveal',
  },
  instruction: {
    pick: 'Which meaning does this word have?',
    choose: 'Tap the word that fits the gap.',
    assemble: 'Tap the words in order to build the sentence.',
    binary: 'Does the word have this meaning?',
    odd: 'Which noun has a different gender from the others?',
    sort: 'Place each noun under its gender.',
    match: 'Tap a Danish word, then its meaning.',
    dialogue: 'Choose a natural reply.',
    flash: 'Think of the meaning first, then reveal it.',
  },
  feedback: {
    correct: () => '',
    mostly: () => 'Check the highlighted letters.',
    incorrect: () => 'Compare with the answer below.',
    wrong_form: ({ answer }) => `Right word. This sentence needs the form “${answer}”.`,
    unverified: () => 'This differs from your saved sentence. Compare the two; yours was not checked.',
    dont_know: () => 'Here is the answer. It comes back a few steps later.',
    self_known: () => 'Noted as known. This is your own rating, not a checked answer.',
    self_unknown: () => 'Noted. It comes back later.',
    partial: ({ right, total }) => `${right} of ${total} right. Each word counts on its own.`,
  },
  verdict: {
    correct: 'Correct', mostly: 'Close', incorrect: 'Not quite', wrong_form: 'Wrong form', unverified: 'Compare with your saved sentence',
    dont_know: 'Here’s the answer', self_known: 'You knew it', self_unknown: 'Not yet', partial: 'Partly right',
  },
  check: 'Check', dontKnow: 'I don’t know', showHint: 'Show a hint', continue: 'Continue', pause: 'Pause', finish: 'Finish',
  finishSession: 'Finish session', resume: 'Resume practice', start: 'Start practice', preparing: 'Preparing…', checking: 'Checking…',
  reviewInstead: 'Review instead →', openReview: 'Open Review', howLong: 'How long?', custom: 'Custom', minutesWord: 'minutes',
  minuteOption: (minutes) => `${minutes} min`,
  upTo: (max) => `Up to ${max}.`,
  chooseMinutes: (max) => `Choose 1 to ${max} whole minutes.`,
  goalEyebrow: (minutes) => `PRACTICE · ${minutes} MIN GOAL`,
  eyebrow: 'PRACTICE', doneEyebrow: 'SESSION DONE',
  titleStart: 'Practise your saved words.', titleAgain: 'Practice again?',
  intro: 'Short exercises from your Material. Practice never changes your Review schedule.',
  retired: 'Practice was updated, so your earlier session was closed. Your Review progress is unchanged.',
  emptyMaterial: 'There isn’t enough saved Material with meanings to build Practice yet. Save a few words, or review what you have.',
  shortfall: (available, requested) => `Your saved Material fills about ${available} ${available === 1 ? 'minute' : 'minutes'} of Practice, not ${requested}.`,
  startShorter: (minutes) => `Start ${minutes}-minute session`,
  summary: (count, minutes, right) => `${count} ${count === 1 ? 'exercise' : 'exercises'} in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}${count ? `, ${right} right` : ''}.`,
  placeSaved: 'YOUR PLACE IS SAVED', pickUp: 'Pick up where you left off.',
  pausedBody: (done, withDraft) => `${done ? `${done} ${done === 1 ? 'exercise' : 'exercises'} done. ` : ''}The same exercise is waiting${withDraft ? ', with your answer so far' : ''}.`,
  goalReached: 'GOAL REACHED', outOfExercises: 'NOTHING LEFT TO PRACTISE', nicelyDone: 'Nicely done.', noMoreExercises: 'This session is out of exercises.',
  again: 'Again', footnote: 'Practice never changes your Review schedule.',
  yourAnswer: 'Your answer', answer: 'Answer', alsoAccepted: 'Also correct', meaning: 'The meaning', yourSentence: 'Your sentence', savedSentence: 'Saved sentence',
  reportCorrect: 'My answer is also correct', reported: 'Sent for review. Nothing else changed.',
  missingWord: 'The missing word', yourDanish: 'Your Danish answer', typeWord: 'Type the word…', typeDanish: 'Type it in Danish…',
  wholeSentence: 'Write the whole sentence in Danish.', tapInOrder: 'Tap the words in order.', allPlaced: 'Every tile is placed.', clear: 'Clear',
  senseLead: (danish) => `Two sentences, one word — ${danish} — two different meanings. Which meaning does the first sentence use?`,
  otherMeaning: 'The other meaning appears here',
  isTrue: 'True', isFalse: 'False', claim: (danish, meaning) => `“${danish}” means “${meaning}”.`,
  reveal: 'Reveal', knewIt: 'I knew it', notYet: 'Not yet', selfRated: 'Self-rated: this is your own judgement, not a checked answer.',
  danishColumn: 'Danish', meaningColumn: 'Meaning', unplaced: 'Tap a noun, then a group.',
  categoryName: (category) => `${category}-words`,
  reconnect: 'Let’s reconnect.', reload: 'Reload saved session',
  loadFailed: 'Practice could not be loaded. Please retry, or open Review.',
  conflict: 'This session changed on another screen. Reload the saved session to continue.',
  saveFailed: 'Could not save this step. Retry to continue; your saved progress is safe.',
  offline: 'Connection interrupted. Reconnect and retry this step.',
}

const ru: PracticeCopy = {
  kind: {
    pick: 'Выберите значение', choose: 'Заполните пропуск', assemble: 'Расставьте слова', cloze: 'Впишите пропущенное слово',
    produce: 'Напишите по-датски', sense: 'Какое это значение?', binary: 'Верно или нет', odd: 'Лишнее слово',
    sort: 'Распределите по роду', match: 'Найдите пары', dialogue: 'Выберите ответ', flash: 'Вспомните и откройте',
  },
  instruction: {
    pick: 'Какое значение у этого слова?',
    choose: 'Нажмите на слово, которое подходит в пропуск.',
    assemble: 'Нажимайте на слова по порядку, чтобы составить предложение.',
    binary: 'У этого слова есть такое значение?',
    odd: 'У какого существительного другой род?',
    sort: 'Распределите существительные по роду.',
    match: 'Нажмите на датское слово, затем на его значение.',
    dialogue: 'Выберите естественный ответ.',
    flash: 'Сначала вспомните значение, затем откройте его.',
  },
  feedback: {
    correct: () => '',
    mostly: () => 'Посмотрите на выделенные буквы.',
    incorrect: () => 'Сравните с ответом ниже.',
    wrong_form: ({ answer }) => `Слово верное. В этом предложении нужна форма «${answer}».`,
    unverified: () => 'Это отличается от сохранённого предложения. Сравните их: ваш вариант не проверялся.',
    dont_know: () => 'Вот ответ. Это упражнение вернётся через несколько шагов.',
    self_known: () => 'Отмечено как известное. Это ваша собственная оценка, а не проверенный ответ.',
    self_unknown: () => 'Отмечено. Это вернётся позже.',
    partial: ({ right, total }) => `Верно ${right} из ${total}. Каждое слово засчитывается отдельно.`,
  },
  verdict: {
    correct: 'Верно', mostly: 'Почти', incorrect: 'Не совсем', wrong_form: 'Не та форма', unverified: 'Сравните с сохранённым предложением',
    dont_know: 'Вот ответ', self_known: 'Вы знали', self_unknown: 'Пока нет', partial: 'Частично верно',
  },
  check: 'Проверить', dontKnow: 'Не знаю', showHint: 'Подсказка', continue: 'Дальше', pause: 'Пауза', finish: 'Завершить',
  finishSession: 'Завершить занятие', resume: 'Продолжить', start: 'Начать практику', preparing: 'Готовим…', checking: 'Проверяем…',
  reviewInstead: 'Лучше повторение →', openReview: 'Открыть повторение', howLong: 'Сколько времени?', custom: 'Своё', minutesWord: 'минут',
  minuteOption: (minutes) => `${minutes} мин`,
  upTo: (max) => `Не больше ${max}.`,
  chooseMinutes: (max) => `Выберите от 1 до ${max} целых минут.`,
  goalEyebrow: (minutes) => `ПРАКТИКА · ЦЕЛЬ ${minutes} МИН`,
  eyebrow: 'ПРАКТИКА', doneEyebrow: 'ЗАНЯТИЕ ЗАВЕРШЕНО',
  titleStart: 'Потренируйте сохранённые слова.', titleAgain: 'Ещё практики?',
  intro: 'Короткие упражнения из вашего материала. Практика никогда не меняет расписание повторения.',
  retired: 'Практика обновилась, поэтому прежнее занятие закрыто. Ваш прогресс в повторении не изменился.',
  emptyMaterial: 'Пока недостаточно сохранённых слов со значениями, чтобы собрать практику. Сохраните несколько слов или повторите то, что есть.',
  shortfall: (available, requested) => `Сохранённого материала хватит примерно на ${available} мин практики, а не на ${requested}.`,
  startShorter: (minutes) => `Начать занятие на ${minutes} мин`,
  summary: (count, minutes, right) => `Упражнений: ${count}, примерно ${minutes} мин${count ? `, верно: ${right}` : ''}.`,
  placeSaved: 'ВАШЕ МЕСТО СОХРАНЕНО', pickUp: 'Продолжите с того же места.',
  pausedBody: (done, withDraft) => `${done ? `Выполнено упражнений: ${done}. ` : ''}Вас ждёт то же упражнение${withDraft ? ' вместе с вашим ответом' : ''}.`,
  goalReached: 'ЦЕЛЬ ДОСТИГНУТА', outOfExercises: 'УПРАЖНЕНИЯ ЗАКОНЧИЛИСЬ', nicelyDone: 'Отлично.', noMoreExercises: 'В этом занятии больше нет упражнений.',
  again: 'Снова', footnote: 'Практика никогда не меняет расписание повторения.',
  yourAnswer: 'Ваш ответ', answer: 'Ответ', alsoAccepted: 'Тоже верно', meaning: 'Значение', yourSentence: 'Ваше предложение', savedSentence: 'Сохранённое предложение',
  reportCorrect: 'Мой ответ тоже верный', reported: 'Отправлено на проверку. Больше ничего не изменилось.',
  missingWord: 'Пропущенное слово', yourDanish: 'Ваш ответ по-датски', typeWord: 'Введите слово…', typeDanish: 'Напишите по-датски…',
  wholeSentence: 'Напишите всё предложение по-датски.', tapInOrder: 'Нажимайте на слова по порядку.', allPlaced: 'Все слова расставлены.', clear: 'Очистить',
  senseLead: (danish) => `Два предложения, одно слово — ${danish} — два разных значения. Какое значение в первом предложении?`,
  otherMeaning: 'Другое значение — здесь',
  isTrue: 'Верно', isFalse: 'Неверно', claim: (danish, meaning) => `«${danish}» значит «${meaning}».`,
  reveal: 'Открыть', knewIt: 'Я знал(а)', notYet: 'Пока нет', selfRated: 'Самооценка: это ваше суждение, а не проверенный ответ.',
  danishColumn: 'Датский', meaningColumn: 'Значение', unplaced: 'Нажмите на слово, затем на группу.',
  categoryName: (category) => `слова на ${category}`,
  reconnect: 'Переподключаемся.', reload: 'Загрузить сохранённое занятие',
  loadFailed: 'Не удалось загрузить практику. Попробуйте ещё раз или откройте повторение.',
  conflict: 'Занятие изменилось на другом экране. Загрузите сохранённое занятие, чтобы продолжить.',
  saveFailed: 'Не удалось сохранить этот шаг. Попробуйте снова: сохранённый прогресс в безопасности.',
  offline: 'Соединение прервалось. Подключитесь и повторите этот шаг.',
}

export const PRACTICE_COPY: Record<PracticeLocale, PracticeCopy> = { en, ru }

export function isFeedbackCode(value: string): value is PracticeFeedbackCode {
  return value in en.feedback
}

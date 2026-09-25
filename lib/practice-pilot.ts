import type { TranslationLanguage } from './types'

/**
 * Prepared dialogue exchanges for the dialogue format (issue #15 pilot).
 *
 * Each exchange trains one saved headword. The learner reads the other speaker's line and a short
 * situation in their learner language (English, Russian or Ukrainian), then chooses a reply.
 * `accepted` lists every reply the content counts as natural, so a second valid answer is never
 * marked wrong; `distractors` are grammatical Danish that does not answer the line. An exchange is offered only when its
 * headword is in the learner's Material and its situation exists in their learner language.
 *
 * Written offline and reviewed by hand; nothing here is generated at runtime (ADR 0001).
 */
export interface PilotDialogue {
  id: string
  headword: string
  line: string
  situation: Partial<Record<TranslationLanguage, string>>
  accepted: string[]
  distractors: string[]
}

export const PILOT_DIALOGUE_SOURCE = 'dialogue-pilot-2026-09-25'

export const PILOT_DIALOGUES: readonly PilotDialogue[] = [
  {
    id: 'gerne-coffee', headword: 'gerne', line: 'Vil du have en kop kaffe?',
    situation: { en: 'A colleague offers you a cup of coffee. Say yes politely.', ru: 'Коллега предлагает вам чашку кофе. Вежливо согласитесь.', uk: 'Колега пропонує вам чашку кави. Ввічливо погодьтеся.' },
    accepted: ['Ja tak, meget gerne.', 'Ja tak, det vil jeg gerne.'],
    distractors: ['Nej, jeg har aldrig været der.', 'Det ved jeg ikke, hvor den er.'],
  },
  {
    id: 'maaske-party', headword: 'måske', line: 'Kommer du til festen på lørdag?',
    situation: { en: 'A friend asks about the party on Saturday. You are not sure yet.', ru: 'Друг спрашивает про вечеринку в субботу. Вы ещё не уверены.', uk: 'Друг питає про вечірку в суботу. Ви ще не впевнені.' },
    accepted: ['Måske, jeg ved det ikke endnu.'],
    distractors: ['Ja, jeg kom i går.', 'Festen er i en stor have.'],
  },
  {
    id: 'synes-film', headword: 'synes', line: 'Hvad synes du om filmen?',
    situation: { en: 'A friend asks what you thought of the film you just watched.', ru: 'Друг спрашивает, что вы думаете о фильме, который вы только что посмотрели.', uk: 'Друг питає, що ви думаєте про фільм, який ви щойно подивилися.' },
    accepted: ['Jeg synes, den var rigtig god.', 'Den var god, synes jeg.'],
    distractors: ['Jeg hedder Anna.', 'Filmen starter klokken otte.'],
  },
  {
    id: 'hjaelpe-suitcase', headword: 'hjælpe', line: 'Undskyld, kan du hjælpe mig med min kuffert?',
    situation: { en: 'Someone at the station asks you for help with a suitcase. Offer to help.', ru: 'На вокзале вас просят помочь с чемоданом. Предложите помощь.', uk: 'На вокзалі вас просять допомогти з валізою. Запропонуйте допомогу.' },
    accepted: ['Ja, selvfølgelig kan jeg hjælpe dig.', 'Ja, jeg hjælper gerne.'],
    distractors: ['Toget kører klokken ti.', 'Min kuffert er rød.'],
  },
  {
    id: 'huske-name', headword: 'huske', line: 'Husker du, hvad hun hedder?',
    situation: { en: 'A friend asks whether you remember a woman’s name. You do not.', ru: 'Друг спрашивает, помните ли вы, как её зовут. Вы не помните.', uk: 'Друг питає, чи памʼятаєте ви, як її звати. Ви не памʼятаєте.' },
    accepted: ['Nej, det kan jeg ikke huske.', 'Nej, jeg husker det ikke.'],
    distractors: ['Jeg bor i Aarhus.', 'Hun er tyve minutter forsinket.'],
  },
  {
    id: 'stadig-copenhagen', headword: 'stadig', line: 'Bor du stadig i København?',
    situation: { en: 'An old friend asks whether you still live in Copenhagen. You do.', ru: 'Старый друг спрашивает, живёте ли вы всё ещё в Копенгагене. Да, живёте.', uk: 'Старий друг питає, чи ви досі живете в Копенгагені. Так, живете.' },
    accepted: ['Ja, jeg bor stadig i København.', 'Ja, det gør jeg stadig.'],
    distractors: ['København ligger i Danmark.', 'Jeg kan godt lide kaffe.'],
  },
  {
    id: 'allerede-dinner', headword: 'allerede', line: 'Skal vi spise nu?',
    situation: { en: 'A friend suggests eating now, but you have already eaten.', ru: 'Друг предлагает поесть сейчас, но вы уже поели.', uk: 'Друг пропонує поїсти зараз, але ви вже поїли.' },
    accepted: ['Jeg har allerede spist, tak.'],
    distractors: ['Jeg hedder Peter.', 'Bussen kommer om fem minutter.'],
  },
  {
    id: 'proeve-bakery', headword: 'prøve', line: 'Har du prøvet den nye bager?',
    situation: { en: 'A neighbour asks whether you have tried the new bakery. You have not, but you want to.', ru: 'Сосед спрашивает, пробовали ли вы новую пекарню. Вы не пробовали, но хотите.', uk: 'Сусід питає, чи куштували ви щось у новій пекарні. Ви ще не куштували, але хочете.' },
    accepted: ['Nej, men jeg vil gerne prøve den.', 'Nej, ikke endnu, men jeg vil gerne prøve den.'],
    distractors: ['Bageren hedder Ole.', 'Jeg har ingen cykel.'],
  },
  {
    id: 'glemme-keys', headword: 'glemme', line: 'Har du dine nøgler?',
    situation: { en: 'At the door, a friend asks if you have your keys. You left them at home.', ru: 'У двери друг спрашивает, взяли ли вы ключи. Вы оставили их дома.', uk: 'Біля дверей друг питає, чи взяли ви ключі. Ви залишили їх удома.' },
    accepted: ['Åh nej, jeg har glemt dem derhjemme.'],
    distractors: ['Jeg har en bror og en søster.', 'Det regner i dag.'],
  },
  {
    id: 'bange-swim', headword: 'bange', line: 'Hvorfor vil du ikke svømme?',
    situation: { en: 'A friend asks why you do not want to go swimming. The water scares you a little.', ru: 'Друг спрашивает, почему вы не хотите плавать. Вода вас немного пугает.', uk: 'Друг питає, чому ви не хочете плавати. Вода вас трохи лякає.' },
    accepted: ['Jeg er lidt bange for vandet.'],
    distractors: ['Jeg har ikke tid til at spise.', 'Vandet er i glasset.'],
  },
]

# Ordly learning redesign

Ordly should keep FSRS and add a guided daily practice session that develops three observable abilities: remembering a meaning, producing Danish without an answer visible, and using familiar language in a new situation. The highest priority is a better response to forgetting, followed by sentence construction and short spoken exchanges. A large collection of exercise types would be less useful than a small set selected according to the learner’s actual difficulty.

Ten minutes a day can support meaningful progress on a deliberately limited repertoire. Thirty days provide five hours of practice. There is no credible basis for promising comprehensive A2 proficiency from a beginner baseline in that time. A defensible first-month objective is better delayed recall of selected words and phrases, plus faster, more independent responses in a few everyday situations.

## 1. Current behavior and likely bottlenecks

The inspected application revision is `920df117b5ad387ffe921b4d05dec33757610b2d`. GitHub’s Build workflow and Vercel’s commit status both report success for that revision. These findings describe the repository implementation; they do not establish an individual learner’s failure rate or confirm production database contents.

| Current behavior | Evidence in the repository | Learning implication |
|---|---|---|
| Word exercises follow a fixed ten-repetition rotation: six meaning-recall prompts, two Danish-production prompts, two cloze prompts. | `lib/review.ts:5` | Exercise selection does not respond to which skill is weak. These percentages describe the programmed cycle, not measured usage. |
| Sentences receive eight meaning-recall prompts and two production prompts per cycle. | `lib/review.ts:10` | Little scheduled practice recombining sentence parts or responding to a communicative goal. |
| “Recognition” requires typing a translation. | `components/ReviewSession.tsx:67` | This is already active, cued meaning recall. It would be inaccurate to describe existing practice as merely passive recognition. |
| Fresh cloze examples have an unreachable activation condition. | `components/ReviewSession.tsx:53` and `lib/review.ts:15` | Cloze occurs at repetition counts ending in 4 or 8; regeneration requires divisibility by 5. The current review path therefore never requests those fresh examples. |
| Cloze uses a case-insensitive substring replacement. | `lib/review.ts:19` | It can miss an inflected form or blank part of a different word. Exercise validity needs explicit target-span checking. |
| The inspected model uses one review state per entry, with a unique entry constraint in the initial migration. | `lib/types.ts`; `supabase/migrations/0001_initial.sql:37` | Success remembering a translation and success producing Danish update the same estimate. The estimate cannot establish separate abilities. Verify live schema before changing this. |
| Again correctly returns the entry to the active queue, but updated repetition count determines its next mode. | `components/ReviewSession.tsx:122` | A failed production attempt can return as a different, easier task. Resolving that task does not demonstrate repair of the original skill. |
| “Mastered” is assigned from repetitions and FSRS stability. | `app/api/review/rate/route.ts:42` | This label does not demonstrate listening comprehension or independent sentence production. |
| Review grading returns a single category; near-spelling matches can bypass semantic checking. | `lib/answer.ts`; `app/api/ai/check-answer/route.ts` | Feedback cannot distinguish forgotten meaning, a wrong grammatical form, a valid alternative, and an ambiguous exercise. |
| Review is text-based. Cyrillic pronunciation appears after reveal. | `components/ReviewSession.tsx` | It does not directly exercise understanding spoken Danish or speaking in response to a situation. |
| The Sentences page collects manually saved sentences and examples; example rows are reference material. | `components/SentencesClient.tsx` | Useful existing material can supply practice, but browsing the page does not demonstrate sentence-building ability. |
| AI already uses OpenRouter, and sentence correction already has intent-preservation checks. | `lib/openrouter.ts`; `app/api/ai/check-example/route.ts` | Reuse the existing provider adapter and correction principles. The older Groq description in the handoff is no longer the implementation baseline. |

Seeing a word five times is not a reliable measure of learning. Five exposures, five guesses followed by an answer, five successful recalls minutes apart, and five successful recalls across different days are different histories. Retrieval experiments show that further successful retrieval can benefit later recall even after an answer was initially learned.[^2] This does not imply that every forgotten word needs a fixed number of repetitions.

The working diagnosis is insufficiently adaptive practice and incomplete transfer to production, with some concrete exercise defects. It is not a diagnosis of the learner’s memory, and it is not evidence that FSRS itself is malfunctioning. The first implementation milestone should collect the missing evidence before tuning retention settings.

## 2. Research basis

Confidence below describes how strongly the evidence supports the general principle. It does not mean that the exact Ordly design or a ten-minute Danish routine has been experimentally validated. Studies from English learning, artificial vocabulary, and classroom instruction require cautious transfer.

| Principle | Findings and boundaries | Consequence for Ordly |
|---|---|---|
| Space practice across time. **Strong.** | Kim and Webb synthesized 48 experiments involving 3,411 participants and found a medium-to-large spacing benefit. Equal and expanding schedules were statistically similar; delayed outcomes differed from immediate outcomes.[^1] | Retain FSRS. Changing the learning task is a higher priority than replacing the scheduler. |
| Relearn across sessions, with feedback after failure. **Strong general foundation.** | Successive relearning combines retrieval to a criterion with later relearning sessions. The literature spans different materials and schedules.[^3] | Teach an item sufficiently to retrieve it, then revisit it later. A single successful rescue is not durable mastery. |
| Optimize learning per minute. **Moderate, directly relevant tradeoff.** | In Nakata’s study of 98 learners, five or seven within-session retrievals outperformed one or three on raw scores. Accounting for time, one retrieval produced the highest efficiency.[^4] | Do not demand five successes for every item. Use extra repair selectively and cap time spent on a stubborn item. |
| Practice the direction needed. **Moderate.** | A small study of 18 undergraduates learning 24 pseudo-words found productive retrieval most effective on productive tests; its size and artificial materials limit generalization.[^5] | Measure meaning recall and Danish production separately. Do not assume one automatically establishes the other. |
| Cloze and flashcards can both work. **Moderate.** | With 150 Korean learners of English, spaced cloze and spaced flashcards showed no overall difference in learning gains on a two-week delayed test.[^6] | Choose by learning objective. Adding blanks alone is not an evidence-based upgrade over flashcards. |
| Context must not remove retrieval. **Moderate.** | Three experiments found that informative contexts helped immediate comprehension, while successful retrieval and retrieval with feedback better supported later retention.[^7] | Use a clear context to teach meaning; also test with the answer and strong hints hidden. |
| New words need manageable demands. **Moderate.** | Barcroft’s two experiments found that sentence writing could impair initial learning of new word forms.[^8] | Establish a new word’s form–meaning link before asking for an original sentence. Scaffold production rather than starting with a blank page. |
| Useful chunks can support speaking. **Promising, bounded.** | Boers and colleagues studied 32 English majors over 22 teaching hours. Phrase-focused instruction improved judges’ perceived proficiency; this was a small study with subjective outcomes.[^9] | Teach reusable expressions and frames, then test novel substitutions. Do not promise automatic fluency from memorized phrases alone. |
| Feedback should lead to another attempt. **Moderate-to-strong classroom evidence.** | A meta-analysis of 15 classroom studies, N=827, found durable corrective-feedback benefits and larger effects for prompts than recasts.[^10] | Give one actionable correction and invite self-repair. Transferring this finding to automated feedback remains a design hypothesis. |
| Mix previously introduced patterns. **Moderate.** | With 115 Japanese learners and five English grammar structures, interleaving produced more training errors but better one-week grammaticality judgments than blocking.[^11] | Revisit known patterns in mixed practice; assess actual Danish production rather than treating judgment scores as speaking evidence. |
| Repeating speaking tasks can help, but transfer must be checked. **Moderate.** | A 2025 meta-analysis found benefits across aspects of oral performance, with smaller gains in fluency and lexical complexity than some structural measures.[^12] A 116-person study found similar delayed fluency gains for one-day and seven-day practice spacing.[^13] | Repeat short communicative tasks across days. Do not market one spacing schedule as universally optimal. |
| Repeating a script is not sufficient evidence of general fluency. **Moderate.** | Suzuki and Hanzawa found mixed consequences of massed repetition, including slower articulation and more verbatim repetition on some measures, with limited delayed effects on a novel task.[^14] | Include a changed situation and an unseen follow-up question. |
| Train listening and speaking directly. **Strong for phonetic perception; weaker transfer.** | A 79-study meta-analysis supports high-variability phonetic training for perception.[^15] A separate 31-study analysis found smaller production effects and limited evidence for durable generalization.[^16] | Include listening without text and spoken responses. Sound-identification drills are targeted support, not a substitute for communication. |
| AI dialogue is promising, not a guaranteed accelerator. **Moderate, heterogeneous.** | Chatbot meta-analyses report positive effects: g=0.484 across 28 studies and g=0.608 across 31 studies.[^17][^18] These concern varied systems, learners, comparisons, and outcomes. | Use AI for constrained tasks and useful feedback. Effect sizes are not percentage gains or predictions for Ordly. |

### Particularly relevant Danish research

Paddags, Hershcovich, and Savage tested a system that combined due words into sentences, using corpus retrieval or a hybrid with generated sentences. The Danish study had 26 participants and lasted ten days. It reported substantially higher learning efficiency than its single-word baseline, but used a convenience sample and multiple comparisons; the authors note that correction for multiple testing would leave only the retrieval-versus-single-word efficiency difference significant.[^19]

This supports piloting sentences built around due vocabulary. It does not establish a fourfold improvement in long-term retention, spoken competence, or time to A2. The paper also found quality and looping problems with generation. Ordly should prefer validated examples and test generated material before treating it as reliable instruction.

Nation’s Four Strands offers a useful curriculum check: meaningful input, meaningful output, deliberate language study, and fluency development all deserve attention.[^22] It is a pedagogical framework, not proof that a daily session must allocate exactly 25% to each activity.

## 3. The recommended exercise set

The following timings, thresholds, and progression rules are proposed product defaults. They should be adjusted using observed performance and session duration. They are not experimentally established optimum values. Danish examples illustrate intended behavior and need native-speaker review before becoming a reference bank.

### A. Repair a forgotten word or expression

**Trigger:** an explicit “Help me remember” action, or repeated unaided failures on the same learning objective. Start with two failures on separate encounters as a tunable trigger.

Use a compact sequence:

1. Show one relevant meaning, the Danish form, and one short example. Play audio when available.
2. Explain the particular obstacle, if known: confusion with another word, unclear sense, missing inflection, or sound–spelling mismatch.
3. Hide the answer and request a short retrieval. Offer a graded hint only on demand.
4. Return to the same objective after intervening material, with help hidden.
5. Revisit on a later day according to FSRS and the recorded outcome.

For `svært`, first anchor the relevant meaning “difficult” in `Det er svært.` Then ask for the meaning with the translation hidden. Once that association is usable, prompt “Say: It is difficult” with no Danish shown. These are distinct objectives; failing one should not be erased by passing the other.

The rescue may include a learner-chosen image or association, but no compulsory mnemonic story. Mnemonics are an optional experiment for stubborn items, not the primary mechanism. Any sound association must not replace trustworthy Danish audio or the existing IPA-based pronunciation work.

Spend approximately 45–60 seconds on a rescue before moving on. If another attempt fails, retain the item as unresolved and make it available later. Avoid trapping the entire session in an immediate reveal–repeat loop.

### B. Recall a useful chunk from an intention

**Objective:** retrieve Danish from a meaning or situation.

Examples:

| Situation or intention | Example response |
|---|---|
| Say that you are not completely sure. | `Jeg er ikke helt sikker.` |
| Politely ask for a coffee. | `Jeg vil gerne have en kaffe.` |
| Ask someone to repeat. | `Kan du sige det igen?` |
| Say what you think about something. | `Jeg synes, det er svært.` |

Begin with expressions already saved or clearly useful to the learner. Introduce one sense at a time. Treat a saved long sentence as a possible source of reusable spans; do not automatically turn every span into a separate review card.

The target expression must be hidden on an unaided attempt. “Use `helt sikker`” is a useful supported exercise, but it does not test retrieval of that expression. If an equally valid alternative communicates the intention, accept the communication and separately note that the target expression was not demonstrated.

Early production can be typed. For the speaking goal, include an option to speak aloud and self-check even before speech recognition ships. A typed answer cannot establish spoken fluency.

### C. Build and transform a sentence

**Objective:** reuse a familiar frame while changing meaning or structure.

Start with a completed model, then change one element:

- `Jeg vil gerne have en kaffe.` → ask for tea.
- `Jeg arbejder i dag.` → begin with `I dag`: `I dag arbejder jeg.`
- `Jeg er sikker.` → say that you are not sure: `Jeg er ikke sikker.`
- `Du kommer i morgen.` → ask a question: `Kommer du i morgen?`

The visible model is teaching support. Later present only the communicative cue, so completion requires retrieval and construction. A final variant should contain a combination not shown in the model.

Use a short progression: model → supported change → hidden-model production → new situation. Do not require every step on every review. New material gets support; familiar material gets less.

Initial grammar content should be small and explicit: basic declaratives, questions, main-clause negation, common modals, time expressions with verb-second order, and useful noun phrases with articles. Introduce past-time narration when prerequisites are present. Advanced exceptions and long explanations do not belong in the first ten-minute routine.

Word-bank assembly may help after failure, but should not be the final mastery test. Keep a single-error focus: a successful choice of vocabulary should remain visible as progress even if word order needs correction.

### D. Hear, understand, then respond

**Objective:** connect sound to meaning and produce a relevant reply.

Play a short utterance with its transcript hidden, such as `Hvad vil du gerne have?` First check understanding when needed; then request a response. Reveal the transcript after the attempt or through a help action. Permit replay and slower playback, recording which supports were used.

Progress from a familiar voice and short material to different speakers and modest contextual changes. Include some human-recorded, natural Danish in the evaluation bank. Artificially slowing one synthetic voice does not establish understanding of everyday speech.

Cyrillic pronunciation remains optional teaching support after an attempt. It cannot represent every relevant sound distinction. This is a reason to add audio, not a reason to discard the pronunciation tool.

Targeted sound contrasts can be inserted when evidence shows a recurring perceptual confusion. High-variability phonetic training is a later enhancement requiring verified recordings and correct labels. Avoid a generic pronunciation score based only on whether a speech recognizer produced the expected text.

Danish phonetic research motivates attention to actual speech, but sweeping claims that Danish is intrinsically impossible to segment are unwarranted: a relevant artificial-language study did not find its predicted segmentability effect.[^23]

### E. Complete a short everyday exchange

**Objective:** combine known material under a communicative goal.

Use a bounded roleplay of two or three learner turns. Example: order a drink; respond to a follow-up about size; clarify one detail. Start with a familiar situation and a small amount of known vocabulary. The app chooses the situation so the learner does not have to invent a topic.

AI receives a fixed scenario, current language scope, target meanings, and stop conditions. It should ask one question at a time, avoid revealing the answer in advance, and use short replies. If the learner gets stuck, provide a hint or model and explicitly treat the next attempt as supported.

Feedback has three parts: whether the intention was communicated, one useful correction if needed, and an invitation to try the relevant turn again. End after the task is completed or the allocated time is reached. A later session changes a detail and asks an unseen follow-up.

Initially use a validated dialogue tree with limited AI grading. Add freer generation only if it improves flexibility without increasing confusion, grading errors, or waiting time.

### F. Retrieve again after a delay

**Objective:** establish whether practice survives beyond the visible answer.

End some sessions with a brief return to a previously troublesome target, after unrelated material. Across days, use unaided prompts with different surface wording and occasional new contexts. Weekly checks use material that was not just previewed or rehearsed.

The same-day return is learning practice, not proof of long-term retention. A seven-day probe should report time since the last exposure, not merely time since an item was added. New material from the final week cannot honestly count as having passed a seven-day retention test by day 30.

## 4. A ten-minute session

One primary action on Home: **Practice for 10 minutes**. Use the existing Review area to present the session. Preserve access to ordinary due-card review and the current Words and Sentences collections. Avoid a new menu of six exercise modes.

| Time | Activity | Typical scope |
|---|---|---|
| 0:00–3:00 | Due retrieval | Approximately 6–8 short, unaided attempts, adjusted to actual pace. |
| 3:00–5:00 | Repair or introduce | One or two difficult targets; introduce new material only if capacity remains. |
| 5:00–7:00 | Sentence construction | A familiar frame, one changed meaning, one less-supported attempt. |
| 7:00–9:00 | Listening and response | A few short audio turns or one bounded dialogue. |
| 9:00–10:00 | Delayed return | Revisit a troublesome target and finish the active item. |

The scope includes reading feedback and selecting ratings. It is a planning budget, not a requirement to rush. On heavy-review days, shift toward six minutes of due retrieval, one minute of repair, two minutes of production, and one minute of listening. Preserve a little productive use while reducing new intake.

Initially admit **up to two new learning targets per day**, counting a new phrase or frame against the same budget as a new word. Existing troublesome vocabulary takes priority. With two introductions on every day, the arithmetic ceiling is 60 targets in a month; that is neither a predicted gain nor 60 mastered items. A target can contain multiple words, so target counts must not be relabeled as vocabulary size.

If recent unaided performance is poor or overdue work is growing, admit zero new targets. Use an initial provisional threshold such as below 75% success across 20 comparable unaided attempts, then adjust with real data. Do not confuse this operating rule with FSRS’s 90% requested retention: the metrics have different denominators and meanings.

At ten minutes, offer to finish or continue. Unresolved Again items remain in the current session; due dates are not pushed forward simply to clear the dashboard. Leaving the session should preserve enough state to resume, and pending work must not be labeled completed.

## 5. Selection, scheduling, and assessment

### Stable objectives instead of repetition-count rotation

Select an exercise using entry readiness, due status, previous unaided result, support used, and remaining time. A failed Danish-production objective should return as Danish production after appropriate repair. It should not become a translation question because a repetition counter changed.

Retain FSRS as the scheduling authority. Distinguish **learning objectives** from **exercise presentations**. A new sentence context does not automatically need its own FSRS card.

The recommended initial model has two possible objectives for a selected entry sense: written Danish → meaning, and meaning/intention → Danish form. Create the production objective lazily for the active repertoire. This avoids immediately doubling the full backlog. Listening and sentence transfer initially get separate evidence records; add additional schedules only if the diagnostic data warrants the extra workload.

Retain historical review records. Their ratings came from mixed modes, so do not silently reinterpret them as clean comprehension evidence or clone their stability into a production objective. Preserve the legacy schedule, expose the uncertainty, and begin collecting mode-specific evidence. A new production objective starts conservatively or receives an explicitly recorded diagnostic attempt.

Changing exercise presentation changes measurement conditions. Keep a stable prompt family for each scheduled objective and record whether an attempt was cold, hinted, recently exposed, or a same-session retry. Avoid showing an entry’s answer immediately before testing its sibling objective; any deliberate teaching exposure should be recorded as such.

### Rating and feedback contract

The learner retains the final Again / Hard / Good / Easy decision. Suggest Again for a forgotten answer or an answer reached only after revealing it; suggest Hard for an unaided but effortful successful recall. Explain these distinctions once in context, rather than making the learner interpret the AI’s wording on every card.

Separate communication success, target retrieval, and grammatical accuracy. For example, a valid synonym can complete a dialogue without demonstrating retrieval of the requested expression. A wrong article may merit a specific grammar repair without implying the noun’s meaning was forgotten. AI uncertainty should produce “needs checking” and an escape route, not a forced failure.

Teaching exposures, copied answers, and supported transformations are practice events. They must not be written as independent successful memory recalls. Genuine subsequent blind retries may receive normal FSRS updates at their actual timestamps, retaining short-term scheduling and Again behavior. They remain excluded from delayed-mastery statistics.

Do not award FSRS success to every vocabulary item appearing in an AI sentence. A correct sentence-level response may depend on only one part of the sentence. Start with one explicit target per scheduled assessment; credit several only if each has separately observable evidence.

### Progress the learner can trust

Keep the existing ring’s fullness/recall and color/stability semantics. Add a clear indication of the objective represented. Do not present a mixed-mode stability estimate as “I can use this word in conversation.”

Show a small set of observations, each with its sample size:

- Unaided meaning recall on delayed attempts.
- Unaided Danish production on delayed attempts.
- Target use in previously unseen sentence contexts.
- Listening comprehension without transcript, including replay usage.
- Short communicative tasks completed, and support required.

Measure response latency only between comparable tasks and modalities. Typing speed, device latency, audio loading, and speech-recognition processing are not mental retrieval time. For speaking, measure time from the end of a ready prompt to the start of speech, with repeated recordings on comparable material. Prefer a personal trend to a universal five-second fluency threshold.

## 6. AI implementation approach

Use the existing OpenRouter integration for text generation and semantic feedback. Do not switch providers as the first learning intervention. Provider selection should follow a Danish-specific evaluation of correctness, useful feedback, latency, and cost. This plan does not claim that the currently routed model is the best Danish tutor.

AI should produce small practice packs: a sense-specific teaching example, an optional hint, a validated target span or answer set, a transformation, and a bounded scenario. Provide only a limited set of genuinely familiar supporting words. A saved entry or the current “mastered” label is not sufficient proof that a supporting word is easy.

Prefer existing approved examples and a small curated frame bank. Generate additional variations when useful. Context complexity should be checked, with a conservative initial rule of one primary learning target and at most one additional unfamiliar supporting word. This is an application constraint, not an assertion of a universal lexical-coverage threshold.

| Function | Approach | Required checks |
|---|---|---|
| Session planning | Deterministic policy | Due ordering, estimated duration, new-target budget, unresolved retries, skill need. |
| Practice generation | Existing text adapter; cache approved output | Meaning, language, target spans, morphology, ambiguous alternatives, difficulty, length. |
| Short-answer checking | Exact accepted variants first; semantic review when necessary | Do not let edit distance alone accept a different short word, negation, or grammatical meaning. |
| Sentence feedback | Structured semantic and form judgments | Preserve learner intention; identify one actionable issue; abstain on uncertainty. |
| Audio | Validated Danish recordings or a benchmarked Danish TTS service | Pronunciation, sentence prosody, content/audio match, replay behavior on installed iOS PWA. |
| Speech input | Later, a separately evaluated Danish ASR integration | Transcript confirmation, noise cases, recognition failures, native-script support. |

Speech synthesis and recognition are separate capabilities from the current text pipeline. Begin spoken practice with model audio, speaking aloud, and optional local recording/self-check. Do not block the learning redesign on automated pronunciation assessment.

Cache packs by entry revision, sense, language, level, task type, and prompt/model version. Invalidate when the source changes. Preload the next approved exercise and its audio during an authorized session. Avoid serial generation and multi-pass correction on every keystroke. The existing sentence-correction pipeline can inform validation, but its several model calls should not automatically become the hot path for every review.

Honor the app’s manual-first AI preference: an explicit start/enable action authorizes AI-assisted practice. Generated exercises are separate from saved vocabulary fields. Suggestions to change source translations or examples remain preview-and-apply actions.

Use session-level budgets for generated packs, grading calls, and audio. Measure actual token usage, audio duration, cache hit rate, waiting time, and failed attempts before quoting operating costs. If generation fails or the budget is exhausted, continue with validated cached or deterministic material.

## 7. Implementation sequence

This is a proposed sequence, not authorization to implement or deploy it. Effort classes indicate relative complexity rather than delivery promises.

| Stage | Deliverable | Relative effort | Exit condition |
|---|---|---|---|
| 0. Reliable baseline | Fix unreachable cloze refresh; validate blanks; record exercise mode, prompt version, assistance, and attempt timing; add a short diagnostic. | Small–medium | Valid exercises, observable first attempts, preserved Again/revision behavior. |
| 1. Core ten-minute practice | Time-budgeted session, adaptive new intake, forgotten-item repair, stable objective selection, lazy production tracking, basic frame transformations, speak-aloud/self-check. | Medium–large | A complete session works with existing/cached material and can end or resume with unresolved cards intact. |
| 2. Listening and constrained dialogue | Danish audio, hidden-transcript prompts, curated dialogue trees, structured AI feedback, optional recording. | Medium–large | Native-reviewed examples, usable iPhone flow, no forced failure on provider or microphone problems. |
| 3. Evidence and refinement | Weekly transfer checks, skill-specific progress, provider benchmark, optional ASR, targeted phonetic practice. | Medium | Measurable improvement on unaided delayed and novel tasks at the same time budget. |

The first useful release should contain stages 0 and the core of stage 1. The spoken-learning objective is only partially addressed until direct listening and speaking practice are available; a text-only release should say so.

### Likely code boundaries

| Layer | Existing extension points | Proposed addition |
|---|---|---|
| Session UI | `components/ReviewSession.tsx`, `app/review/page.tsx`, `app/page.tsx` | Guided session renderer, repair state, timer, resumable queue. |
| Exercise policy | `lib/review.ts`, `lib/answer.ts`, `lib/types.ts` | Explicit objective/task types, selection rules, structured grading outcomes. |
| AI | `lib/openrouter.ts`, `app/api/ai/review-sentence/route.ts`, `app/api/ai/check-answer/route.ts`, `app/api/ai/check-example/route.ts` | Validated practice packs and scoped sentence feedback; use provider adapters. |
| Scheduling | `app/api/review/rate/route.ts`, `app/api/review/revise/route.ts` | Objective-aware updates, atomic/idempotent writes, consistent rating revisions. |
| Progress | `components/MemoryRing.tsx`, existing progress views | Objective labels and delayed evidence, retaining established visual semantics. |
| Persistence | Existing review and cache concepts | Proposed objective records, practice events, versioned packs, resumable session state. |

These persistence concepts are not a verified migration design. Before database work, inspect current production tables, constraints, RLS, functions, and migrations through Supabase MCP. Review access rules and legacy one-card assumptions, including notification counts and Words/Sentences views. New directions must not double-count entries in reminders or destabilize historical rating revisions.

Keep schema changes additive where possible. Put the guided flow behind a reversible feature flag. Migration must preserve review histories and permit returning to ordinary review without deleting newly collected evidence.

## 8. Thirty-day learning and evaluation plan

Assume an early-A1 learner with uncertain productive ability until a baseline is measured. If the learner is near zero, spend more time on initial encoding and simpler exchanges. If already near A2, diagnose missing abilities rather than restarting beginner material.

| Period | Learning emphasis | Evidence to collect |
|---|---|---|
| Day 1 | Baseline within the ten-minute allowance: sampled existing words, a few production prompts, short listening items, one brief speaking task. | Unaided accuracy, recurring confusions, support needed, comparable recording. No advance review of test answers. |
| Days 2–7 | Repair weak high-value items; requests, preferences, uncertainty, asking for repetition. | Whether corrected items survive a later-day attempt. |
| Days 8–14 | Sentence frames, questions, negation, simple main-clause word order; everyday listening. | Novel substitutions and one unseen scenario variant. |
| Days 15–21 | Combine familiar chunks in short exchanges; add past-time language only if ready. | Transfer to an unpracticed prompt and independent follow-up response. |
| Days 22–30 | Consolidate; reduce new intake if needed; compare parallel baseline tasks. | Delayed retrieval, new-context use, listening, and response ease without warm-up. |

Early scenario families can cover introducing oneself, ordering, shopping, arranging a time, describing a routine, expressing an opinion, and clarifying a misunderstanding. Select a small subset relevant to daily life. These are internal lesson choices; no folder or tagging system is required.

Avoid flooding the learner with near-synonymous new words together. Research on semantic clustering is mixed, but a 133-person study found more interference errors for related items despite no overall posttest-score difference.[^24] Introduce one useful expression first; add comparisons after the learner has an initial anchor.

### A personal effectiveness check

Run practical evaluation at a fixed time budget. Select two matched sets of existing troublesome targets, balanced roughly by baseline accuracy, frequency, length, and entry kind. Randomize sets to ordinary spaced recall or the redesigned repair/production practice, with comparable total time. Keep both under appropriate spaced scheduling and record outside exposure where feasible.

Measure unaided recall and a new-context production probe after comparable delays, recording all intervening exposure. Do not show one direction’s answer just before testing the other. Counterbalance direction or assign different items to avoid contaminating the test. Use approximately 20–30 items per condition if enough suitable entries exist; smaller samples are still useful observations but highly uncertain.

For a more controlled retention check, hold a small optional subset without intervening app practice for seven days, then test before giving feedback. Label that protocol explicitly; ordinary due reviews with varying intervals answer a different question. Avoid converting the entire personal app into an experiment.

An initial product success criterion could be a ten-percentage-point improvement in delayed unaided production, or a clear increase in correct novel sentences with no loss of meaning recall, at similar total time. This is a chosen threshold for usefulness, not a forecast or a claim of statistical significance. Show raw counts and denominators, because a small personal sample can move substantially with only a few answers.

Repetition itself can improve assessment performance. Use parallel unseen tasks, comparable difficulty, and the same scoring rubric. Where feasible, have a Danish speaker rate baseline and final recordings without knowing their order. An AI-only evaluation is provisional, especially if the same model generated the lesson and judges the outcome.

### Interpreting the A2 goal

CEFR A2 concerns functional communication across reception, production, and interaction; its spoken-fluency descriptors explicitly allow noticeable hesitation and reformulation.[^20] Automatic responses in familiar situations are a worthwhile target, but effortless general conversation is not the definition of A2.

Cambridge’s English guidance estimates about 180–200 cumulative guided hours from beginner to A2 and 90–100 to A1.[^21] Those are approximate English-learning guidelines, not Danish-specific requirements and not a formula for this learner. They nevertheless illustrate why five hours cannot support a reliable promise of an entire proficiency level.

At day 30, judge improvement in the practiced repertoire and transfer samples. Do not assign A2 from word counts, streaks, memory rings, or AI encouragement. A broader CEFR judgment needs tasks spanning listening, reading, writing, and interaction. If faster broad progress is essential, add real Danish use outside the app—for example a brief daily exchange and comprehensible listening—while reporting that as additional time.

## 9. Acceptance checks and privacy

Manual acceptance checks for implementation:

1. Fail a production prompt; receive relevant repair; see the same objective later in the active session. Verify the single-card case and Good ↔ Again revisions.
2. Exercise cloze at all supported repetition states; verify a valid hidden span, inflected targets, phrases, repeated occurrences, and an example that does not contain the target.
3. Use a valid synonym, a meaning-changing near-spelling word, an incorrect negation, a wrong article, and an uncertain answer. Verify distinct and useful feedback.
4. Reveal a hint, copy a model, and then pass a later unaided attempt. Verify that the three events are represented differently in progress and scheduling.
5. Complete a ten-minute session with many due items. Verify no forced new material, no falsely completed retries, and correct resumption after leaving.
6. Test audio, microphone denial, interruption, unavailable AI, stale generated packs, and slow network on a narrow iPhone and installed PWA.
7. Verify baseline and weekly checks use unseen variants without answer leakage; verify that time since exposure and sample size appear in the result.
8. Verify production objectives preserve history, owner access, notification counts, ring semantics, and source-edit confirmation.

Use focused tests for policy, grading boundaries, idempotent rating/revision writes, and migration invariants. Run `pnpm build` for implementation changes, then check GitHub Build and Vercel for the exact deployed SHA before reporting production success.

The research plan introduces no provider calls containing personal learning data and no runtime changes. Future AI requests should include only the material needed for the exercise. Keep credentials server-side, validate generated objects and user input, maintain owner-scoped access, and avoid logs containing answers or recordings. Audio upload must be explicit; offer transient processing and deletion controls instead of retaining recordings by default. Content-level correctness matters because an incorrect example can itself be learned.

## 10. Scope and remaining uncertainties

This is a targeted evidence review using original studies, research syntheses, and official proficiency guidance available on 10 September 2026. It is not an exhaustive systematic review of every linguistic-learning publication. Publisher abstracts were used for broad findings where full text was restricted; accessible full text was examined for the particularly relevant Danish sentence-generation study and several transfer/spacing studies. Sample sizes and reported outcomes above are limited to what the cited sources support.

No study establishes the optimal allocation of this exact ten-minute routine, the ideal number of new targets for this learner, or the best current model for Danish feedback. The comparative benefit of separate FSRS objectives is an engineering hypothesis motivated by distinct skills, not a result demonstrated by the cited experiments. Provider quality, audio quality, learner baseline, and live database compatibility remain implementation-stage checks.

## Sources

[^1]: Kim, S. K., & Webb, S. (2022). [The Effects of Spaced Practice on Second Language Learning: A Meta-Analysis](https://onlinelibrary.wiley.com/doi/10.1111/lang.12479). *Language Learning, 72*, 269–319. Basis: 48 experiments; spacing and retention timing.

[^2]: Karpicke, J. D., & Roediger, H. L. III. (2008). [The Critical Importance of Retrieval for Learning](https://doi.org/10.1126/science.1152408). *Science, 319*, 966–968. Basis: retrieval after initial successful learning.

[^3]: Rawson, K. A., & Dunlosky, J. (2022). [Successive Relearning: An Underexplored but Potent Technique for Obtaining and Maintaining Knowledge](https://journals.sagepub.com/doi/10.1177/09637214221100484). *Current Directions in Psychological Science*. Basis: retrieval across repeated learning sessions; review, not an Ordly trial.

[^4]: Nakata, T. (2017; online 2016). [Does Repeated Practice Make Perfect? The Effects of Within-Session Repeated Retrieval on Second Language Vocabulary Learning](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/does-repeated-practice-make-perfect-the-effects-of-withinsession-repeated-retrieval-on-second-language-vocabulary-learning/F14BA8A576CD2563D14CEA46E35D842E). *Studies in Second Language Acquisition, 39*, 653–679. Basis: retrieval frequency versus time efficiency.

[^5]: Yanagisawa, A. (2016). [The Effects of Receptive and Productive Word Retrieval Practice on Second Language Vocabulary Learning](https://www.jstage.jst.go.jp/article/katejournal/30/0/30_11/_article). *KATE Journal, 30*, 139–152. Basis: learning direction; small artificial-vocabulary experiment.

[^6]: Kim, S. K., & Webb, S. (2023). [Does Spaced Practice Have the Same Effects on Different Second Language Vocabulary Learning Activities? Fill-in-the-Blanks Versus Flashcards](https://onlinelibrary.wiley.com/doi/abs/10.1111/modl.12879). *The Modern Language Journal, 107*, 944–964. Basis: activity comparison and two-week retention.

[^7]: van den Broek, G. S. E., Takashima, A., Segers, E., & Verhoeven, L. (2018). [Contextual Richness and Word Learning: Context Enhances Comprehension but Retrieval Enhances Retention](https://onlinelibrary.wiley.com/doi/10.1111/lang.12285). *Language Learning, 68*, 546–585. Basis: informative contexts versus memory retrieval.

[^8]: Barcroft, J. (2004). [Effects of Sentence Writing in Second Language Lexical Acquisition](https://journals.sagepub.com/doi/10.1191/0267658304sr233oa). *Second Language Research, 20*, 303–334. Basis: possible interference from demanding sentence writing during initial form learning.

[^9]: Boers, F., Eyckmans, J., Kappel, J., Stengers, H., & Demecheleer, M. (2006). [Formulaic Sequences and Perceived Oral Proficiency: Putting a Lexical Approach to the Test](https://journals.sagepub.com/doi/pdf/10.1191/1362168806lr195oa). *Language Teaching Research, 10*, 245–261. Basis: small phrase-focused instructional study.

[^10]: Lyster, R., & Saito, K. (2010). [Oral Feedback in Classroom SLA: A Meta-Analysis](https://waseda.elsevierpure.com/en/publications/oral-feedback-in-classroom-sla-a-meta-analysis/). *Studies in Second Language Acquisition, 32*, 265–302. Author-affiliated repository record. Basis: feedback, prompts, and constructed responses.

[^11]: Nakata, T., & Suzuki, Y. (2019). [Mixing Grammar Exercises Facilitates Long-Term Retention: Effects of Blocking, Interleaving, and Increasing Practice](https://onlinelibrary.wiley.com/doi/abs/10.1111/modl.12581). *The Modern Language Journal*. Basis: interleaving grammar and delayed judgments.

[^12]: Abdi Tabari, M., Zhuang, J., & Farahanynia, M. (2025). [Task Repetition and L2 Oral Performance: A Meta-Analysis](https://doi.org/10.1016/j.system.2025.103868). *System, 135*, 103868. Basis: heterogeneous effects of repeated oral tasks.

[^13]: Kakitani, J., & Kormos, J. (2024). [The Effects of Distributed Practice on Second Language Fluency Development](https://doi.org/10.1017/S0272263124000251). *Studies in Second Language Acquisition, 46*, 770–794. Basis: 116 learners, four sessions, delayed fluency assessment.

[^14]: Suzuki, Y., & Hanzawa, K. (2022; online 2021). [Massed Task Repetition Is a Double-Edged Sword for Fluency Development: An EFL Classroom Study](https://doi.org/10.1017/S0272263121000358). *Studies in Second Language Acquisition, 44*, 536–561. Basis: mixed fluency effects and limits of transfer.

[^15]: Uchihara, T., Karas, M., & Thomson, R. I. (2025). [High Variability Phonetic Training: A Meta-Analysis of L2 Perceptual Training Studies](https://doi.org/10.1017/S0272263125100879). *Studies in Second Language Acquisition, 47*, 794–827. Basis: 79-study perception synthesis.

[^16]: Uchihara, T., Karas, M., & Thomson, R. I. (2024). [Does Perceptual High Variability Phonetic Training Improve L2 Speech Production? A Meta-Analysis of Perception-Production Connection](https://doi.org/10.1017/S0142716424000195). *Applied Psycholinguistics, 45*, 591–623. Basis: limits of perception-to-production transfer.

[^17]: Wang, F., Cheung, A. C. K., Neitzel, A. J., & Chai, C. S. (2025; online 2024). [Does Chatting with Chatbots Improve Language Learning Performance? A Meta-Analysis of Chatbot-Assisted Language Learning](https://journals.sagepub.com/doi/10.3102/00346543241255621). *Review of Educational Research, 95*(4). Basis: 28-study synthesis; varied chatbot systems.

[^18]: Lyu, B., Lai, C., & Guo, J. (2025; online 2024). [Effectiveness of Chatbots in Improving Language Learning: A Meta-Analysis of Comparative Studies](https://doi.org/10.1111/ijal.12668). *International Journal of Applied Linguistics, 35*, 834–851. Basis: 31-study synthesis and moderating design factors.

[^19]: Paddags, B., Hershcovich, D., & Savage, V. (2024). [Automated Sentence Generation for a Spaced Repetition Software](https://aclanthology.org/2024.bea-1.29/). *Proceedings of BEA 2024*, 351–364. [Full text](https://aclanthology.org/2024.bea-1.29.pdf), especially sections 4.2, 4.3, and 7. Basis: small Danish pilot and its stated limitations.

[^20]: Council of Europe. (2020). [Common European Framework of Reference for Languages: Learning, Teaching, Assessment—Companion Volume](https://rm.coe.int/common-european-framework-of-reference-for-languages-learning-teaching/16809ea0d4). Especially oral comprehension, production, interaction, and fluency, printed p. 142. Basis: official proficiency constructs.

[^21]: Cambridge English. [Guided Learning Hours](https://support.cambridgeenglish.org/hc/en-gb/articles/202838506-Guided-learning-hours). Accessed 10 September 2026. Basis: approximate cumulative hours for English, not a Danish forecast.

[^22]: Nation, P. (2007). [The Four Strands](https://openaccess.wgtn.ac.nz/articles/journal_contribution/The_four_strands/12552167). *Innovation in Language Learning and Teaching, 1*(1), 2–13. Basis: curriculum framework, not an experimentally optimized daily ratio.

[^23]: Trecca, F., et al. (2019). [Segmentation of Highly Vocalic Speech Via Statistical Learning: Initial Results From Danish, Norwegian, and English](https://portal.findresearcher.sdu.dk/en/publications/segmentation-of-highly-vocalic-speech-via-statistical-learning-in/). *Language Learning, 69*, 143–176. Basis: Danish-related phonetic hypothesis and null experimental finding.

[^24]: Nakata, T., & Suzuki, Y. (2019). [Effects of Massing and Spacing on the Learning of Semantically Related and Unrelated Words](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/effects-of-massing-and-spacing-on-the-learning-of-semantically-related-and-unrelated-words/F58BA8D70385603B9C42E408BFCB8A10). *Studies in Second Language Acquisition, 41*, 287–311. Basis: semantic interference and mixed overall effects.

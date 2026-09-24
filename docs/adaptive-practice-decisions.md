# Adaptive practice — decision record

Source: [issue #11](https://github.com/Sevastian-Bahynskyi/ordly/issues/11).
Interview started 2026-09-24 using `grill-with-docs`, `grilling`, and `domain-modeling`.
Status: approved on 2026-09-24 at Q20; interview closed. The approval includes the headword-and-forms requirement in D17. The resulting [specification](adaptive-practice-spec.md) is published as [issue #12](https://github.com/Sevastian-Bahynskyi/ordly/issues/12).

## Requirements supplied by the issue

- Integrate the ten existing `ordly-exercises` formats into Ordly's native experience.
- Select varied exercises using learner history, weaknesses, existing knowledge, and review needs.
- Build a rich reusable vocabulary, phrase, sentence, and grammar foundation through B2.
- Prefer authoritative data and deterministic pipelines for facts; use generation where the content requires it.
- Follow this interview with `/to-spec`, then `/to-tickets`, with at most five implementation issues.

## Accepted decisions (confirmed at Q20)

### D1. Review remains the default

Review is the main experience by default. Practice is always available as an optional action. Settings offers Review-only or Review + Practice for the default study session; the combined experience is opt-in. This replaces the suggested Review/Practice primary-mode selector, which did not capture the user's intent. Mixed-session ordering is settled in D13.

### D2. Material supplies learning targets; the catalog is global

Both Review and Practice target existing Material only. The catalog is a global corpus, while Material is the learner's own library; the two must remain distinct. An unfamiliar word encountered during practice should be tappable and easy to add explicitly to Material. This supersedes round 1's allowance for automatic catalog introductions and rejects the proposal for independent catalog learning progress. Supporting words and explicit saving are settled in D14.

### D3. No runtime AI in practice

Practice uses no runtime AI for construction, grading, explanations, hints, or missing examples. Content and accepted answers are prepared beforehand. The user rejects arbitrary Danish prose tasks; exercises must be bounded so they do not need an open-ended evaluator. Existing composer AI is outside this change's removal scope. The user intends to remove AI from the app entirely in future; that intention is not a request to remove it everywhere now. See [ADR 0001](adr/0001-practice-without-runtime-ai.md).

### D4. One learner-language preference

English is the default for new profiles. Existing users retain their selected language. One app-wide preference controls supplied learner-facing content consistently in English or Russian. Manually written translations are preserved; existing Ukrainian material is retained without expanding Ukrainian support. The specification must detail locale availability and switching without rewriting manual content or resetting Review progress; unsupported exercises follow D16.

### D5. Two measures of content coverage

Measure text coverage against a named, agreed collection and separately measure coverage of situations, phrases, meanings, and grammar through B2. A vocabulary count is not a proxy for B2 competence. The specification must investigate and name the collection, counting rules, and acceptance thresholds; the issue's roughly 90% goal is not yet a validated measurement.

### D6. Deliver populated content through B2

Completion requires all ten formats and substantial usable content across A1–B2. A small internal pilot validates quality before full population; expansion tooling alone does not satisfy the issue. The specification must establish evidence-based content quantities and quality acceptance criteria; the interview does not invent numerical quotas.

### D7. Review alone measures retention

Practice must not affect Review at all. There is no independent catalog progress or separate practice retention metric. This rejects the recommendation that a successful practice recall task could satisfy a scheduled Review obligation; the user's answer to Q10 was a dash and is not treated as assent. The explicit rule in Q8 governs. See [ADR 0002](adr/0002-review-owns-retention.md).

### D8. Adapt exercises by ability without changing Review

Distinguish recognition, unaided recall, contextual use, and relevant grammar/forms when adapting practice. The user accepted separate abilities only on the condition that these are not mixed with Review. Internal adaptation history is permitted under D12, without a separate progress metric.

### D9. Start from level and existing history

Begin using the selected Danish level and available history; adapt through early exercises. A short calibration is optional, not a mandatory placement test. Review history is an input to practice selection, never an output of practice.

### D10. Choose duration at each practice start

Offer 5, 10, 20, or custom minutes whenever practice starts, with a maximum of 30 minutes. Duration is a session-planning target, not permission to cut off an answer. The specification must make the practice duration clear in the mixed-session interface without implying that all due reviews fit within it.

### D11. Existing-material intake boundary

The Q14 response begins with agreement but specifically limits both modes to Material. There is therefore no autonomous catalog-introduction budget to implement. Preserve the existing Review new-word allowance; practising a saved word must not consume or alter Review progress. Explicit saving makes a new word available under the ordinary Material and Review rules. The specification must make any exercise targeting that word conditional on successful saving and sufficient prepared content.

### D12. Internal practice history is permitted (Q15)

Retain internal, skill-specific practice history solely to select future exercises. It may capture mistakes and support used but must not create practice retention scores or memory rings, update Review, or change Review counters. This resolves the distinction between adaptive exercise selection and an independent progress system.

### D13. Review before practice for the same due word (Q16)

In mixed sessions, review due words before practising those same words. Other items may be interleaved. Clearly distinguish actual Review tasks from Practice exercises, and apply scheduling ratings only to actual Review tasks. Practice must not present an answer immediately before the Review test of that same word.

### D14. Supporting words and explicit saving (Q17)

An unsaved word may appear sparingly as supporting context, with an accessible translation, but it is never an assessed target. Tapping it opens its meanings; an explicit Add to Material action saves the selected content under its catalog headword, with its forms, as specified in D17. Saving a new word creates an ordinary new Review card without awarding progress. Encountering, translating, or tapping a word alone does not save it.

### D15. Bounded grading across all ten formats (Q18)

Use prepared accepted answers, including valid alternative orders where appropriate, with no unrestricted writing. Forgive harmless typing slips only when they do not change the feature being tested. Attribute mistakes to the relevant word rather than marking every matched word incorrect. Allow an explicit I don't know outcome. Keep revealed/self-rated outcomes distinguishable from independently checked answers. This contract permits all ten formats while requiring improvements to the prototype's grading and result granularity.

### D16. Missing content degrades practice safely (Q19)

Use only formats safely supported by the available content for a saved item; skip unsupported formats. Never invent missing content or call AI. If insufficient usable material remains, explain the limitation and offer a shorter session. Ordinary Review remains available. Catalog coverage is therefore a delivery requirement, but a catalog miss must not prevent ordinary use of manually saved Material.

### D17. Add the headword with its forms from any encountered form (Q20 clarification)

Whenever the learner chooses to add a word, check the encountered form against the catalog. If it resolves to a catalog word, save that word's headword/lemma as the normal Material entry and populate its catalog data and full verified set of forms, including the originally encountered form. Do not save an inflection as a separate standalone word merely because that was the form the learner encountered. This rule applies across word-add entry points, including adding from practice.

For example, choosing to add `gulvet` resolves to the headword `gulv`; the saved word includes `gulvet` among its forms. Headword and lemma name the same base-form concept here, not two independent fields with different meanings. See [ADR 0003](adr/0003-add-catalog-headwords-with-forms.md).

The specification must preserve the existing safeguards when applying this rule: distinguish ambiguous lexical readings using verified catalog/reference facts and explicit candidate selection where necessary; do not invent a headword or missing forms when lookup cannot establish them; use the existing duplicate/meaning-selection protections if the corresponding word is already in Material. This is not authorisation to merge existing entries or reset their Review histories. Whole phrases and sentences retain their existing handling rather than being collapsed to a word.

## Approval and handoff

The user explicitly confirmed the design, closed the interview, and approved it with D17 included. No further interview confirmation is pending. `/to-spec` is complete in [issue #12](https://github.com/Sevastian-Bahynskyi/ordly/issues/12), labelled `ready-for-agent`. The next stage is `/to-tickets` with at most five implementation issues. Carry every accepted decision into those tickets; source and schema checks recorded in the specification are a verified baseline, not proof that implementation is complete.

## Final interview budget

The user capped the interview at 20 questions total after answering Q1–Q14. Q15–Q19 were answered with all recommendations accepted, and Q20 confirmed the design with the headword-and-forms clarification. All 20 questions are complete; do not reopen the interview. Detailed algorithms, dataset verification, implementation choices, and measurable acceptance design belong in the specification.

## Design tree

The product branches below are settled and confirmed through Q20. Research and engineering obligations are explicitly assigned to the specification; they are not claims of completed investigation or additional interview questions.

- Default experience (D1, D7, D10)
  - Settled: Review default, always-available optional Practice, opt-in mixed sessions, 5/10/20/custom minutes capped at 30.
  - Settled: Review precedes Practice for the same due word; other items may interleave with explicit task identity (D13).
- Material and catalog (D2, D9, D11)
  - Settled: Material-only targets, no independent catalog progress, start from level/history, optional calibration.
  - Settled: occasional unfamiliar supporting words with translation and explicit Add to Material (D14).
  - Settled: resolve additions from any encountered word form to the catalog headword and populate all verified forms, including the encountered form (D17).
- Practice without runtime AI (D3)
  - Settled: no arbitrary prose and no runtime AI; ability-specific adaptation separate from Review.
  - Settled: internal adaptation history, bounded grading contract, and safe degradation for missing content (D12, D15, D16).
  - Specification obligation: preserve existing PWA behavior; AI-free practice is not a promise of offline operation.
- Learner language (D4)
  - Settled: English default for new users, preserve existing preferences/manual content, English/Russian supplied content, retain legacy Ukrainian.
  - Specification obligation: preserve learning identities and Review history across language switches; cover unavailable locale content under D16.
- Coverage and delivery (D5, D6)
  - Settled: populated A1–B2 content and all ten formats, measured text coverage plus separate learning coverage; no claim that vocabulary count proves proficiency.
  - Specification obligations: verify benchmarks, authoritative datasets, and current terms of use; define measurable coverage, quality, and population thresholds.
  - Specification obligations: model sentence validity, meaning/form identity, accepted answers, safe recombination, provenance, corrections, versioning, and repeatable audits.
- Completion of specification
  - Migration and regression requirements, performance, accessibility, and iPhone PWA verification.
  - Shared understanding confirmed at Q20; the interview is closed.
  - Detailed specification and at most five coherent implementation tickets.

## Repository observations

These are code/documentation observations, not a live database audit.

- At interview start, local HEAD and remote `main` were `afa664ee5429c7f78e31c1fde6846b4b08e7251e`. GitHub Build and the Vercel commit status both reported success.
- Existing practice distinguishes meaning and production objectives and records assistance (`lib/practice.ts`).
- Existing saved entries carry one set of meaning text, and the catalog reader selects Russian meanings (`lib/catalog.ts`).
- A sense objective's content version includes its meaning text (`lib/practice-content.ts`). Translating that text in place could invalidate learning state; the migration must not assume a language preference change is only a presentation change.
- Existing catalog lookup copies content into editable saved entries; saved-entry rendering is independent of future catalog changes (`lib/catalog.ts`).
- Existing lookup already maps typed single-word forms through COR to candidate catalog lemmas and fetches catalog forms. `unlockedDraft` selects the lemma for the Danish field, but its return shape does not include forms (`lib/catalog.ts`). D17 therefore requires end-to-end verification of form population rather than assuming lookup alone fulfils it.
- Existing practice can update a Review card through an explicitly rated typed meaning-recall task carrying that card's identity. Other practice tasks update separate objectives; choices cannot update Review (`lib/practice-server.ts`, `lib/practice.ts`).
- The historical `commit_practice` database function also permits Review writes and updates shared streak fields. The redesign must enforce the boundary server-side and in the database, including legacy clients; removing only the new interface's call would be insufficient (`supabase/migrations/20260910204137_guided_practice.sql`).
- Practice also writes shared sense coverage, can append user-provided meanings, and may fill saved examples. These are existing cross-mode effects to address explicitly; no new design may silently retain them under the label of adaptation (`lib/practice-server.ts`).
- Existing historical Review logs do not reliably identify practice-originated ratings. Preserve historical cards and logs rather than attempting a speculative cleanup; prevent old sessions from resuming through retired write paths.
- The practice planner combines abilities into an entry-level score, and a sense objective is not separated by ability (`lib/practice-targets.ts`, `lib/practice-senses.ts`). This is current behavior, not an accepted model for the redesign.
- The existing level setting does not drive the practice start flow. Practice is currently organised into item batches; the older ten-minute flow in documentation is not a functioning timer (`lib/practice-server.ts`, `components/PracticeSession.tsx`).
- In `ordly-exercises`, typed grading checks an authored accepted-answer list, ordering allows one authored sequence, and matching records one exercise-wide result. These restrictions require explicit grading decisions before migration ([formats](https://github.com/Sevastian-Bahynskyi/ordly-exercises/tree/main/src/exercises), [evidence](https://github.com/Sevastian-Bahynskyi/ordly-exercises/blob/main/src/evidence/practiceEvidence.ts)).
- All ten formats support bounded tasks with prepared answers; none requires arbitrary prose, runtime AI, listening, or speaking. Flash-reveal is self-reported recall rather than independently checked correctness. Restricting production to bounded tasks does not require dropping a format.

## Documentation and verification

This interview changes documentation only. It does not alter application behavior, schema, learner data, or deployment. Documentation formatting and local links are checked; runtime tests are not applicable until implementation begins.

Manual acceptance scenarios to carry into the specification for D17:

1. Add a catalog word through an inflected form; verify the saved Danish text is its headword and the complete verified form set includes the encountered form.
2. Add the headword directly; verify the same catalog data and forms are populated.
3. Encounter a different form of an already saved word; verify duplicate handling preserves the existing entry and Review history.
4. Try an ambiguous form and a catalog miss; verify no unsupported lexical identity or forms are silently invented.
5. Add a whole phrase or sentence; verify its existing handling is preserved.

These are proposed implementation acceptance checks, not tests executed against the current app.

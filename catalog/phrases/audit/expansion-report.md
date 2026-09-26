# Phrase expansion audit (issue #28)

Every batch in `catalog/pipeline/phrases-0001` … `phrases-0014` went through the corpus pipeline
(`scripts/content-batch.ts`): DeepSeek generation, Azure Translator, back-translation, two independent
reviews with adjudication, one repair round, the deterministic gate, then **a full read of every item
that passed** (defects corrected or dropped in each batch's `corrections.json`, with a note), and only
then a **seeded, stratified audit sample** of 30 items (`audit.json`, seed in `batch.json`). A batch was
loaded only at ≥95% clean with no severe finding; every finding in a passing sample was repaired too
(the last entries of `corrections.json`, noted `audit <seed>`).

The full read and the audit were done by the same reader (Claude, in the implementing session), so
the audit measures what that read left behind, not an independent second opinion.

## Result

| | sampled | clean | rate | 95% interval (Wilson) |
|---|---|---|---|---|
| **all strata** | 420 | 411 | 97.9% | 96.0%–98.9% |
| example | 142 | 137 | 96.5% | 92.0%–98.5% |
| meaning | 142 | 140 | 98.6% | 95.0%–99.6% |
| pronunciation | 136 | 134 | 98.5% | 94.8%–99.6% |

Severe findings: **0**. Including the one failed sample (phrases-0007, seed 2807: 28/30, both findings
minor and repaired before the redraw), 439 of 450 sampled items were clean.

## Per batch

| batch | planned | loaded | corrected | dropped | seed | clean | severe | note |
|---|---|---|---|---|---|---|---|---|
| phrases-0001 | 30 | 21 | 14 | 6 | 2801 | 29/30 | 0 |  |
| phrases-0002 | 60 | 44 | 21 | 2 | 2802 | 30/30 | 0 |  |
| phrases-0003 | 60 | 48 | 18 | 4 | 2803 | 29/30 | 0 |  |
| phrases-0004 | 60 | 47 | 21 | 6 | 2804 | 29/30 | 0 |  |
| phrases-0005 | 60 | 42 | 19 | 8 | 2805 | 30/30 | 0 |  |
| phrases-0006 | 60 | 43 | 18 | 2 | 2806 | 29/30 | 0 |  |
| phrases-0007 | 60 | 50 | 28 | 2 | 2907 | 30/30 | 0 | seed 2807 failed 28/30; repaired, redrawn |
| phrases-0008 | 60 | 41 | 31 | 2 | 2808 | 29/30 | 0 |  |
| phrases-0009 | 60 | 41 | 23 | 4 | 2809 | 29/30 | 0 |  |
| phrases-0010 | 60 | 43 | 27 | 6 | 2810 | 30/30 | 0 |  |
| phrases-0011 | 60 | 35 | 16 | 12 | 2811 | 29/30 | 0 |  |
| phrases-0012 | 60 | 40 | 22 | 12 | 2812 | 29/30 | 0 |  |
| phrases-0013 | 60 | 38 | 19 | 6 | 2813 | 29/30 | 0 |  |
| phrases-0014 | 60 | 43 | 27 | 8 | 2814 | 30/30 | 0 |  |
| **total** | 810 | 576 | 304 | 80 | | | | |

`corrected` and `dropped` count items (a meaning, an example or a hint) the full read changed or removed.

## Findings in the passing samples

- phrases-0001: m:sidde på|phrase#2: ru «удерживать» reads as physically holding; «держать при себе» is the meaning
- phrases-0003: e:løbe ud|phrase#2: ru «стекает» (drips down); running out of the bucket is «вытекает»
- phrases-0004: e:være afhængig af|phrase#1: ru/uk «зависит от машины, чтобы добраться» is a calque; «без машины не может добраться до работы» is natural
- phrases-0006: m:stå over for|phrase#1: double parenthetical «перед (лицом) (проблемой, выбором)» is clumsy
- phrases-0008: e:køle af|phrase#2: uk «перш ніж ми про це говоримо» wants the perfective «поговоримо»
- phrases-0009: e:falde fra hinanden|phrase#1: stol is a chair (стул/стілець), not an armchair (кресло/крісло)
- phrases-0011: e:dele sig op|phrase#1: elever are pupils: ru «Ученики», en «pupils», not students
- phrases-0012: p:holde fast i|phrase: the stress is on fast (холэ фа́сд и), not on holde
- phrases-0013: p:tage magten|phrase: magten [ˈmɑɡ̊d̥n̩] keeps its g: «ма́гдн»

## What the full read found most often

- **Hints written from spelling or with a dropped sound**: an `r` the IPA does not have (`over` [ɒwʌ] → «оуа», not «овэр»; `bord` → «боа»), soft d written «дь», a weak form under the stress (`til` → «тэль» only when stressed).
- **Stress**: phrases whose stress the type rule placed wrongly (a reflexive verb with an adverb particle, `sætte sig NED`; `tage af STED`), which led to fixes in `phraseStressIndex`; where the main meaning takes another stress (`gå på` attend), the hint was moved by hand (`stress` in the correction).
- **Meanings of a longer expression** filed under a shorter one (`komme til` for `komme til at`, `trække sig` for `trække sig tilbage`) and **free combinations** presented as the phrase (`hænge på væggen`).
- **Danish the reviewers let through**: a particle before a full object (`lægger til lidt salt`, `skar over rebet`), wrong gender (`en årskort`), `var` for `varede`.
- **Translations**: *aften* as night, a plan in the present simple, formal «вы» for *du*, Russian-style Ukrainian.

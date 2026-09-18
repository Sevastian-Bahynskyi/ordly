# Free data instead of AI calls

Ordly calls a model for seven jobs. Some of them are asking a language model to guess a
fact that is already published, for free, by the people who define it. Danish noun gender is
the clearest case: `en` or `et` is recorded in an authoritative CC0 dataset, and Ordly pays a
model to have an opinion about it.

This document records what was verified, what was measured, and — as often — what turned out
not to be worth doing. Every number here comes from downloading the thing and running it, not
from reading its documentation. Where a claim could not be verified, it says so.

Researched 2026-09-18. No AI provider was called during this research.

**What was actually scoped for building** is issue #5, which is narrower than this document:
automatic noun gender from COR, validation of AI output on write, and optionally a spelling
pre-filter. The eSpeak pronunciation replacement was researched and then dropped — it does not
reduce AI usage, because pronunciation is filled inside the same `/api/ai/enrich` call as
meanings and the example sentence. The research below is kept in full so the decision can be
revisited with the evidence rather than re-run.

## Summary

| Job | Today | Verdict |
|---|---|---|
| Noun gender `en`/`et` | AI (`/api/ai/refine-senses`) | **Replace** — COR, with the ambiguity guard below |
| Part of speech | AI (`/api/ai/refine-senses`) | **Replace the unambiguous 64%**, AI decides the rest |
| Base form, single word | AI (`/api/ai/base-form`) | **Replace** — COR, 100% coverage |
| Base form, multi-word | AI | **Keep AI** — COR has none of them |
| Phrase/sentence verification | AI | **Keep AI** |
| Spelling of a written sentence | AI (`/api/ai/check-example`) | **Add a free pre-filter**, AI still judges naturalness |
| Pronunciation | AI, cached | **Batch-fill with eSpeak NG**, AI as fallback |
| Per-sense Russian meanings | AI (`/api/ai/enrich`) | **Keep AI** — no free source exists |
| Example sentence + translation | AI (`/api/ai/enrich`) | **Keep AI** |
| Synonyms | AI (`/api/synonyms/discover`) | **Keep AI** |

## COR — Det Centrale Ordregister

Source: <https://ordregister.dk/> · dataset page <https://sprogteknologi.dk/dataset/cor>

- **Licence: CC0-1.0.** No attribution, no share-alike. The cleanest licence of anything considered.
- **v1.5.1.0**, 2025-12-16, tracking Retskrivningsordbogen 5.1.
- Direct download `https://ordregister.dk/files/cor1.5.1.0.tsv` → HTTP 200, **31,206,228 bytes**, UTF-8.
- A webservice exists (<https://ordregister.dk/doc/COR.Webservices.html>) and was not tested. A
  local table removes the network dependency and is preferred.

### Real file layout

Tab-separated, no header, **535,774 rows**, exactly six fields:

| # | Field | Example |
|---|---|---|
| 1 | COR-id | `COR.63042.120.01` |
| 2 | Lemma | `håndklæde` |
| 3 | Glosse | *(usually empty)* |
| 4 | Grammatical tag | `sb.itk.sg.ubest` |
| 5 | Form — the lookup key | `håndklæde` |
| 6 | Normering | `N` / `K` / `U` |

Gender lives in field 4: `sb.fk.*` → `en`, `sb.itk.*` → `et`.

**The published README is wrong about field 6.** <https://ordregister.dk/doc/COR-README.html>
documents it as `1`/`0`; the shipped file contains `N` (319,467), `K` (168,534), `U` (47,773).
The meanings are inferred, not documented. `U` holds noise such as `dansk → danskere`. Filtering
to `N` drops 423,726 forms to 247,527 (−42%) and costs exactly one vocabulary word (`yndlings`).

### Measured coverage, against the 104 real entries

```
single-word tested : 94
resolved to lemma  : 94  (100%)   misses: none
nouns              : 32  → all 32 got a gender
multi-word         : 0 of 9 matched
```

Lookup works on inflected forms: `gulvet`→`gulv`, `dovne`→`doven`, `ligger`→`ligge`. It covers
`badetøj`, `håndklæde` and `solbrille` — the exact compounds DanNet fails on.

### The trap: 35% of forms are part-of-speech ambiguous

A bare form lookup silently writes **wrong** data:

| entry | means | naive COR result |
|---|---|---|
| `ved` | знать / около | noun `et` — that is *wood* |
| `tage` | брать | noun `et` — that is *roof* |
| `virke`, `selv`, `næsten`, `tit` | — | all resolve wrongly |

Only 12 of 32 nouns are safe without more information.

**The design that works:** filter COR candidates by the sense's existing `pos` before reading
gender. Then 30 of 32 nouns are unambiguous, and a spot-check against known truth was 14/14
correct. The two that remain — `plan` and `alt` — are genuinely both genders in Danish and no
source can resolve them.

### Import shape

A Supabase table, not a bundled file: 19 MB parsed per cold start is exactly the critical-path
cost AGENTS.md §16 warns about. ~320k rows after the `N` filter, `create index on cor_form(form)`,
reference data so `grant select` only.

## Spelling — `nspell` + `dictionary-da`

- `dictionary-da` is tri-licensed `GPL-2.0 OR LGPL-2.1 OR MPL-1.1` (read from the installed
  package's own licence file). **Take MPL-1.1** — file-level copyleft, imposing nothing on
  Ordly's own code. `nspell` is MIT. No key, no service, no network.
- Built from Stavekontrolden 2.8.034, itself built on DSL data.

### Blocking bug, and its fix

Loaded naively it flags **12.2%** of the vocabulary, including `blive`, `hvem`, `hver`, `nogle`.
Those words are present, but their lines carry Hunspell morphological fields
(`blive ph:blir al:bliver …`) that nspell does not strip. Sampling 400 of each kind:

| dictionary entries | count | nspell accepts |
|---|---|---|
| without morphological fields | 142,892 | 100.0% |
| with morphological fields | 23,134 | 31.0% |

Strip to the first whitespace-delimited token at build time (`line.split(/[ \t]/)[0]`).

### After the fix

- **False positives: 1 of 98 = 1.0%.** The single flag is `tinker`, which is not a Danish word
  — it sits in the vocabulary meaning "поправлять, чинить". The true rate is **0%**, and the
  free checker caught a real data error that the paid enrichment path had produced a confident
  Russian translation for.
- Learner errors: **14 of 16 caught**; correct suggestion ranked first for 11 of 14, top-three
  for 13 of 14. `badetoj→badetøj`, `lejlighet→lejlighed`, `begynner→begynder` all first hit.
- Whole sentences: 8/8 correct, including `København` and a comma before a subordinate clause.
- The two misses, `skulderne` and `stadigt`, are real words in the wrong form. **That is the
  dividing line: orthography belongs to nspell, form and naturalness stay with the model.**
- Cost: 571 ms to construct, 126 MB heap, 3.04 MB cleaned dictionary; lookups 0.2 µs,
  suggestions 1.3 ms. Build lazily at module scope.

### LanguageTool — rejected

Its Danish spelling match returns rule id `HUNSPELL_RULE`: it is the same dictionary, over a
network, capped at 20 requests/minute. On the broken sentence `Han skulderne gør ondt.` it
returned **zero** matches.

## Pronunciation — eSpeak NG

### The current data is defective

Of 36 sampled `pronunciation_cache` values, **5 (13%) contain Latin letters silently mixed into
Cyrillic**: `forklare=фоклaa` (U+0061), `gang=гaнг`, `håndklæde=хoнклэл` (U+006F),
`derfor=дэ́aфо`, `afhænge=áф-` (U+00E1). Invisible on screen, and they break search and sort.

The values are also self-contradictory: `grine→гри́не` but `dovne→до́унэ` for the same `-ne`
ending. **No deterministic system can score 100% against this target, because the target follows
no rule.** Do not treat the existing values as a baseline to match.

### What was measured

- eSpeak NG produced output for **all 40 test words**, zero failures, stød included.
- IPA→Cyrillic is a deterministic transform. A first-draft ~50-rule table scored 11/36 exact and
  17/36 close (77%); three refinements reached **80%**.

| word | eSpeak IPA | converted | stored | |
|---|---|---|---|---|
| `lige` | `lˈiə` | ли́э | ли́э | exact |
| `dovne` | `dˈɔwnə` | до́унэ | до́унэ | exact |
| `bare` | `bˈɑɑ` | ба́а | ба́а | exact |
| `gulvet` | `ɡˈɒlʋəð` | го́лвэ | го́лвэ | exact |
| `fordi` | `fʔʌdˈʔi` | фоди́ | фу́ди | converter is right — Danish stresses `-di` |
| `håndklæde` | `hˈʔʌnklɛðə` | хо́нклээ | хoнклэл | converter is right — stored ends in a bogus `л` |

Several apparent mismatches are the converter being **more correct than the AI**.

### Runtime — one trap

`phonemizer@1.2.1` (2.6 MB) is **English-only** and throws `Invalid language identifier: "da"`.
`espeak-ng@1.0.2` (18 MB WASM, GPL-3.0-or-later) does embed Danish (`da_dict`, `lang/gmq/da`)
and instantiates under Node. 18 MB is too heavy for a serverless request path, so the right
shape is an **offline batch that pre-fills `pronunciation_cache`**, with the AI kept as the
fallback for anything eSpeak cannot handle.

### NST Danish lexicon — could not be obtained

META-SHARE lists 237,873 words but states **"Download location: _hidden_"**. The nb.no resource
pages return 404 and every guessed path 404s. The licence shown there is CC BY-NC-SA 3.0, which
contradicts the "Unrestricted Use" seen elsewhere; unresolved. Someone would have to email
`sprakbanken@nb.no`. **Nothing here should be built on the assumption that NST is available.**

## What stays on AI, and why

These were investigated twice, independently, and both rounds reached the same answer.

**Per-sense Russian meanings.** Free Danish→Russian lexicography effectively does not exist.
Kaikki glosses Danish words in *English* (`kun` → "only"); ru.wiktionary has no Danish entry for
`hyggelig`; Glosbe's free API returns 404. DeepL and LibreTranslate both cover da→ru but return
**one string per call** — they cannot produce Ordly's shape, an ordered list of distinct senses
each with part of speech. You would get `lige → "прямо"` and silently lose `ровный` and
`только что`, which is the sense model that FSRS objectives are keyed to.

**Example sentences.** OpenSubtitles has **14.3M** da–ru pairs, so volume was never the problem;
register and faithfulness are. `badetøj` returns two hits, one religious prose, one whose Russian
is a loose rewrite rather than a translation. `dovne` returns nothing at all. A generated
sentence is pitched at the learner's level and is guaranteed to contain the target word. Viable
only as an opportunistic cache-fill where a short clean hit happens to exist.

**Synonyms.** DanNet (CC BY-SA 4.0, ~70k synsets) returns **0 synsets for `kun`**, and for `bare`
only the adjective "naked" — not the adverb. Wordnets systematically exclude function words, and
every synonym pair Ordly actually has is a function-word adverb. Usable only as an extra positive
signal for content words such as `sjov`/`morsom`, never as the gate.

## Rejected

| Candidate | Reason |
|---|---|
| **DDO / ordnet.dk** | No public API; site is © DSL, all rights reserved |
| **Retskrivningsordbogen** | Free but requires signing a contract by email; COR is CC0 and supersedes it |
| **Wikidata Lexemes** | CC0, but no gender on the noun checked and coverage could not be measured |
| **Glosbe API** | Free endpoint returns 404; effectively dead |
| **PanLex** | `api.panlex.org` unreachable |
| **WikiMatrix / CCMatrix / NLLB** | Machine-mined by embedding similarity; known precision problems |
| **JW300** | Register wholly wrong for a beginner |
| **LanguageTool** | Same Hunspell dictionary over a rate-limited network; 0 matches on broken grammar |
| **spaCy `da_core_news_sm`** | 94.5% lemma accuracy, but Python — not this stack |

## Sources

COR <https://ordregister.dk/doc/COR.html> ·
COR dataset <https://sprogteknologi.dk/dataset/cor> ·
COR README <https://ordregister.dk/doc/COR-README.html> ·
nspell <https://github.com/wooorm/nspell> ·
dictionary-da <https://github.com/wooorm/dictionaries/tree/main/dictionaries/da> ·
eSpeak NG languages <https://github.com/espeak-ng/espeak-ng/blob/master/docs/languages.md> ·
NST Danish <https://metashare.ut.ee/repository/browse/nst-lexical-database-for-danish/b93f8704f36811e1a6e4005056b40024d36d7794d2ac4073a80242366287a530/> ·
DanNet <https://wordnet.dk/dannet/page/about> ·
Kaikki Danish <https://kaikki.org/dictionary/Danish/index.html> ·
LanguageTool API <https://dev.languagetool.org/public-http-api> ·
OPUS OpenSubtitles <https://opus.nlpl.eu/legacy/OpenSubtitles-v2018.php> ·
DeepL languages <https://developers.deepl.com/docs/getting-started/supported-languages> ·
Tatoeba <https://tatoeba.org/en/downloads> ·
awesome-danish <https://github.com/fnielsen/awesome-danish>

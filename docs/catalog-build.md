# Building the word catalog

The plan, the measurements behind it and the non-goals are issue #6. This is the runbook: what to
run, in what order, and what each step refuses to do.

The build has three layers and **only the middle one is a model** (issue #6 §3). Layer 1 looks
facts up, layer 2 writes the judgements no source can answer, layer 3 rejects anything that
contradicts layer 1. That is why the generator is swappable and why the quality does not depend on
which model wrote a row.

## What you need first

- **A frequency ranking.** The DSL lemma list. There is no checkbox — the licence page says that
  downloading *is* the acceptance, and the files are linked from it:
  <https://korpus.dsl.dk/resources/licences/dsl-open.html> → `freq-lemma.zip`. It holds two
  editions of 29,999 lemmas: `freq-30k-ex.txt` (no proper nouns or numerals — use this one) and
  `freq-30k-in.txt`. Not committed, following the COR precedent: the source dataset stays at its
  source and the repo keeps what was derived from it.

  **The real format is not what the description implies.** Three tab-separated fields: a
  *one-letter* word class, the lemma, and a frequency that is a **proportion** of the corpus, not
  a count. The codes are undocumented and were decoded from the data — `NC` common noun, `V` verb,
  `A` adjective, `D` adverb, `T` preposition, `P` pronoun, `C` conjunction, `L` numeral, `I`
  interjection; `NP` proper nouns, `M` bound morphemes (`@erne`), `U`, and every `*W` fragment
  class are dropped. Same lesson as COR's normering field: the shipped file is what is trusted.

  **Licence:** DSL Open. Redistribution and derived works are permitted with attribution, and
  there is one restriction worth knowing — the resources may not be used to publish a dictionary
  or a product competing with DSL's own. Ordly is a personal single-user learning app.

  *Credit: frequency data from the [Society for Danish Language and Literature](https://dsl.dk).*
- **The Wiktionary phonetics extract**, once, ~95 MB, not committed:
  `curl -O https://kaikki.org/dictionary/Danish/kaikki.org-dictionary-Danish.jsonl`
  It is the *fallback* for IPA, not the main source — see step 6.
- **COR loaded** in the linked project (`scripts/import-cor.ts`). Without it every word fails the
  gate's lemma check, which is the correct behaviour and a useless run.
- **`download_ddo_audio.py` in the repo root**, for step 6.

## Step 0 — measure before spending anything

```
pnpm exec tsx scripts/rank-coverage.ts --ranking ~/Downloads/lemmas.tsv
```

Prints the hit rate of the ranking against the words actually in the vocabulary. **Choose N from
that curve.** Below 60% at the deepest depth the script stops: the value proposition has changed
and the build is not worth paying for.

Measured against the real vocabulary on 2026-09-19 (94 single-word entries):

| depth | 1,000 | 2,000 | **3,000** | 5,000 | 10,000 | 20,000 | 30,000 |
|---|---|---|---|---|---|---|---|
| coverage | 64.9% | 79.8% | **87.2%** | 88.3% | 92.6% | 94.7% | 94.7% |

**N is 3,000.** Ten thousand costs 3.3× as much and buys 5.4 points; the curve is flat from 3k to
5k and never passes 94.7%. The five words missing at any depth — `yndlings`, `værre`, `nogle`,
`solbrille`, `følgende` — are mostly not lemmas at all, which the base-form check already handles
at save time.

Multi-word entries are reported separately, never counted as misses. A lemma list contains no
phrases by construction, so scoring `godt lide` against it would measure nothing.

## Step 1 — the facts

```
pnpm exec tsx scripts/build-catalog-facts.ts \
  --ranking ~/Downloads/lemmas.tsv \
  --ipa kaikki.org-dictionary-Danish.jsonl \
  --limit 10000 \
  --phrases catalog/phrases.txt \
  --out catalog/facts.jsonl
```

Zero model tokens. Per lemma: frequency rank, part of speech, gender, definite singular and
indefinite plural (COR), and IPA (Wiktionary, part-of-speech matched).

**Whatever a source cannot settle stays null, and null travels.** `ved` reaches the generator with
no part of speech because the register reads it two ways; a word with no IPA must be generated
with a null pronunciation. The generator may not fill a null (§8 rule 7) and the gate rejects a
row that tried (§9).

## Step 2 — pilot on 100 words

Run steps 3–6 on the first 100 lemmas and read all 100 by hand. A bad prompt found at word 40
costs nothing; found at word 6,000 it costs the run.

## Step 3 — generate

```
pnpm exec tsx scripts/write-generator-batches.ts --facts catalog/facts.jsonl --size 50
```

Writes `catalog/prompts/batch-NNNN.txt`, each holding the contract from
`lib/catalog-contract.ts` with that batch's facts already embedded, plus `index.json` (the
`--start` offset the validator needs per batch) and a README. 3,000 words at 50 per batch is 60
files.

Any generator may write the reply — Claude subagents, ChatGPT in the browser, or a cheap API
model. In a browser, **a new chat per batch**: a long conversation drifts, and a model that has
answered thirty times starts shortening fields and dropping rows. Replies go to
`catalog/out/batch-NNNN.json`, which is committed — it is the expensive artefact.

`catalog/prompts/phrases.txt` asks for the phrase list, which is a separate and later pass.

## Step 4 — the gate

```
pnpm exec tsx scripts/validate-catalog.ts \
  --facts catalog/facts.jsonl \
  --input catalog/out/batch-0001.json \
  --sources scripts/catalog-validation-sources.ts \
  --start 0 --size 40
```

Every row, zero tokens. Failures go to `catalog/needs_review.jsonl`, never to the catalog. A batch
below 95% clean exits non-zero: **stop and diagnose, do not fix it later.**

Both source checks fail closed. `findMisspellings` returns `null`, not `[]`, when the dictionary
could not be built, and no caller may read "the check did not run" as "every word is correct".

### The second pass: meanings the first one left out

The first run returned exactly one sense for 98.1% of rows. Rule 6 warned against padding, and a
generator working through fifty words reads that as "one is safest" — which is right for `gulv`
and wrong for `gang`, `lige`, `prøve`, `rejse` and `kilde`, every one of which the learner's own
vocabulary already carried two meanings for.

`scripts/write-sense-pass.ts` re-asks the frequent end of the ranking with the default inverted:
it shows the generator what it already wrote and asks what is missing. Polysemy is concentrated in
common words, so the top 1,000 is where nearly all the missing meanings are.

Measured over the top 1,000: rows with more than one meaning went from **0% to 34%** (306 with
two, 36 with three). `lige` is now "только что · прямо · как раз", `gang` is "раз · коридор ·
походка".

It cost two rules that turned out to be written for a one-sense catalog, and both were fixed
rather than waived:

- **A sense may depart from the facts' part of speech where COR also lists the lemma in that
  class.** `dansk` is an adjective and a noun, `hvis` a conjunction and a possessive, `for` a
  preposition, an adverb and a conjunction. The register is what authorises the departure, so
  there is still no room to invent a word class, and a check that could not run authorises
  nothing.
- **The register answers what the string matcher cannot.** `findInSentence` cannot see through a
  stem change, so it rejected `Hun kan svømme` as an example of `kunne`, `Vi går i skole` for
  `gå`, `Hun vandt løbet` for `vinde` — every irregular verb, and therefore most of the commonest
  words in the language. COR holds those forms. Consulted only after the matcher says no, it
  rescued 46 correct examples of 49.

Final: **2,906 of 3,000 rows clean (96.9%)**.

## Step 5 — audit

```
pnpm exec tsx scripts/audit-catalog.ts --facts catalog/facts.jsonl --out catalog/out
# read catalog/audit-sample.md, fill in `failures` in catalog/audit-verdicts.json, then:
pnpm exec tsx scripts/audit-catalog.ts --tally catalog/audit-verdicts.json
```

The gate has already rejected everything mechanically checkable, so the audit exists for the
residue: rows that are **well-formed and wrong**. `bare` glossed as "только что" instead of
"только" is Cyrillic, non-empty and in the right script — it passes every validator, and it is the
exact mistake that once linked `bare` to `lige` in the synonym graph (AGENTS.md §20). The six
classes worth recording are listed in the report itself.

**The sample is stratified, not uniform**, and the strata are the point. A uniform draw over ten
thousand rows is mostly a draw from the comfortable middle: it returns a reassuring number while
under-sampling the shapes that fail — the tail of the ranking, the words COR could not classify
(so the generator chose), the rows with no IPA (where the pronunciation must be null), the
three-sense rows, the phrases. Every batch is represented, so a batch that drifted late shows up.

`--seed` is recorded in the report, so a sample can be redrawn exactly or handed to a second
reader. The tally reports **rates per class with a margin**, never a per-row certificate: 200 rows
measure a rate to within about ±7 points at worst, and say nothing about whether row 7,431 in
particular is right. Below 95% clean it exits non-zero.

**Pronunciation is the one class to be sceptical of when a model audits a model** — it is the same
class of system that wrote the row, with the same blind spot. Once step 6 has run you have an
independent signal for free: the DDO recording of the word. Checking the Cyrillic against a human
actually saying it is a stronger test than any amount of re-reading the IPA, and it is worth doing
as its own pass over the sample.

## Step 6 — audio, and the transcriptions that ride along with it

**Run this before the final fact build.** It is where the IPA actually comes from.

```
node scripts/audio-batches.mjs --facts catalog/facts.jsonl --output catalog/audio
```

Wiktionary knows the phonetics of only **53%** of the top 3,000 lemmas, and 1,365 of the 1,410
misses are simply absent rather than mismatched, so no amount of better matching lifts it. DDO
knows nearly all of them — but a bare search cannot be read for this: `stadig` returns
`stadigvæk`'s article first, and taking it would record a different word's sounds.

The audio run has already solved that. It scores DDO's articles by headword and part of speech and
downloads from the one it picked, so the transcription on that same page belongs to the right
word, and harvesting it costs no extra request. `ved|noun` resolves to the noun's `[ˈveð]`.

It also makes the §8 anchors derivable rather than hand-tuned: DDO gives `stadig` `[ˈsdæːði]`,
`selvfølgelig` `[sεˈføli]`, `synes` `[ˈsynəs]`.

Harvested transcriptions land in `catalog/ddo-ipa.json`, merged across runs (`--skip-existing`
fetches no page, so a second run reports no IPA for words it skipped). Feed them back:

```
pnpm exec tsx scripts/build-catalog-facts.ts --ranking ... --ipa ... \
  --ddo-ipa catalog/ddo-ipa.json --limit 3000 --out catalog/facts.jsonl
```

Measured on the real run, 3,000 words: 2,969 recordings (36 MB), **2,847 transcriptions**, and
final IPA coverage of **95.5%** (2,847 DDO + 19 Wiktionary) against 53% without this.

Drives `download_ddo_audio.py` 500 words at a time, recording each batch in
`catalog/audio-manifest.json`; re-running continues from the first batch that is not done. Words
only, base forms only, `|pos` hints so a homograph resolves to the right article.

**Phrases get no audio, and that is not a gap.** DDO attaches audio to headwords only: `godt lide`
exists there as a fixed expression under `lide`, with a definition and no recording of its own.
Stitching word recordings together is rejected — the citation forms are wrong (`tage`, not
`tager`) and Danish reshapes phrase boundaries, so the result would teach a wrong pronunciation,
which is AGENTS.md §8's ban in audio form.

A missing recording never blocks a row. The word enters the catalog silent and the tap-to-hear
button does not render.

## Step 7 — upload (a separate, short session)

Issue #6 §11: read the CSVs, upsert `word_catalog` / `word_catalog_sense`, upload `catalog/audio/`
to the private bucket, write back `audio_path`, verify counts and a few signed URLs, and confirm
the miss path still works for a word deliberately absent from the catalog.

## Why the steps are not in the issue's order

The issue puts audio last. It belongs before the final fact build, because the audio run is what
collects the IPA the generator needs (step 6). The order that works: 0 → 1 (Wiktionary IPA only)
→ 6 → 1 again (with `--ddo-ipa`) → 3 → 4 → 5.

## The one departure from the issue as written

Issue #6 §3 says IPA comes from "DDO/Wiktionary through the existing `lib/pronunciation.ts` path".
There is no such path. AGENTS.md §8 describes it as the *intended* pipeline, but the shipped code
asks a model for Cyrillic directly from the Danish word and stores `ipa: ''`,
`ddo_ipa: []`, `wiktionary_ipa: []`. Ten thousand DDO fetches to build one would be thirty
thousand requests against a dictionary with no API; kaikki.org publishes the same Wiktionary
phonetics as one file, joined offline and part-of-speech tagged. DDO remains the audio source.

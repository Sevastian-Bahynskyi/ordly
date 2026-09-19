# The instruction to give ChatGPT

Paste everything below the line into ChatGPT (with repository access — Codex, or any agent that
can read and write files in this repo on branch `feat/catalog-pipeline`).

If you are instead using plain chat with no repo access, see "Without repo access" at the bottom.

---

You are filling in a pre-built Danish vocabulary catalog for the Ordly repository, on the branch
`feat/catalog-pipeline`.

## The job

The directory `catalog/prompts/` contains 60 files named `batch-0001.txt` … `batch-0060.txt`.
Each one is a complete, self-contained prompt: it states the output contract and embeds the 50
words that batch is about, with the facts already looked up for them.

For each batch, in order:

1. Read `catalog/prompts/batch-NNNN.txt`.
2. Do exactly what that file says.
3. Write the resulting JSON array to `catalog/out/batch-NNNN.json` — the bare array, nothing else.
   No Markdown, no code fence, no commentary, no wrapper object.
4. Check only what you can check without a database: the file parses as JSON, it is an array,
   it has exactly 50 objects, and the lemmas are the same ones in the same order as the input.

Commit after every few batches so nothing is lost, and push to `feat/catalog-pipeline`.

**Do not run `scripts/validate-catalog.ts`.** The real gate checks every lemma against the COR
word register, which lives in a Supabase project this sandbox has no credentials for. The check
fails closed on purpose — "the check did not run" must never be read as "everything passed" — so
in this environment every row would be rejected and you would regenerate good batches forever.
Validation happens locally, against the pushed branch, after you have generated.

## The rules that matter most

These are repeated from the batch files because they are the ones that get broken. The validator
enforces every one of them, and a batch that violates them is rejected whole.

- **Return exactly 50 objects, in exactly the input order.** Never reorder, omit, merge or add a
  word. The array length and order are checked.
- **Never invent a fact.** `gender`, `pos`, `definite_singular` and `ipa` come from the input. If
  the input says `"gender": null`, every sense's gender must be `null`. If the input gives a
  `pos`, every sense must use exactly that one.
- **`pronunciation` is a Russian-Cyrillic reading of the supplied `ipa`, never of the Danish
  spelling.** If `"ipa": null`, then `"pronunciation": null` — 134 of the 3,000 words are in that
  state and must come back silent. No Latin letters anywhere in the pronunciation.
- **Russian meanings in Cyrillic only.** One Latin homoglyph fails the row.
- **One example per sense**, simple everyday Danish at about A2, with a natural Russian
  translation. The example must contain the word (an inflected form is fine) and must demonstrate
  *that* sense.
- **1 to 3 genuinely distinct senses**, most common first, ordinals 1, 2, 3 with no gaps. Do not
  pad with near-duplicates.

## What not to touch

Do not modify `catalog/facts.jsonl`, `catalog/ddo-ipa.json`, `catalog/prompts/`, `lib/`,
`scripts/`, or anything else. The only files you create are `catalog/out/batch-NNNN.json`.

## When the words are done

`catalog/prompts/phrases.txt` is a separate, later job: it asks for a list of Danish multi-word
expressions. Do all 60 word batches first.

---

## Without repo access

If ChatGPT cannot read the repository, do it by hand: open `catalog/prompts/batch-0001.txt`, paste
its entire contents into a **new chat**, and save the reply as `catalog/out/batch-0001.json`.
Repeat per batch.

A new chat each time is not superstition — in one long conversation a model starts shortening
fields and dropping rows after twenty or thirty replies, and the validator rejects the batch.

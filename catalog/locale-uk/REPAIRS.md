# Ukrainian wording: hand repairs (issue #24)

Rows the generator could not get past the gate after three model rounds and one repair pass,
fixed by hand after reading the Danish, Russian and English. Everything else in
`catalog/locale-uk/uk/` is as the pipeline wrote it.

| batch | lemma | model's wording | kept | why |
|---|---|---|---|---|
| 0063 | levering | доставка, постачання | доставка, постачання | Correct; `доставка` is standard Ukrainian missing from the Hunspell dictionary (added to `UKRAINIAN_EXTRA` in `lib/ukrainian.ts`). |
| 0085 | prioritering | пріоритезація, розстановка пріоритетів | визначення пріоритетів, пріоритезація | `розстановка` is a Russism. |
| 0116 | uheldig | неудачливий, невезучий | невдачливий, якому не щастить | `неудачливий` and `невезучий` are Russisms. |

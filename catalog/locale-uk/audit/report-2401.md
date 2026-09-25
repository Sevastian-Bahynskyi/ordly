# Ukrainian audit report, seed 2401

| stratum | reviewed | clean | rate | ±95% | severe |
|---|---|---|---|---|---|
| overall | 240 | 236 | 98.3% | 1.6 | 0 |
| kind: phrase | 8 | 8 | 100.0% | 0.0 | 0 |
| kind: word | 199 | 195 | 98.0% | 1.9 | 0 |
| level: A1 | 6 | 6 | 100.0% | 0.0 | 0 |
| level: A2 | 6 | 6 | 100.0% | 0.0 | 0 |
| level: B1 | 15 | 15 | 100.0% | 0.0 | 0 |
| level: B2 | 6 | 6 | 100.0% | 0.0 | 0 |
| pos: adjective | 22 | 22 | 100.0% | 0.0 | 0 |
| pos: adverb | 8 | 7 | 87.5% | 22.9 | 0 |
| pos: conjunction | 6 | 6 | 100.0% | 0.0 | 0 |
| pos: interjection | 6 | 6 | 100.0% | 0.0 | 0 |
| pos: noun | 89 | 89 | 100.0% | 0.0 | 0 |
| pos: numeral | 6 | 5 | 83.3% | 29.8 | 0 |
| pos: phrase | 6 | 6 | 100.0% | 0.0 | 0 |
| pos: preposition | 6 | 6 | 100.0% | 0.0 | 0 |
| pos: pronoun | 6 | 6 | 100.0% | 0.0 | 0 |
| pos: verb | 52 | 50 | 96.2% | 5.2 | 0 |
| type: example | 89 | 88 | 98.9% | 2.2 | 0 |
| type: family | 33 | 33 | 100.0% | 0.0 | 0 |
| type: wording | 118 | 115 | 97.5% | 2.8 | 0 |

## Findings

- `wording:4852ec44-b51a-54e2-b59c-6f824971cd93`: form — 'наявний' is an adjective for a verb meaning; repaired to «є, існує (безособова конструкція)»
- `example:d0658d7b-863d-5a90-bd00-a6a4c25bf849`: unnatural — agreement: 'було тисяча' → 'була тисяча'; repaired to «На концерті була тисяча людей.»
- `wording:52c23462-339e-5479-a3a1-7ca4db20f128`: scope — 'вимагати' is 'demand/require', not 'request'; repaired to «запитувати, мати попит на»
- `wording:84826f99-4439-5b50-8216-c98eb2c15114`: russian — 'вступати в силу' is a Russian calque; repaired to «набирати чинності, вступати (на посаду)»

**PASS**: every stratum at or above 95% clean, no severe finding.

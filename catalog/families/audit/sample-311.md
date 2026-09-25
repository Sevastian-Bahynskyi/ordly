# Sentence-family audit sample, seed 311

29 sentences from 29 families. Record findings in `verdicts-311.json` using:

- `wrong_sense`: The sentence does not demonstrate the sense it is filed under (severe)
- `ungrammatical`: The Danish is ungrammatical or wrongly inflected (severe)
- `unnatural`: Grammatical, but not what a native speaker would say
- `ambiguous_gap`: With the translation shown, another common word or form also fits the gap
- `bad_order`: An authored alternative word order is wrong, or a common valid order is missing
- `translation_en`: The English translation does not say what the Danish says
- `translation_ru`: The Russian translation does not say what the Danish says
- `level_or_cell`: The level, situation or grammar label does not describe the sentence

## 1. god — good / хороший
`87f46012-a105-5361-9658-c14911e11202` · A1 · food-drink · adjective-meaning · catalog

- da: Den her suppe er god.  (target: **god**)
- en: This soup is good.
- ru: Этот суп хороший.

## 2. lille — small, little / маленький
`83d552f0-487a-5c2a-a3c5-26905f242f12` · A1 · home · adjective-meaning · catalog

- da: Badeværelset er mindre.  (target: **mindre**)
- en: The bathroom is smaller.
- ru: Ванная меньше.

## 3. sin — his, her, its, their own (reflexive possessive) / свой
`e60545f5-cfb8-57e7-9737-ed947420515f` · A2 · family · pronouns · catalog · constrained_slots

- da: Min søster elsker sin have.  (target: **sin**)
- en: My sister loves her garden.
- ru: Моя сестра обожает свой сад.

## 4. altid — always / всегда
`0af79962-943f-5460-afdb-2e87e20ba1ea` · A2 · daily-routine · adverbs · catalog · constrained_slots

- da: Jeg spiser altid havregryn om morgenen.  (target: **altid**)
- en: I always eat oatmeal in the morning.
- ru: Я всегда ем овсянку утром.

## 5. aldrig — never / никогда
`33366cd7-338e-5e54-b298-eeff9bcbc167` · A2 · leisure · negation · catalog

- da: Min bror ser aldrig fjernsyn om aftenen.  (target: **aldrig**)
- en: My brother never watches television at night.
- ru: Мой брат никогда не смотрит телевизор по ночам.

## 6. ingen — no one, none / никто, никакой
`517a77eb-2dd1-57ec-9959-91e96322396d` · A2 · shopping · negation · catalog

- da: Der var ingen æbler tilbage i butikken.  (target: **ingen**)
- en: There were no apples left in the store.
- ru: В магазине не осталось яблок.

## 7. at — to (before a verb's infinitive) / частица перед инфинитивом глагола (не переводится отдельно)
`2898bbc0-fe1a-5314-9b4f-d1cc92c7ddc1` · A2 · education · infinitive · catalog

- da: Læreren bad eleverne om at regne.  (target: **at**)
- en: The teacher asked the students to do math.
- ru: Учитель попросил учеников заниматься математикой.

## 8. ikke — not / не
`463a7f51-00ba-5671-a2bb-86da44ee89dc` · A2 · work · negation · catalog

- da: Kollegaen har ikke læst rapporten.  (target: **ikke**)
- en: The colleague has not read the report.
- ru: Коллега не читал отчёт.

## 9. begynde — to begin, to start / начинать
`ba4b0692-3a78-510f-a35d-7674fdbdb5c9` · A2 · leisure · infinitive · catalog

- da: I ferien vil de begynde at spille tennis.  (target: **begynde**)
- en: During the holidays, they will start playing tennis.
- ru: Во время каникул они начнут играть в теннис.

## 10. fordi — because / потому что
`6c84ffae-306f-50bd-b31c-e6ae3273c636` · B1 · work · subordinate-clause · catalog · long_sentence

- da: Projektet blev forsinket, fordi vores chef sjældent svarede på vores henvendelser.  (target: **fordi**)
- en: The project was delayed because our boss rarely responded to our inquiries.
- ru: Проект был задержан, потому что наш начальник редко отвечал на наши запросы.

## 11. flytte — to move / переезжать, перемещать
`8b6c06f5-c3ac-5151-98b9-d72fa42b66cc` · B1 · home · verb-past · catalog · long_sentence

- da: Familien flyttede til en større lejlighed, fordi de ventede et barn.  (target: **flyttede**)
- en: The family moved to a larger apartment because they were expecting a child.
- ru: Семья переехала в большую квартиру, потому что ждала ребёнка.

## 12. medens — while, whereas / пока, в то время как
`af975cc3-a352-564e-bac3-632d7a90c333` · B1 · work · conjunctions · catalog · long_sentence

- da: Direktøren fokuserede på kortsigtede gevinster, medens bestyrelsen insisterede på en langsigtet plan.  (target: **medens**)
- en: The CEO focused on short-term gains, while the board insisted on a long-term plan.
- ru: Генеральный директор сосредоточился на краткосрочной выгоде, а совет директоров настаивал на долгосрочном плане.

## 13. lære — to learn / учить, изучать
`a00a541e-dc79-5b1f-8608-0b03dcf01cb4` · B1 · work · verb-perfect · catalog · long_sentence

- da: Jeg har lært meget om konflikthåndtering i løbet af det sidste år.  (target: **lært**)
- en: I have learned a lot about conflict management over the past year.
- ru: За последний год я многому научился в управлении конфликтами.

## 14. hvis — whose / чей, чья, чьё
`ceb62d1e-8adb-5675-987b-51f8b5fab905` · B1 · family · relative-clause · catalog · long_sentence

- da: Min søster, hvis børn går i den samme skole, bor lige om hjørnet.  (target: **hvis**)
- en: My sister, whose children go to the same school, lives just around the corner.
- ru: Моя сестра, чьи дети ходят в одну школу, живёт совсем рядом.

## 15. hvor — where / где
`888dc002-b1a8-5225-8c90-49a4656084b1` · B1 · home · relative-clause · catalog · long_sentence

- da: De bor i en lejlighed, hvor der er plads til et spisebord.  (target: **hvor**)
- en: They live in an apartment where there is room for a dining table.
- ru: Они живут в квартире, где есть место для обеденного стола.

## 16. sin — his, her, its, their own (reflexive possessive) / свой
`6c4295f8-4e28-51cd-b5f2-3db43b80b2bd` · B1 · family · pronouns · catalog · constrained_slots

- da: Min bror har glemt sit pas.  (target: **sit**)
- en: My brother has forgotten his passport.
- ru: Мой брат забыл свой паспорт.

## 17. ikke — not / не
`7dd06f29-0242-5566-8de9-fbfeb2b1c2a8` · B1 · society · negation · catalog · authored_orders

- da: Borgerne er ikke blevet informeret om ændringen af regeringen.  (target: **ikke**)
- en: Citizens have not been informed about the change of government.
- ru: Граждане не были проинформированы о смене правительства.
- other word orders: Om ændringen af regeringen er borgerne ikke blevet informeret.

## 18. ville — will (helper verb for the future) / буду, будет (вспомогательный глагол будущего времени)
`2ebbe5a1-1258-5a25-b0d2-d7d8fb6ef999` · B1 · weather-nature · verb-future · catalog

- da: Ifølge meteorologerne vil det blæse kraftigt i morgen.  (target: **vil**)
- en: According to the meteorologists, it will be windy tomorrow.
- ru: По словам метеорологов, завтра будет ветер.

## 19. måtte — had to (was forced to) / пришлось, был вынужден
`3262a8c0-ae1c-5043-9f34-aacdbde39f17` · B1 · services · modal-verbs · catalog

- da: Kunden måtte bestille en ny tid, fordi frisøren var syg.  (target: **måtte**)
- en: The customer had to book a new appointment because the hairdresser was ill.
- ru: Клиенту пришлось записаться на новый приём, потому что парикмахер был болен.

## 20. under — during / во время, в течение
`48283418-360f-565a-a6ee-2d9ff59be6fc` · B1 · leisure · prepositions-time · catalog

- da: Vi slapper af under sommerferien.  (target: **under**)
- en: We relax during the summer holidays.
- ru: Мы отдыхаем во время летних каникул.

## 21. siden — ago / тому назад
`439bfceb-4f43-51c2-afd1-78d09ef46331` · B1 · work · prepositions-time · catalog

- da: Virksomheden flyttede for tre måneder siden.  (target: **siden**)
- en: The company moved three months ago.
- ru: Компания переехала три месяца назад.

## 22. når — when (whenever, once) / когда
`2c3f423b-020b-5257-a5e7-9e5ce49e32cd` · B1 · home · subordinate-clause · catalog

- da: Når min mor laver mad, ser jeg fjernsyn.  (target: **når**)
- en: When my mother cooks, I watch television.
- ru: Когда моя мама готовит, я смотрю телевизор.

## 23. betyde — to mean / означать
`2b6b19e1-ef0c-5414-965a-3cbd2730ace9` · B1 · abstract · verb-present · catalog

- da: Begrebet betyder noget forskelligt afhængigt af den kulturelle baggrund.  (target: **betyder**)
- en: The term means something different depending on the cultural background.
- ru: Термин имеет разное значение в зависимости от культурного происхождения.

## 24. eftersom — since, as (because) / поскольку
`1ae304c8-0023-5e11-9dbe-494291bfd969` · B1 · society · conjunctions · catalog

- da: Eftersom regeringen havde modtaget mange klager, indførte man nye regler.  (target: **eftersom**)
- en: Since the government had received many complaints, new rules were introduced.
- ru: Поскольку правительство получило множество жалоб, были введены новые правила.

## 25. skulle — to be going to (a plan) / собираться, иметь план (о будущем действии)
`f5e8b465-be0d-5921-af06-2b5ad7d0f36e` · B1 · work · verb-future · catalog

- da: Ifølge planen skal afdelingen præsentere resultaterne i næste uge.  (target: **skal**)
- en: According to the plan, the department will present the results next week.
- ru: Согласно плану, департамент представит результаты на следующей неделе.

## 26. forsøge — to try, to attempt / пытаться
`1cb9f73b-3878-5d50-9c4a-49de00bfc645` · B1 · work · infinitive · catalog

- da: Virksomheden vil forsøge at implementere en ny strategi.  (target: **forsøge**)
- en: The company will try to implement a new strategy.
- ru: Компания попытается внедрить новую стратегию.

## 27. at — to (before a verb's infinitive) / частица перед инфинитивом глагола (не переводится отдельно)
`3101505f-c647-5e50-8d12-1465244dd169` · B1 · abstract · infinitive · catalog

- da: Det er afgørende at forstå konsekvenserne.  (target: **at**)
- en: It is crucial to understand the consequences.
- ru: Крайне важно понимать последствия.

## 28. aldrig — never / никогда
`8da51691-3bd5-5a81-acd5-45b42a6bd1b2` · B1 · feelings-opinions · negation · catalog

- da: Jeg har aldrig forstået, hvorfor han sagde op.  (target: **aldrig**)
- en: I have never understood why he resigned.
- ru: Я никогда не понимал, почему он ушёл в отставку.

## 29. selv — myself, himself, herself, itself (emphatic) / сам, сама, само
`9d37317e-0992-5108-93fd-5a79a393e2c7` · B1 · home · pronouns · catalog

- da: Mine forældre har selv bygget garagen.  (target: **selv**)
- en: My parents built the garage themselves.
- ru: Мои родители построили гараж сами.


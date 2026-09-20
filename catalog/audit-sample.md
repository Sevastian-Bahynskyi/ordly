# Catalog audit sample

200 of 2906 accepted rows · seed `1` · drawn 2026-09-20T09:46:54.768Z

The deterministic gate has already rejected everything mechanically checkable. What is left
to find here is the residue: rows that are **well-formed and wrong**. A translation that is
plausible but not what the word means passes every validator.

## What to look for

- `translation_wrong` — The Russian meaning is not what the Danish word means
- `sense_split_wrong` — The meanings are one meaning split, or a common meaning is missing
- `pronunciation_mismatch` — The Cyrillic does not read as the IPA says the word sounds
- `example_wrong_sense` — The example contains the word but does not demonstrate that meaning
- `example_translation_mismatch` — The Russian does not translate the Danish example
- `level_drift` — The example is not simple everyday Danish

## How this sample was drawn

Stratified, not uniform. A uniform draw over ten thousand rows is mostly a sample of the
comfortable middle: it returns a reassuring number while under-sampling the shapes that fail.

- **pos_unsettled** (2) — COR could not classify the lemma, so the generator chose — and can be wrong.
- **no_ipa** (24) — No IPA was found, so the pronunciation must be null. Check nobody quietly filled it.
- **three_senses** (24) — The most over-generated shape: three meanings where there is really one.
- **tail** (30) — The deep end of the ranking, where meanings get thin and examples get strange.
- **head** (30) — The most frequent words. A defect here is the one you will meet.
- **general** (90) — Drawn at random across everything else, including every batch.

## What this can and cannot tell you

A sample of 200 measures a rate to within about **±6.9 points** at worst (95% confidence; tighter when the true rate is low). It says nothing about whether any particular unsampled
row is right. A clean audit is evidence that the generator is not systematically broken — it is
not a certificate over the corpus.

---

### 1. v

- stratum: **pos_unsettled** · batch: batch-0044.json · rank 2184
- facts: pos `null` · gender `null` · IPA `[ˈveˀ]`
- pronunciation: **вэ**

1. **буква вэ** _(noun)_
   - Ordet starter med v.
   - Слово начинается с буквы вэ.

_verdict:_ `v`

### 2. plus

- stratum: **pos_unsettled** · batch: batch-0040.json · rank 1998
- facts: pos `null` · gender `null` · IPA `[ˈplus]`
- pronunciation: **плус**

1. **плюс** _(noun)_
   - Et plus et er to.
   - Один плюс один равно два.

_verdict:_ `plus`

### 3. højskole

- stratum: **no_ipa** · batch: batch-0037.json · rank 1812
- facts: pos `noun` · gender `en` · definite `højskolen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **народная высшая школа** _(noun, en)_
   - Hun går på højskole i et år.
   - Она учится год в народной высшей школе.

_verdict:_ `højskole`

### 4. generalsekretær

- stratum: **no_ipa** · batch: batch-0049.json · rank 2429
- facts: pos `noun` · gender `en` · definite `generalsekretæren` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **генеральный секретарь** _(noun, en)_
   - Hun arbejder som generalsekretær.
   - Она работает генеральным секретарём.

_verdict:_ `generalsekretær`

### 5. hjemmehold

- stratum: **no_ipa** · batch: batch-0053.json · rank 2648
- facts: pos `noun` · gender `et` · definite `hjemmeholdet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **хозяева поля, домашняя команда** _(noun, et)_
   - Hjemmeholdet vandt kampen med to mål.
   - Хозяева поля выиграли матч со счётом два мяча.

_verdict:_ `hjemmehold`

### 6. nedsætte

- stratum: **no_ipa** · batch: batch-0032.json · rank 1569
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **снижать, создавать комиссию** _(verb)_
   - Butikken vil nedsætte prisen.
   - Магазин снизит цену.

_verdict:_ `nedsætte`

### 7. overse

- stratum: **no_ipa** · batch: batch-0054.json · rank 2673
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **не заметить, упустить из виду** _(verb)_
   - Jeg overså en fejl i teksten.
   - Я не заметил ошибку в тексте.
2. **обозревать, охватывать взглядом** _(verb)_
   - Fra tårnet kan man overse hele byen.
   - С башни можно обозреть весь город.

_verdict:_ `overse`

### 8. overgreb

- stratum: **no_ipa** · batch: batch-0049.json · rank 2440
- facts: pos `noun` · gender `et` · definite `overgrebet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **насилие, посягательство** _(noun, et)_
   - Politiet undersøger et overgreb.
   - Полиция расследует случай насилия.

_verdict:_ `overgreb`

### 9. slutrunde

- stratum: **no_ipa** · batch: batch-0054.json · rank 2667
- facts: pos `noun` · gender `en` · definite `slutrunden` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **финальный этап, плей-офф** _(noun, en)_
   - Holdet er kommet i slutrunden.
   - Команда вышла в финальный этап.

_verdict:_ `slutrunde`

### 10. magtfuld

- stratum: **no_ipa** · batch: batch-0056.json · rank 2786
- facts: pos `adjective` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **могущественный, влиятельный** _(adjective)_
   - Han er en magtfuld mand i byen.
   - Он влиятельный человек в городе.

_verdict:_ `magtfuld`

### 11. indgreb

- stratum: **no_ipa** · batch: batch-0050.json · rank 2462
- facts: pos `noun` · gender `et` · definite `indgrebet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **вмешательство, процедура** _(noun, et)_
   - Lægen forklarer det lille indgreb.
   - Врач объясняет небольшую процедуру.

_verdict:_ `indgreb`

### 12. valgkamp

- stratum: **no_ipa** · batch: batch-0030.json · rank 1473
- facts: pos `noun` · gender `en` · definite `valgkampen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **избирательная кампания** _(noun, en)_
   - Avisen skriver om en valgkamp.
   - Газета пишет об избирательной кампании.

_verdict:_ `valgkamp`

### 13. pressemeddelelse

- stratum: **no_ipa** · batch: batch-0040.json · rank 1993
- facts: pos `noun` · gender `en` · definite `pressemeddelelsen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **пресс-релиз** _(noun, en)_
   - Firmaet sender en pressemeddelelse.
   - Компания выпускает пресс-релиз.

_verdict:_ `pressemeddelelse`

### 14. sommerferie

- stratum: **no_ipa** · batch: batch-0041.json · rank 2033
- facts: pos `noun` · gender `en` · definite `sommerferien` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **летние каникулы** _(noun, en)_
   - Vi rejser i sommerferien.
   - Мы путешествуем во время летних каникул.

_verdict:_ `sommerferie`

### 15. menneskerettighed

- stratum: **no_ipa** · batch: batch-0041.json · rank 2025
- facts: pos `noun` · gender `en` · definite `menneskerettigheden` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **право человека** _(noun, en)_
   - Ytringsfrihed er en menneskerettighed.
   - Свобода слова — право человека.

_verdict:_ `menneskerettighed`

### 16. hovedrolle

- stratum: **no_ipa** · batch: batch-0047.json · rank 2343
- facts: pos `noun` · gender `en` · definite `hovedrollen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **главная роль** _(noun, en)_
   - Hun har hovedrollen i filmen.
   - У неё главная роль в фильме.

_verdict:_ `hovedrolle`

### 17. indse

- stratum: **no_ipa** · batch: batch-0050.json · rank 2456
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **осознавать, понимать** _(verb)_
   - Jeg må indse, at planen ikke virker.
   - Я должен признать, что план не работает.

_verdict:_ `indse`

### 18. kulturminister

- stratum: **no_ipa** · batch: batch-0051.json · rank 2528
- facts: pos `noun` · gender `en` · definite `kulturministeren` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **министр культуры** _(noun, en)_
   - Avisen taler med en kulturminister.
   - Газета разговаривает с министром культуры.

_verdict:_ `kulturminister`

### 19. sognepræst

- stratum: **no_ipa** · batch: batch-0054.json · rank 2683
- facts: pos `noun` · gender `en` · definite `sognepræsten` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **приходской священник** _(noun, en)_
   - Sognepræsten holder gudstjeneste om søndagen.
   - Приходской священник проводит службу по воскресеньям.

_verdict:_ `sognepræst`

### 20. udbetale

- stratum: **no_ipa** · batch: batch-0045.json · rank 2238
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **выплачивать** _(verb)_
   - Firmaet vil udbetale lønnen i morgen.
   - Компания выплатит зарплату завтра.

_verdict:_ `udbetale`

### 21. nedlægge

- stratum: **no_ipa** · batch: batch-0033.json · rank 1622
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **закрывать, ликвидировать** _(verb)_
   - Kommunen vil nedlægge skolen.
   - Муниципалитет хочет закрыть школу.

_verdict:_ `nedlægge`

### 22. hovedperson

- stratum: **no_ipa** · batch: batch-0039.json · rank 1908
- facts: pos `noun` · gender `en` · definite `hovedpersonen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **главный герой** _(noun, en)_
   - Hun er hovedperson i filmen.
   - Она главный герой фильма.

_verdict:_ `hovedperson`

### 23. opfatte

- stratum: **no_ipa** · batch: batch-0025.json · rank 1217
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **воспринимать, понимать** _(verb)_
   - Jeg opfatter beskeden anderledes.
   - Я воспринимаю сообщение иначе.

_verdict:_ `opfatte`

### 24. overlæge

- stratum: **no_ipa** · batch: batch-0036.json · rank 1787
- facts: pos `noun` · gender `en` · definite `overlægen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **старший врач** _(noun, en)_
   - Hun arbejder som overlæge.
   - Она работает старшим врачом.

_verdict:_ `overlæge`

### 25. halvår

- stratum: **no_ipa** · batch: batch-0060.json · rank 2988
- facts: pos `noun` · gender `et` · definite `halvåret` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **полугодие** _(noun, et)_
   - Virksomheden fik et godt resultat i første halvår.
   - Компания показала хороший результат в первом полугодии.

_verdict:_ `halvår`

### 26. hovedpart

- stratum: **no_ipa** · batch: batch-0054.json · rank 2697
- facts: pos `noun` · gender `en` · definite `hovedparten` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **большая часть, большинство** _(noun, en)_
   - Hovedparten af eleverne bestod eksamen.
   - Большая часть учеников сдала экзамен.

_verdict:_ `hovedpart`

### 27. stof

- stratum: **three_senses** · batch: batch-0017.json · rank 847
- facts: pos `noun` · gender `et` · definite `stoffet` · IPA `[ˈsdʌf]`
- pronunciation: **сдоф**

1. **ткань, материал** _(noun, et)_
   - Kjolen er lavet af et flot stof.
   - Платье сшито из красивой ткани.
2. **вещество** _(noun, et)_
   - Dette stof er farligt for miljøet.
   - Это вещество опасно для окружающей среды.
3. **наркотик** _(noun, et)_
   - Han blev anholdt for at sælge stoffer.
   - Его арестовали за продажу наркотиков.

_verdict:_ `stof`

### 28. blive

- stratum: **three_senses** · batch: batch-0001.json · rank 16
- facts: pos `verb` · gender `null` · IPA `[ˈbliːə]`
- pronunciation: **бли́иэ**

1. **становиться** _(verb)_
   - Han blev glad.
   - Он стал радостным.
2. **оставаться, находиться** _(verb)_
   - Vi bliver hjemme i aften.
   - Мы остаёмся дома сегодня вечером.
3. **вспомогательный глагол для образования пассивного залога** _(verb)_
   - Bogen blev læst af mange.
   - Книгу прочитали многие.

_verdict:_ `blive`

### 29. for

- stratum: **three_senses** · batch: batch-0001.json · rank 11
- facts: pos `preposition` · gender `null` · IPA `[fʌ]`
- pronunciation: **фо**

1. **для** _(preposition)_
   - Denne gave er for dig.
   - Этот подарок для тебя.
2. **слишком** _(adverb)_
   - Det er for dyrt.
   - Это слишком дорого.
3. **потому что** _(conjunction)_
   - Han spiste, for han var sulten.
   - Он поел, потому что был голоден.

_verdict:_ `for`

### 30. mod

- stratum: **three_senses** · batch: batch-0002.json · rank 69
- facts: pos `preposition` · gender `null` · IPA `[moð]`
- pronunciation: **мод**

1. **к, по направлению к** _(preposition)_
   - Vi går mod stationen.
   - Мы идём к станции.
2. **против** _(preposition)_
   - Han kæmper mod sygdommen.
   - Он борется против болезни.
3. **мужество** _(noun)_
   - Hun havde mod til at sige det.
   - У неё хватило мужества сказать это.

_verdict:_ `mod`

### 31. lige

- stratum: **three_senses** · batch: batch-0002.json · rank 93
- facts: pos `adverb` · gender `null` · IPA `[ˈliːə]`
- pronunciation: **ли́иэ**

1. **только что** _(adverb)_
   - Jeg er lige kommet hjem.
   - Я только что пришёл домой.
2. **прямо** _(adverb)_
   - Gå lige ud ad denne vej.
   - Иди прямо по этой дороге.
3. **как раз, именно** _(adverb)_
   - Det var lige det, jeg mente.
   - Это как раз то, что я имел в виду.

_verdict:_ `lige`

### 32. post

- stratum: **three_senses** · batch: batch-0013.json · rank 649
- facts: pos `noun` · gender `en` · definite `posten` · IPA `[ˈpʌsd]`
- pronunciation: **пост**

1. **почта** _(noun, en)_
   - Jeg har fået post i dag.
   - Я получил почту сегодня.
2. **должность, пост** _(noun, en)_
   - Hun søger en post som direktør.
   - Она ищет должность директора.
3. **пункт, статья (в списке)** _(noun, en)_
   - Der er en ny post på budgettet.
   - В бюджете появилась новая статья.

_verdict:_ `post`

### 33. nummer

- stratum: **three_senses** · batch: batch-0009.json · rank 406
- facts: pos `noun` · gender `et` · definite `nummeret` · IPA `[ˈnɔmˀʌ]`
- pronunciation: **но́мо**

1. **номер** _(noun, et)_
   - Bussen har nummer fem.
   - У автобуса номер пять.
2. **размер (одежды, обуви)** _(noun, et)_
   - Jeg har brug for et større nummer i sko.
   - Мне нужен размер обуви побольше.
3. **номер, трюк (на сцене)** _(noun, et)_
   - Han lavede et sjovt nummer på scenen.
   - Он показал забавный номер на сцене.

_verdict:_ `nummer`

### 34. passe

- stratum: **three_senses** · batch: batch-0010.json · rank 480
- facts: pos `verb` · gender `null` · IPA `[ˈpasə]`
- pronunciation: **па́сэ**

1. **подходить, быть впору** _(verb)_
   - Kjolen passer mig.
   - Платье мне подходит.
2. **присматривать, заботиться** _(verb)_
   - Hun passer børnene i dag.
   - Сегодня она присматривает за детьми.
3. **быть верным, соответствовать** _(verb)_
   - Det passer ikke.
   - Это неверно.

_verdict:_ `passe`

### 35. så

- stratum: **three_senses** · batch: batch-0001.json · rank 27
- facts: pos `adverb` · gender `null` · IPA `[ˈsʌ]`
- pronunciation: **со**

1. **так** _(adverb)_
   - Hun er så træt.
   - Она так устала.
2. **поэтому, тогда** _(conjunction)_
   - Det blev sent, så vi tog en taxa.
   - Стало поздно, поэтому мы взяли такси.
3. **потом, затем** _(adverb)_
   - Vi spiste morgenmad, og så gik vi ud.
   - Мы позавтракали, а потом вышли на улицу.

_verdict:_ `så`

### 36. tro

- stratum: **three_senses** · batch: batch-0004.json · rank 162
- facts: pos `verb` · gender `null` · IPA `[ˈtʁoˀ]`
- pronunciation: **тро**

1. **верить** _(verb)_
   - Jeg tror på dig.
   - Я верю тебе.
2. **думать, полагать** _(verb)_
   - Jeg tror, det bliver godt vejr.
   - Я думаю, будет хорошая погода.
3. **вера** _(noun)_
   - Han har en stærk tro.
   - У него сильная вера.

_verdict:_ `tro`

### 37. over

- stratum: **three_senses** · batch: batch-0002.json · rank 54
- facts: pos `preposition` · gender `null` · IPA `[ɒwʌ]`
- pronunciation: **о́во**

1. **над** _(preposition)_
   - Lampen hænger over bordet.
   - Лампа висит над столом.
2. **через, по ту сторону** _(preposition)_
   - Vi går over broen.
   - Мы идём через мост.
3. **свыше, больше чем** _(preposition)_
   - Der bor over hundrede mennesker her.
   - Здесь живёт больше ста человек.

_verdict:_ `over`

### 38. løbe

- stratum: **three_senses** · batch: batch-0009.json · rank 438
- facts: pos `verb` · gender `null` · IPA `[ˈløːbə]`
- pronunciation: **лё́обэ**

1. **бегать** _(verb)_
   - Jeg vil løbe en tur.
   - Я хочу пробежаться.
2. **течь (о жидкости)** _(verb)_
   - Vandet løber fra hanen.
   - Вода течёт из крана.
3. **длиться, действовать (о сроке)** _(verb)_
   - Kontrakten løber i to år.
   - Контракт действует два года.

_verdict:_ `løbe`

### 39. høre

- stratum: **three_senses** · batch: batch-0005.json · rank 205
- facts: pos `verb` · gender `null` · IPA `[ˈhøːʌ]`
- pronunciation: **хё́эа**

1. **слышать** _(verb)_
   - Kan du høre mig?
   - Ты меня слышишь?
2. **слушать** _(verb)_
   - Jeg hører musik hver dag.
   - Я слушаю музыку каждый день.
3. **принадлежать, относиться** _(verb)_
   - Denne bog hører til biblioteket.
   - Эта книга принадлежит библиотеке.

_verdict:_ `høre`

### 40. optage

- stratum: **three_senses** · batch: batch-0016.json · rank 795
- facts: pos `verb` · gender `null` · IPA `[ˈʌbˌtæˀ]`
- pronunciation: **о́бтэ**

1. **записывать** _(verb)_
   - Vi optager en video.
   - Мы записываем видео.
2. **принимать, зачислять (в учебное заведение)** _(verb)_
   - Hun blev optaget på universitetet.
   - Её приняли в университет.
3. **занимать (место, время)** _(verb)_
   - Mødet optager hele formiddagen.
   - Встреча занимает всё утро.

_verdict:_ `optage`

### 41. sætte

- stratum: **three_senses** · batch: batch-0003.json · rank 103
- facts: pos `verb` · gender `null` · IPA `[ˈsεdə]`
- pronunciation: **сэ́дэ**

1. **ставить, класть** _(verb)_
   - Jeg vil sætte koppen på bordet.
   - Я поставлю чашку на стол.
2. **садиться** _(verb)_
   - Han sætter sig ned på stolen.
   - Он садится на стул.
3. **устанавливать, назначать** _(verb)_
   - De satte en ny rekord.
   - Они установили новый рекорд.

_verdict:_ `sætte`

### 42. behandle

- stratum: **three_senses** · batch: batch-0016.json · rank 764
- facts: pos `verb` · gender `null` · IPA `[beˈhanˀlə]`
- pronunciation: **бэха́нлэ**

1. **лечить** _(verb)_
   - Lægen behandler patienten.
   - Врач лечит пациента.
2. **обращаться с кем-либо, относиться к кому-либо** _(verb)_
   - Han behandler sine venner godt.
   - Он хорошо относится к своим друзьям.
3. **обрабатывать, рассматривать (дело, вопрос)** _(verb)_
   - Vi behandler sagen i morgen.
   - Мы рассмотрим это дело завтра.

_verdict:_ `behandle`

### 43. mål

- stratum: **three_senses** · batch: batch-0006.json · rank 262
- facts: pos `noun` · gender `et` · definite `målet` · IPA `[ˈmɔˀl]`
- pronunciation: **мол**

1. **цель** _(noun, et)_
   - Mit mål er at lære dansk.
   - Моя цель — выучить датский.
2. **гол** _(noun, et)_
   - Han scorede et mål i kampen.
   - Он забил гол в матче.
3. **мера, размер** _(noun, et)_
   - Han tog mål af bordet.
   - Он снял размеры стола.

_verdict:_ `mål`

### 44. slå

- stratum: **three_senses** · batch: batch-0005.json · rank 206
- facts: pos `verb` · gender `null` · IPA `[ˈslɔˀ]`
- pronunciation: **сло**

1. **бить, ударять** _(verb)_
   - Han slog hunden.
   - Он ударил собаку.
2. **побеждать, обыгрывать** _(verb)_
   - Danmark slog Sverige i fodbold.
   - Дания обыграла Швецию в футболе.
3. **бить, отбивать время (о часах)** _(verb)_
   - Klokken slår tolv.
   - Часы бьют двенадцать.

_verdict:_ `slå`

### 45. lys

- stratum: **three_senses** · batch: batch-0011.json · rank 541
- facts: pos `noun` · gender `et` · definite `lyset` · IPA `[ˈlyˀs]`
- pronunciation: **люс**

1. **свет** _(noun, et)_
   - Tænd lyset, det er mørkt herinde.
   - Включи свет, здесь темно.
2. **свеча** _(noun, et)_
   - Hun tændte et lys på bordet.
   - Она зажгла свечу на столе.
3. **светлый** _(adjective)_
   - Hun har lyst hår.
   - У неё светлые волосы.

_verdict:_ `lys`

### 46. rigtig

- stratum: **three_senses** · batch: batch-0004.json · rank 159
- facts: pos `adjective` · gender `null` · IPA `[ˈʁεgdi]`
- pronunciation: **рэ́гди**

1. **правильный** _(adjective)_
   - Din adresse er rigtig.
   - Твой адрес правильный.
2. **настоящий** _(adjective)_
   - Han er en rigtig ven.
   - Он настоящий друг.
3. **очень, действительно** _(adverb)_
   - Maden var rigtig god.
   - Еда была очень вкусной.

_verdict:_ `rigtig`

### 47. holde

- stratum: **three_senses** · batch: batch-0003.json · rank 104
- facts: pos `verb` · gender `null` · IPA `[ˈhʌlə]`
- pronunciation: **хо́лэ**

1. **держать** _(verb)_
   - Kan du holde min taske?
   - Ты можешь подержать мою сумку?
2. **проводить, устраивать** _(verb)_
   - Vi holder fest i aften.
   - Мы устраиваем вечеринку сегодня вечером.
3. **останавливаться, стоять** _(verb)_
   - Bussen holder foran huset.
   - Автобус останавливается перед домом.

_verdict:_ `holde`

### 48. udtale

- stratum: **three_senses** · batch: batch-0017.json · rank 837
- facts: pos `verb` · gender `null` · IPA `[-ˌtæˀlə]`
- pronunciation: **тэ́лэ**

1. **произносить** _(verb)_
   - Det er svært at udtale dette ord.
   - Это слово трудно произнести.
2. **высказываться, заявлять** _(verb)_
   - Ministeren ville ikke udtale sig om sagen.
   - Министр не захотел высказываться по этому делу.
3. **произношение** _(noun)_
   - Hans udtale er meget tydelig.
   - Его произношение очень чёткое.

_verdict:_ `udtale`

### 49. gang

- stratum: **three_senses** · batch: batch-0002.json · rank 67
- facts: pos `noun` · gender `en` · definite `gangen` · IPA `[ˈgɑŋˀ]`
- pronunciation: **ганг**

1. **раз** _(noun, en)_
   - Jeg har set filmen to gange.
   - Я смотрел этот фильм два раза.
2. **коридор** _(noun, en)_
   - Skoene står på gangen.
   - Обувь стоит в коридоре.
3. **походка** _(noun, en)_
   - Han har en hurtig gang.
   - У него быстрая походка.

_verdict:_ `gang`

### 50. om

- stratum: **three_senses** · batch: batch-0001.json · rank 18
- facts: pos `preposition` · gender `null` · IPA `[ʌm]`
- pronunciation: **ом**

1. **о, об** _(preposition)_
   - Vi taler om vejret.
   - Мы говорим о погоде.
2. **если** _(conjunction)_
   - Om det regner, bliver vi hjemme.
   - Если пойдёт дождь, мы останемся дома.
3. **через (о времени)** _(preposition)_
   - Vi ses om en time.
   - Увидимся через час.

_verdict:_ `om`

### 51. genere

- stratum: **tail** · batch: batch-0059.json · rank 2913
- facts: pos `verb` · gender `null` · IPA `[ɕeˈneˀʌ]`
- pronunciation: **шенэ́а**

1. **беспокоить, мешать** _(verb)_
   - Larmen generer mig meget.
   - Шум меня очень беспокоит.

_verdict:_ `genere`

### 52. urimelig

- stratum: **tail** · batch: batch-0055.json · rank 2702
- facts: pos `adjective` · gender `null` · IPA `[uˈʁiˀməli]`
- pronunciation: **ури́мели**

1. **несправедливый** _(adjective)_
   - Det er urimeligt, at hun skal betale det hele.
   - Несправедливо, что она должна платить за всё.
2. **чрезмерный, неразумный** _(adjective)_
   - Prisen på huset er urimelig høj.
   - Цена на дом неразумно высокая.

_verdict:_ `urimelig`

### 53. kontant

- stratum: **tail** · batch: batch-0055.json · rank 2709
- facts: pos `adjective` · gender `null` · IPA `[kɔnˈtanˀd]`
- pronunciation: **конта́нд**

1. **наличный** _(adjective)_
   - Jeg betaler altid kontant i butikken.
   - Я всегда плачу наличными в магазине.
2. **прямолинейный, решительный** _(adjective)_
   - Han svarede kontant på spørgsmålet.
   - Он прямо ответил на вопрос.

_verdict:_ `kontant`

### 54. bage

- stratum: **tail** · batch: batch-0058.json · rank 2900
- facts: pos `verb` · gender `null` · IPA `[ˈbæːjə]`
- pronunciation: **бэ'йе**

1. **печь** _(verb)_
   - Vi skal bage boller til i morgen.
   - Мы будем печь булочки на завтра.

_verdict:_ `bage`

### 55. bakterie

- stratum: **tail** · batch: batch-0058.json · rank 2867
- facts: pos `noun` · gender `en` · definite `bakterien` · IPA `[bɑgˈteɐ̯ˀiə]`
- pronunciation: **багтэ'рие**

1. **бактерия** _(noun, en)_
   - Bakterier kan gøre dig syg.
   - Бактерии могут вызвать болезнь.

_verdict:_ `bakterie`

### 56. bemærkelsesværdig

- stratum: **tail** · batch: batch-0058.json · rank 2875
- facts: pos `adjective` · gender `null` · IPA `[beˈmæɐ̯gəlsəsˌvæɐ̯ˀdi]`
- pronunciation: **бэмэ'ркельсесвэрди**

1. **примечательный, замечательный** _(adjective)_
   - Det var en bemærkelsesværdig præstation.
   - Это было примечательное достижение.

_verdict:_ `bemærkelsesværdig`

### 57. morsom

- stratum: **tail** · batch: batch-0057.json · rank 2839
- facts: pos `adjective` · gender `null` · IPA `[ˈmoɐ̯ˌsʌmˀ]`
- pronunciation: **мо́рсом**

1. **забавный, весёлый** _(adjective)_
   - Filmen var meget morsom.
   - Фильм был очень забавным.

_verdict:_ `morsom`

### 58. væsen

- stratum: **tail** · batch: batch-0056.json · rank 2777
- facts: pos `noun` · gender `et` · IPA `[ˈvεˀsən]`
- pronunciation: **вэ́сен**

1. **существо** _(noun, et)_
   - Der findes mange mærkelige væsener i havet.
   - В море обитает много странных существ.
2. **нрав, характер** _(noun, et)_
   - Han har et venligt væsen.
   - У него дружелюбный нрав.

_verdict:_ `væsen`

### 59. fair

- stratum: **tail** · batch: batch-0056.json · rank 2762
- facts: pos `adjective` · gender `null` · IPA `[ˈfεːɐ̯]`
- pronunciation: **фэ́а**

1. **честный, справедливый** _(adjective)_
   - Det var ikke fair af dig.
   - Это было нечестно с твоей стороны.

_verdict:_ `fair`

### 60. pol

- stratum: **tail** · batch: batch-0059.json · rank 2907
- facts: pos `noun` · gender `en` · definite `polen` · IPA `[ˈpoˀl]`
- pronunciation: **по́ль**

1. **полюс (географический)** _(noun, en)_
   - Jorden har to poler.
   - У Земли два полюса.
2. **полюс (электрический)** _(noun, en)_
   - Denne pol på batteriet er positiv.
   - Этот полюс батарейки положительный.

_verdict:_ `pol`

### 61. vrede

- stratum: **tail** · batch: batch-0057.json · rank 2820
- facts: pos `noun` · gender `en` · definite `vreden` · IPA `[ˈvʁεːðə]`
- pronunciation: **врэ́дэ**

1. **гнев, злость** _(noun, en)_
   - Hendes vrede forsvandt hurtigt.
   - Её гнев быстро прошёл.

_verdict:_ `vrede`

### 62. bakke

- stratum: **tail** · batch: batch-0055.json · rank 2730
- facts: pos `noun` · gender `en` · definite `bakken` · IPA `[ˈbɑgə]`
- pronunciation: **ба́ге**

1. **холм** _(noun, en)_
   - Vi gik op ad en bakke i skoven.
   - Мы поднялись на холм в лесу.
2. **поднос** _(noun, en)_
   - Tjeneren bar glassene på en bakke.
   - Официант нёс стаканы на подносе.

_verdict:_ `bakke`

### 63. bekæmpelse

- stratum: **tail** · batch: batch-0060.json · rank 2968
- facts: pos `noun` · gender `en` · definite `bekæmpelsen` · IPA `[beˈkεmˀbəlsə]`
- pronunciation: **бекэмбельсэ**

1. **борьба (с чем-либо)** _(noun, en)_
   - Bekæmpelse af fattigdom er vigtig.
   - Борьба с бедностью важна.

_verdict:_ `bekæmpelse`

### 64. folketingsvalg

- stratum: **tail** · batch: batch-0060.json · rank 2994
- facts: pos `noun` · gender `et` · definite `folketingsvalget` · IPA `[ˈfʌlgəteŋs-]`
- pronunciation: **фёльгетэнгсваль**

1. **парламентские выборы** _(noun, et)_
   - Der er folketingsvalg i Danmark hvert fjerde år.
   - Парламентские выборы в Дании проходят каждые четыре года.

_verdict:_ `folketingsvalg`

### 65. omdanne

- stratum: **tail** · batch: batch-0059.json · rank 2914
- facts: pos `verb` · gender `null` · IPA `[-ˌdanˀə]`
- pronunciation: **-да́нэ**

1. **превращать, преобразовывать** _(verb)_
   - De vil omdanne huset til et museum.
   - Они хотят превратить дом в музей.

_verdict:_ `omdanne`

### 66. indspille

- stratum: **tail** · batch: batch-0060.json · rank 2979
- facts: pos `verb` · gender `null` · IPA `[-ˌsbelˀə]`
- pronunciation: **инспелле**

1. **записывать (звук, музыку)** _(verb)_
   - Bandet skal indspille en ny sang i studiet.
   - Группа будет записывать новую песню в студии.

_verdict:_ `indspille`

### 67. kommunistisk

- stratum: **tail** · batch: batch-0057.json · rank 2845
- facts: pos `adjective` · gender `null` · IPA `[komuˈnisdisg]`
- pronunciation: **комуни́стиск**

1. **коммунистический** _(adjective)_
   - Partiet var kommunistisk i sin ideologi.
   - Партия была коммунистической по своей идеологии.

_verdict:_ `kommunistisk`

### 68. hastighed

- stratum: **tail** · batch: batch-0055.json · rank 2745
- facts: pos `noun` · gender `en` · definite `hastigheden` · IPA `[ˈhasdiˌheðˀ]`
- pronunciation: **ха́сдихед**

1. **скорость** _(noun, en)_
   - Bilen kørte med høj hastighed.
   - Машина ехала с высокой скоростью.

_verdict:_ `hastighed`

### 69. nød

- stratum: **tail** · batch: batch-0057.json · rank 2821
- facts: pos `noun` · gender `en` · IPA `[ˈnøˀð]`
- pronunciation: **нёд**

1. **нужда, бедствие** _(noun, en)_
   - Skibet var i nød på havet.
   - Корабль терпел бедствие в море.
2. **орех** _(noun, en)_
   - Hun spiste en nød til frokost.
   - Она съела орех на обед.

_verdict:_ `nød`

### 70. fremtrædende

- stratum: **tail** · batch: batch-0055.json · rank 2722
- facts: pos `adjective` · gender `null` · IPA `[ˈfʁamˌtʁεðˀənə]`
- pronunciation: **фра́мтрэдене**

1. **видный, выдающийся** _(adjective)_
   - Han er en fremtrædende forsker inden for sit felt.
   - Он выдающийся учёный в своей области.

_verdict:_ `fremtrædende`

### 71. sgu

- stratum: **tail** · batch: batch-0055.json · rank 2747
- facts: pos `adverb` · gender `null` · IPA `[sgu]`
- pronunciation: **сгу**

1. **чёрт возьми, же (усилительное слово)** _(adverb)_
   - Det var sgu koldt i går.
   - Вчера было чертовски холодно.

_verdict:_ `sgu`

### 72. renovering

- stratum: **tail** · batch: batch-0060.json · rank 2986
- facts: pos `noun` · gender `en` · definite `renoveringen` · IPA `[ʁεnoˈveˀɐ̯eŋ]`
- pronunciation: **реновэринг**

1. **ремонт, реновация** _(noun, en)_
   - Huset er under renovering i øjeblikket.
   - Дом сейчас на ремонте.

_verdict:_ `renovering`

### 73. humør

- stratum: **tail** · batch: batch-0055.json · rank 2714
- facts: pos `noun` · gender `et` · definite `humøret` · IPA `[huˈmøˀɐ̯]`
- pronunciation: **хумё́а**

1. **настроение** _(noun, et)_
   - Jeg er i godt humør i dag.
   - Я сегодня в хорошем настроении.

_verdict:_ `humør`

### 74. klassiker

- stratum: **tail** · batch: batch-0055.json · rank 2716
- facts: pos `noun` · gender `en` · definite `klassikeren` · IPA `[ˈklasigʌ]`
- pronunciation: **кла́сига**

1. **классика (произведение)** _(noun, en)_
   - Denne bog er blevet en klassiker.
   - Эта книга стала классикой.

_verdict:_ `klassiker`

### 75. protestere

- stratum: **tail** · batch: batch-0059.json · rank 2906
- facts: pos `verb` · gender `null` · IPA `[pʁodəˈsdeˀʌ]`
- pronunciation: **продэсдэ́а**

1. **протестовать** _(verb)_
   - Folk protesterer mod de nye regler.
   - Люди протестуют против новых правил.

_verdict:_ `protestere`

### 76. kendsgerning

- stratum: **tail** · batch: batch-0060.json · rank 2951
- facts: pos `noun` · gender `en` · definite `kendsgerningen` · IPA `[ˈkεnˀsˌgæɐ̯neŋ]`
- pronunciation: **кенсгэрнен**

1. **факт, реальность** _(noun, en)_
   - Det er en kendsgerning, at jorden er rund.
   - Это факт, что Земля круглая.

_verdict:_ `kendsgerning`

### 77. atmosfære

- stratum: **tail** · batch: batch-0056.json · rank 2780
- facts: pos `noun` · gender `en` · definite `atmosfæren` · IPA `[admosˈfεːʌ]`
- pronunciation: **адмосфэ́а**

1. **атмосфера** _(noun, en)_
   - Der var en hyggelig atmosfære til festen.
   - На вечеринке была уютная атмосфера.

_verdict:_ `atmosfære`

### 78. tyveri

- stratum: **tail** · batch: batch-0056.json · rank 2775
- facts: pos `noun` · gender `et` · definite `tyveriet` · IPA `[tywʌˈʁiˀ]`
- pronunciation: **тювори́**

1. **кража** _(noun, et)_
   - Politiet efterforsker et tyveri i butikken.
   - Полиция расследует кражу в магазине.

_verdict:_ `tyveri`

### 79. trappe

- stratum: **tail** · batch: batch-0055.json · rank 2750
- facts: pos `noun` · gender `en` · definite `trappen` · IPA `[ˈtʁɑbə]`
- pronunciation: **тра́бе**

1. **лестница** _(noun, en)_
   - Han løb op ad trappen til lejligheden.
   - Он взбежал по лестнице к квартире.

_verdict:_ `trappe`

### 80. dimension

- stratum: **tail** · batch: batch-0058.json · rank 2888
- facts: pos `noun` · gender `en` · definite `dimensionen` · IPA `[dimənˈɕoˀn]`
- pronunciation: **димэншо'н**

1. **измерение, размер** _(noun, en)_
   - Problemet har en ny dimension nu.
   - Теперь у проблемы новое измерение.

_verdict:_ `dimension`

### 81. institution

- stratum: **head** · batch: batch-0018.json · rank 852
- facts: pos `noun` · gender `en` · definite `institutionen` · IPA `[ensdituˈɕoˀn]`
- pronunciation: **энституцион**

1. **учреждение** _(noun, en)_
   - Skolen er en offentlig institution.
   - Школа — государственное учреждение.
2. **традиция, нечто устоявшееся** _(noun, en)_
   - Det er blevet en institution i byen.
   - Это стало традицией в городе.

_verdict:_ `institution`

### 82. lykkes

- stratum: **head** · batch: batch-0010.json · rank 451
- facts: pos `verb` · gender `null` · IPA `[ˈløgəs]`
- pronunciation: **лё́гэс**

1. **удаваться** _(verb)_
   - Det lykkedes hende at finde jobbet.
   - Ей удалось найти работу.

_verdict:_ `lykkes`

### 83. fortale

- stratum: **head** · batch: batch-0013.json · rank 607
- facts: pos `verb` · gender `null` · IPA `[fʌˈtæˀlə]`
- pronunciation: **фотэ́лэ**

1. **выступать в защиту, отстаивать** _(verb)_
   - Han fortaler sagen for retten.
   - Он отстаивает дело в суде.
2. **проговориться, обмолвиться** _(verb)_
   - Hun fortalte sig og afslørede hemmeligheden.
   - Она проговорилась и выдала секрет.

_verdict:_ `fortale`

### 84. dollar

- stratum: **head** · batch: batch-0016.json · rank 759
- facts: pos `noun` · gender `en` · definite `dollaren` · IPA `[ˈdʌlʌ]`
- pronunciation: **до́ло**

1. **доллар** _(noun, en)_
   - Han har hundrede dollar i lommen.
   - У него в кармане сто долларов.

_verdict:_ `dollar`

### 85. global

- stratum: **head** · batch: batch-0017.json · rank 809
- facts: pos `adjective` · gender `null` · IPA `[gloˈbæˀl]`
- pronunciation: **глобэ́л**

1. **глобальный** _(adjective)_
   - Klimaændringer er et globalt problem.
   - Изменение климата — глобальная проблема.

_verdict:_ `global`

### 86. socialdemokrat

- stratum: **head** · batch: batch-0018.json · rank 878
- facts: pos `noun` · gender `en` · definite `socialdemokraten` · IPA `[soˈɕæˀld̥emoˌkʰʁ̥ɑˀd̥]`
- pronunciation: **сошэ́лдэмокра́д**

1. **социал-демократ** _(noun, en)_
   - Han stemte på en socialdemokrat.
   - Он голосовал за социал-демократа.

_verdict:_ `socialdemokrat`

### 87. fuld

- stratum: **head** · batch: batch-0008.json · rank 371
- facts: pos `adjective` · gender `null` · IPA `[ˈfulˀ]`
- pronunciation: **фул**

1. **полный** _(adjective)_
   - Bussen var fuld af mennesker.
   - Автобус был полон людей.
2. **пьяный** _(adjective)_
   - Han blev fuld til festen.
   - Он напился на вечеринке.

_verdict:_ `fuld`

### 88. sygdom

- stratum: **head** · batch: batch-0014.json · rank 697
- facts: pos `noun` · gender `en` · definite `sygdommen` · IPA `[ˈsyːˌdʌmˀ]`
- pronunciation: **сю́дом**

1. **болезнь** _(noun, en)_
   - Han har en alvorlig sygdom.
   - У него серьёзная болезнь.

_verdict:_ `sygdom`

### 89. tid

- stratum: **head** · batch: batch-0002.json · rank 68
- facts: pos `noun` · gender `en` · definite `tiden` · IPA `[ˈtiðˀ]`
- pronunciation: **тид**

1. **время** _(noun, en)_
   - Jeg har ikke tid i dag.
   - У меня нет времени сегодня.
2. **приём, запись (например, к врачу)** _(noun, en)_
   - Jeg har en tid hos lægen klokken ti.
   - У меня запись к врачу в десять часов.

_verdict:_ `tid`

### 90. valg

- stratum: **head** · batch: batch-0007.json · rank 329
- facts: pos `noun` · gender `et` · definite `valget` · IPA `[ˈvalˀ]`
- pronunciation: **вал**

1. **выбор** _(noun, et)_
   - Det er et svært valg.
   - Это трудный выбор.
2. **выборы** _(noun, et)_
   - Der er valg i denne måned.
   - В этом месяце пройдут выборы.

_verdict:_ `valg`

### 91. udenlandsk

- stratum: **head** · batch: batch-0017.json · rank 845
- facts: pos `adjective` · gender `null` · IPA `[ˈuðənˌlanˀsg]`
- pronunciation: **у́дэнла́нск**

1. **иностранный** _(adjective)_
   - Hun taler flere udenlandske sprog.
   - Она говорит на нескольких иностранных языках.

_verdict:_ `udenlandsk`

### 92. marts

- stratum: **head** · batch: batch-0011.json · rank 517
- facts: pos `noun` · gender `en` · IPA `[ˈmɑːds]`
- pronunciation: **ма́адс**

1. **март** _(noun, en)_
   - Vi rejser til Spanien i marts.
   - Мы едем в Испанию в марте.

_verdict:_ `marts`

### 93. krav

- stratum: **head** · batch: batch-0008.json · rank 367
- facts: pos `noun` · gender `et` · definite `kravet` · IPA `[ˈkʁɑˀw]`
- pronunciation: **крау**

1. **требование** _(noun, et)_
   - Firmaet har høje krav til medarbejderne.
   - Компания предъявляет высокие требования к сотрудникам.

_verdict:_ `krav`

### 94. billede

- stratum: **head** · batch: batch-0006.json · rank 268
- facts: pos `noun` · gender `et` · definite `billedet` · IPA `[ˈbeləðə]`
- pronunciation: **бэ́лэдэ**

1. **изображение, фотография** _(noun, et)_
   - Kan du sende mig et billede?
   - Можешь прислать мне фотографию?

_verdict:_ `billede`

### 95. opmærksom

- stratum: **head** · batch: batch-0020.json · rank 979
- facts: pos `adjective` · gender `null` · IPA `[ʌbˈmæɐ̯gˌsʌmˀ]`
- pronunciation: **обмэ́агсом**

1. **внимательный** _(adjective)_
   - Vær opmærksom på trafikken.
   - Будь внимателен к движению.

_verdict:_ `opmærksom`

### 96. eneste

- stratum: **head** · batch: batch-0007.json · rank 313
- facts: pos `adjective` · gender `null` · IPA `[ˈeːnəsdə]`
- pronunciation: **э́энэстэ**

1. **единственный** _(adjective)_
   - Hun er min eneste ven.
   - Она мой единственный друг.

_verdict:_ `eneste`

### 97. behandling

- stratum: **head** · batch: batch-0013.json · rank 604
- facts: pos `noun` · gender `en` · definite `behandlingen` · IPA `[beˈhanˀleŋ]`
- pronunciation: **бэха́нлинг**

1. **лечение** _(noun, en)_
   - Patienten får en ny behandling.
   - Пациент получает новое лечение.
2. **обработка, рассмотрение** _(noun, en)_
   - Ansøgningen er stadig til behandling.
   - Заявление всё ещё находится на рассмотрении.

_verdict:_ `behandling`

### 98. minut

- stratum: **head** · batch: batch-0003.json · rank 128
- facts: pos `noun` · gender `et` · definite `minuttet` · IPA `[meˈnud]`
- pronunciation: **мэну́д**

1. **минута** _(noun, et)_
   - Vent et minut.
   - Подожди минуту.

_verdict:_ `minut`

### 99. natur

- stratum: **head** · batch: batch-0013.json · rank 650
- facts: pos `noun` · gender `en` · definite `naturen` · IPA `[naˈtuɐ̯ˀ]`
- pronunciation: **нату́а**

1. **природа** _(noun, en)_
   - Vi elsker at gå en tur i naturen.
   - Мы любим гулять на природе.
2. **натура, характер** _(noun, en)_
   - Han har en rolig natur.
   - У него спокойный характер.

_verdict:_ `natur`

### 100. officiel

- stratum: **head** · batch: batch-0018.json · rank 862
- facts: pos `adjective` · gender `null` · IPA `[ʌfiˈɕεlˀ]`
- pronunciation: **офи́шэл**

1. **официальный** _(adjective)_
   - Det er endnu ikke officielt.
   - Это ещё не официально.

_verdict:_ `officiel`

### 101. sjælden

- stratum: **head** · batch: batch-0016.json · rank 752
- facts: pos `adjective` · gender `null` · IPA `[ˈɕεlən]`
- pronunciation: **шэ́лэн**

1. **редкий** _(adjective)_
   - Det er en sjælden bog.
   - Это редкая книга.

_verdict:_ `sjælden`

### 102. tilføje

- stratum: **head** · batch: batch-0015.json · rank 720
- facts: pos `verb` · gender `null` · IPA `[-ˌfʌjˀə]`
- pronunciation: **фо́йэ**

1. **добавлять** _(verb)_
   - Kan du tilføje lidt salt til maden?
   - Можешь добавить немного соли в еду?

_verdict:_ `tilføje`

### 103. løsning

- stratum: **head** · batch: batch-0010.json · rank 463
- facts: pos `noun` · gender `en` · definite `løsningen` · IPA `[ˈløːsneŋ]`
- pronunciation: **лё́оснинг**

1. **решение** _(noun, en)_
   - Vi fandt en løsning på problemet.
   - Мы нашли решение проблемы.

_verdict:_ `løsning`

### 104. spændende

- stratum: **head** · batch: batch-0016.json · rank 790
- facts: pos `adjective` · gender `null` · IPA `[ˈsbεnənə]`
- pronunciation: **сбэ́нэне**

1. **интересный, захватывающий** _(adjective)_
   - Filmen var meget spændende.
   - Фильм был очень захватывающим.

_verdict:_ `spændende`

### 105. situation

- stratum: **head** · batch: batch-0007.json · rank 328
- facts: pos `noun` · gender `en` · definite `situationen` · IPA `[sidwaˈɕoˀn]`
- pronunciation: **ситуашо́н**

1. **ситуация** _(noun, en)_
   - Det er en svær situation.
   - Это сложная ситуация.

_verdict:_ `situation`

### 106. rapport

- stratum: **head** · batch: batch-0013.json · rank 625
- facts: pos `noun` · gender `en` · definite `rapporten` · IPA `[ʁɑˈpɒːd]`
- pronunciation: **рапо́од**

1. **отчёт** _(noun, en)_
   - Hun skriver en rapport.
   - Она пишет отчёт.

_verdict:_ `rapport`

### 107. tage

- stratum: **head** · batch: batch-0002.json · rank 62
- facts: pos `verb` · gender `null` · IPA `[ˈtæˀ]`
- pronunciation: **тэ**

1. **брать** _(verb)_
   - Kan du tage min taske?
   - Можешь взять мою сумку?
2. **ехать, отправляться** _(verb)_
   - Vi skal tage til København i morgen.
   - Завтра мы поедем в Копенгаген.

_verdict:_ `tage`

### 108. skabe

- stratum: **head** · batch: batch-0004.json · rank 178
- facts: pos `verb` · gender `null` · IPA `[ˈsgæːbə]`
- pronunciation: **сгэ́эбэ**

1. **создавать** _(verb)_
   - Vi vil skabe et godt hjem.
   - Мы хотим создать хороший дом.

_verdict:_ `skabe`

### 109. engelsk

- stratum: **head** · batch: batch-0014.json · rank 652
- facts: pos `adjective` · gender `null` · IPA `[ˈεŋˀəlsg]`
- pronunciation: **э́нгэлск**

1. **английский** _(adjective)_
   - Han har en engelsk bil.
   - У него английская машина.
2. **английский язык** _(noun)_
   - Hun taler engelsk.
   - Она говорит по-английски.

_verdict:_ `engelsk`

### 110. dommer

- stratum: **head** · batch: batch-0018.json · rank 873
- facts: pos `noun` · gender `en` · definite `dommeren` · IPA `[ˈdʌmʌ]`
- pronunciation: **до́мо**

1. **судья** _(noun, en)_
   - Dommeren fløjtede af.
   - Судья дал свисток.

_verdict:_ `dommer`

### 111. skjule

- stratum: **general** · batch: batch-0036.json · rank 1796
- facts: pos `verb` · gender `null` · IPA `[ˈsgjuːlə]`
- pronunciation: **сгю́улэ**

1. **скрывать** _(verb)_
   - Hun prøver at skjule fejlen.
   - Она пытается скрыть ошибку.

_verdict:_ `skjule`

### 112. smil

- stratum: **general** · batch: batch-0036.json · rank 1777
- facts: pos `noun` · gender `et` · definite `smilet` · IPA `[ˈsmiˀl]`
- pronunciation: **смил**

1. **улыбка** _(noun, et)_
   - Hun giver mig et smil.
   - Она улыбается мне.

_verdict:_ `smil`

### 113. flere

- stratum: **general** · batch: batch-0042.json · rank 2055
- facts: pos `adjective` · gender `null` · IPA `[ˈfleːʌ]`
- pronunciation: **флэ́эа**

1. **несколько, больше** _(adjective)_
   - Vi har flere muligheder.
   - У нас есть несколько вариантов.

_verdict:_ `flere`

### 114. nærhed

- stratum: **general** · batch: batch-0033.json · rank 1604
- facts: pos `noun` · gender `en` · definite `nærheden` · IPA `[ˈnεɐ̯ˌheðˀ]`
- pronunciation: **нэ́ахэд**

1. **близость** _(noun, en)_
   - Vi bor i nærheden af skolen.
   - Мы живём недалеко от школы.

_verdict:_ `nærhed`

### 115. investor

- stratum: **general** · batch: batch-0021.json · rank 1011
- facts: pos `noun` · gender `en` · definite `investoren` · IPA `[enˈvεsdʌ]`
- pronunciation: **энвэ́сдо**

1. **инвестор** _(noun, en)_
   - En investor køber aktier.
   - Инвестор покупает акции.

_verdict:_ `investor`

### 116. omsætte

- stratum: **general** · batch: batch-0052.json · rank 2594
- facts: pos `verb` · gender `null` · IPA `[ˈʌmˌsεdə]`
- pronunciation: **о́мсэдэ**

1. **воплощать, превращать (план в действие)** _(verb)_
   - Vi vil omsætte planen til handling.
   - Мы хотим воплотить план в действие.
2. **иметь оборот (в торговле)** _(verb)_
   - Butikken omsætter for mange penge om året.
   - Магазин имеет оборот на большие деньги в год.

_verdict:_ `omsætte`

### 117. pædagogisk

- stratum: **general** · batch: batch-0046.json · rank 2282
- facts: pos `adjective` · gender `null` · IPA `[pεdaˈgoˀisg]`
- pronunciation: **пэдаго́иск**

1. **педагогический** _(adjective)_
   - Det er en pædagogisk metode.
   - Это педагогический метод.

_verdict:_ `pædagogisk`

### 118. rekord

- stratum: **general** · batch: batch-0042.json · rank 2058
- facts: pos `noun` · gender `en` · definite `rekorden` · IPA `[ʁεˈkɒːd]`
- pronunciation: **рэко́од**

1. **рекорд** _(noun, en)_
   - Hun satte en ny rekord.
   - Она установила новый рекорд.

_verdict:_ `rekord`

### 119. fokusere

- stratum: **general** · batch: batch-0027.json · rank 1313
- facts: pos `verb` · gender `null` · IPA `[foguˈseˀʌ]`
- pronunciation: **фогусэ́эа**

1. **сосредотачиваться** _(verb)_
   - Jeg skal fokusere på arbejdet.
   - Мне нужно сосредоточиться на работе.

_verdict:_ `fokusere`

### 120. hylde

- stratum: **general** · batch: batch-0051.json · rank 2526
- facts: pos `verb` · gender `null` · IPA `[ˈhylə]`
- pronunciation: **хю́лэ**

1. **чествовать, восхвалять** _(verb)_
   - De vil hylde vinderen.
   - Они будут чествовать победителя.

_verdict:_ `hylde`

### 121. aflevere

- stratum: **general** · batch: batch-0035.json · rank 1703
- facts: pos `verb` · gender `null` · IPA `[ˈɑwleˌveˀʌ]`
- pronunciation: **аулэвэ́эа**

1. **сдавать, отдавать** _(verb)_
   - Jeg skal aflevere opgaven i morgen.
   - Я должен сдать задание завтра.

_verdict:_ `aflevere`

### 122. vist

- stratum: **general** · batch: batch-0025.json · rank 1201
- facts: pos `adverb` · gender `null` · IPA `[ˈvesd]`
- pronunciation: **вэст**

1. **наверное, по-видимому** _(adverb)_
   - Han kommer vist senere.
   - Он, наверное, придёт позже.

_verdict:_ `vist`

### 123. kant

- stratum: **general** · batch: batch-0031.json · rank 1529
- facts: pos `noun` · gender `en` · definite `kanten` · IPA `[ˈkanˀd]`
- pronunciation: **кант**

1. **край** _(noun, en)_
   - Glasset står tæt på kanten.
   - Стакан стоит близко к краю.

_verdict:_ `kant`

### 124. undervisning

- stratum: **general** · batch: batch-0022.json · rank 1063
- facts: pos `noun` · gender `en` · definite `undervisningen` · IPA `[ˈɔnʌˌviˀsneŋ]`
- pronunciation: **о́нови́снинг**

1. **обучение, преподавание** _(noun, en)_
   - Undervisningen starter klokken ni.
   - Занятия начинаются в девять.

_verdict:_ `undervisning`

### 125. forstand

- stratum: **general** · batch: batch-0034.json · rank 1651
- facts: pos `noun` · gender `en` · definite `forstanden` · IPA `[fʌˈsdanˀ]`
- pronunciation: **фосда́н**

1. **разум, понимание** _(noun, en)_
   - Brug din forstand.
   - Используй свой разум.

_verdict:_ `forstand`

### 126. beboer

- stratum: **general** · batch: batch-0021.json · rank 1002
- facts: pos `noun` · gender `en` · definite `beboeren` · IPA `[beˈboˀʌ]`
- pronunciation: **бэбо́оа**

1. **житель** _(noun, en)_
   - Hver beboer har en nøgle.
   - У каждого жильца есть ключ.

_verdict:_ `beboer`

### 127. svække

- stratum: **general** · batch: batch-0049.json · rank 2427
- facts: pos `verb` · gender `null` · IPA `[ˈsvεgə]`
- pronunciation: **свэ́гэ**

1. **ослаблять** _(verb)_
   - Sygdommen kan svække kroppen.
   - Болезнь может ослабить организм.

_verdict:_ `svække`

### 128. salt

- stratum: **general** · batch: batch-0040.json · rank 1966
- facts: pos `noun` · gender `et` · definite `saltet` · IPA `[ˈsalˀd]`
- pronunciation: **салт**

1. **соль** _(noun, et)_
   - Suppen mangler salt.
   - Супу не хватает соли.

_verdict:_ `salt`

### 129. individuel

- stratum: **general** · batch: batch-0039.json · rank 1916
- facts: pos `adjective` · gender `null` · IPA `[ˈendividuˌεlˀ]`
- pronunciation: **э́ндивидуэ́л**

1. **индивидуальный** _(adjective)_
   - Hver elev får individuel hjælp.
   - Каждый ученик получает индивидуальную помощь.

_verdict:_ `individuel`

### 130. oversættelse

- stratum: **general** · batch: batch-0053.json · rank 2638
- facts: pos `noun` · gender `en` · definite `oversættelsen` · IPA `[ˈɒwʌˌsεdəlsə]`
- pronunciation: **о́всэдэльсэ**

1. **перевод** _(noun, en)_
   - Denne oversættelse er meget præcis.
   - Этот перевод очень точный.

_verdict:_ `oversættelse`

### 131. påtage

- stratum: **general** · batch: batch-0048.json · rank 2384
- facts: pos `verb` · gender `null` · IPA `[-ˌtæˀ]`
- pronunciation: **тэ**

1. **брать на себя** _(verb)_
   - Jeg vil påtage mig opgaven.
   - Я возьму задачу на себя.

_verdict:_ `påtage`

### 132. partner

- stratum: **general** · batch: batch-0028.json · rank 1380
- facts: pos `noun` · gender `en` · definite `partneren` · IPA `[ˈpɑːdnʌ]`
- pronunciation: **па́адно**

1. **партнёр** _(noun, en)_
   - Jeg rejser med min partner.
   - Я путешествую со своим партнёром.

_verdict:_ `partner`

### 133. overholde

- stratum: **general** · batch: batch-0038.json · rank 1865
- facts: pos `verb` · gender `null` · IPA `[-ˌhʌlˀə]`
- pronunciation: **хо́лэ**

1. **соблюдать** _(verb)_
   - Vi skal overholde reglerne.
   - Мы должны соблюдать правила.

_verdict:_ `overholde`

### 134. undlade

- stratum: **general** · batch: batch-0047.json · rank 2324
- facts: pos `verb` · gender `null` · IPA `[ˈɔnˌlæˀðə]`
- pronunciation: **о́нлэ́дэ**

1. **не делать, воздерживаться** _(verb)_
   - Du skal undlade at ryge her.
   - Тебе следует воздержаться от курения здесь.

_verdict:_ `undlade`

### 135. tiltræde

- stratum: **general** · batch: batch-0051.json · rank 2529
- facts: pos `verb` · gender `null` · IPA `[-ˌtʁεˀðə]`
- pronunciation: **трэ́дэ**

1. **вступать в должность** _(verb)_
   - Hun skal tiltræde jobbet i maj.
   - Она должна вступить в должность в мае.

_verdict:_ `tiltræde`

### 136. adskille

- stratum: **general** · batch: batch-0040.json · rank 2000
- facts: pos `verb` · gender `null` · IPA `[ˈaðˌsgelˀə]`
- pronunciation: **а́дсгэ́лэ**

1. **разделять, отличать** _(verb)_
   - Farven kan adskille de to modeller.
   - Цвет может отличать две модели.

_verdict:_ `adskille`

### 137. operere

- stratum: **general** · batch: batch-0041.json · rank 2003
- facts: pos `verb` · gender `null` · IPA `[obəˈʁεˀʌ]`
- pronunciation: **обэрэ́эа**

1. **оперировать** _(verb)_
   - Lægen skal operere patienten.
   - Врач должен оперировать пациента.

_verdict:_ `operere`

### 138. brand

- stratum: **general** · batch: batch-0025.json · rank 1227
- facts: pos `noun` · gender `null` · IPA `[ˈbʁɑnˀ]`
- pronunciation: **бран**

1. **пожар** _(noun)_
   - Der var brand i bygningen.
   - В здании был пожар.

_verdict:_ `brand`

### 139. satse

- stratum: **general** · batch: batch-0026.json · rank 1267
- facts: pos `verb` · gender `null` · IPA `[ˈsadsə]`
- pronunciation: **са́дсэ**

1. **делать ставку, вкладываться** _(verb)_
   - Firmaet vil satse på ny teknologi.
   - Компания сделает ставку на новую технологию.

_verdict:_ `satse`

### 140. instruere

- stratum: **general** · batch: batch-0044.json · rank 2190
- facts: pos `verb` · gender `null` · IPA `[ensdʁuˈeˀʌ]`
- pronunciation: **энсдруэ́эа**

1. **инструктировать** _(verb)_
   - Hun skal instruere de nye medarbejdere.
   - Она должна проинструктировать новых сотрудников.

_verdict:_ `instruere`

### 141. anmelde

- stratum: **general** · batch: batch-0038.json · rank 1873
- facts: pos `verb` · gender `null` · IPA `[ˈanˌmεlˀə]`
- pronunciation: **а́нмэ́лэ**

1. **сообщать в полицию, заявлять** _(verb)_
   - Jeg vil anmelde tyveriet.
   - Я сообщу о краже в полицию.

_verdict:_ `anmelde`

### 142. adskillig

- stratum: **general** · batch: batch-0024.json · rank 1155
- facts: pos `adjective` · gender `null` · IPA `[aðˈsgelˀi]`
- pronunciation: **адсгэ́ли**

1. **несколько, многие** _(adjective)_
   - Vi har adskillige muligheder.
   - У нас есть несколько возможностей.

_verdict:_ `adskillig`

### 143. grov

- stratum: **general** · batch: batch-0028.json · rank 1369
- facts: pos `adjective` · gender `null` · IPA `[ˈgʁɒwˀ]`
- pronunciation: **гроу**

1. **грубый** _(adjective)_
   - Det var en grov kommentar.
   - Это был грубый комментарий.

_verdict:_ `grov`

### 144. elektrisk

- stratum: **general** · batch: batch-0054.json · rank 2691
- facts: pos `adjective` · gender `null` · IPA `[eˈlεgtʁisg]`
- pronunciation: **элэ́гтриск**

1. **электрический** _(adjective)_
   - Vi har købt en elektrisk cykel.
   - Мы купили электрический велосипед.

_verdict:_ `elektrisk`

### 145. rigelig

- stratum: **general** · batch: batch-0047.json · rank 2308
- facts: pos `adjective` · gender `null` · IPA `[ˈʁiːəli]`
- pronunciation: **ри́иэли**

1. **обильный, достаточный** _(adjective)_
   - Der er rigelig plads.
   - Места более чем достаточно.

_verdict:_ `rigelig`

### 146. anelse

- stratum: **general** · batch: batch-0054.json · rank 2676
- facts: pos `noun` · gender `en` · definite `anelsen` · IPA `[ˈæːnəlsə]`
- pronunciation: **э́нэльсэ**

1. **понятие, представление (о чём-либо)** _(noun, en)_
   - Jeg har ingen anelse om, hvad klokken er.
   - Я понятия не имею, который час.
2. **чуточка, лёгкий оттенок** _(noun, en)_
   - Der var en anelse sarkasme i hans stemme.
   - В его голосе была нотка сарказма.

_verdict:_ `anelse`

### 147. lag

- stratum: **general** · batch: batch-0042.json · rank 2091
- facts: pos `noun` · gender `et` · definite `laget` · IPA `[ˈlæˀj]`
- pronunciation: **лэй**

1. **слой** _(noun, et)_
   - Der ligger et lag sne.
   - Лежит слой снега.

_verdict:_ `lag`

### 148. smage

- stratum: **general** · batch: batch-0036.json · rank 1753
- facts: pos `verb` · gender `null` · IPA `[ˈsmæːjə]`
- pronunciation: **смэ́эйэ**

1. **пробовать на вкус, иметь вкус** _(verb)_
   - Jeg vil smage suppen.
   - Я хочу попробовать суп.

_verdict:_ `smage`

### 149. åbenlys

- stratum: **general** · batch: batch-0046.json · rank 2287
- facts: pos `adjective` · gender `null` · IPA `[-ˌlyˀs]`
- pronunciation: **люс**

1. **очевидный** _(adjective)_
   - Det er en åbenlys fejl.
   - Это очевидная ошибка.

_verdict:_ `åbenlys`

### 150. fortælling

- stratum: **general** · batch: batch-0023.json · rank 1134
- facts: pos `noun` · gender `en` · definite `fortællingen` · IPA `[fʌˈtεlˀeŋ]`
- pronunciation: **фотэ́линг**

1. **рассказ, повествование** _(noun, en)_
   - Det er en kort fortælling.
   - Это короткий рассказ.

_verdict:_ `fortælling`

### 151. episode

- stratum: **general** · batch: batch-0039.json · rank 1915
- facts: pos `noun` · gender `en` · definite `episoden` · IPA `[epiˈsoːðə]`
- pronunciation: **эпизо́одэ**

1. **эпизод** _(noun, en)_
   - Jeg ser en episode i aften.
   - Сегодня вечером я смотрю один эпизод.

_verdict:_ `episode`

### 152. reform

- stratum: **general** · batch: batch-0026.json · rank 1277
- facts: pos `noun` · gender `en` · definite `reformen` · IPA `[ʁεˈfɒˀm]`
- pronunciation: **рэфо́м**

1. **реформа** _(noun, en)_
   - Bogen beskriver en ny reform.
   - Книга описывает новую реформу.

_verdict:_ `reform`

### 153. medføre

- stratum: **general** · batch: batch-0024.json · rank 1158
- facts: pos `verb` · gender `null` · IPA `[-ˌføˀʌ]`
- pronunciation: **фё́эа**

1. **приводить к, влечь за собой** _(verb)_
   - Ændringen kan medføre højere priser.
   - Изменение может привести к более высоким ценам.

_verdict:_ `medføre`

### 154. religiøs

- stratum: **general** · batch: batch-0024.json · rank 1193
- facts: pos `adjective` · gender `null` · IPA `[ʁεliˈgjøˀs]`
- pronunciation: **рэлигйё́с**

1. **религиозный** _(adjective)_
   - Det er en religiøs tradition.
   - Это религиозная традиция.

_verdict:_ `religiøs`

### 155. støde

- stratum: **general** · batch: batch-0037.json · rank 1826
- facts: pos `verb` · gender `null` · IPA `[ˈsdøːðə]`
- pronunciation: **сдё́одэ**

1. **толкать, сталкиваться** _(verb)_
   - Pas på ikke at støde hovedet.
   - Смотри не ударься головой.

_verdict:_ `støde`

### 156. stabil

- stratum: **general** · batch: batch-0053.json · rank 2644
- facts: pos `adjective` · gender `null` · IPA `[sdaˈbiˀl]`
- pronunciation: **сдаби́ль**

1. **стабильный** _(adjective)_
   - Patientens tilstand er nu stabil.
   - Состояние пациента сейчас стабильно.

_verdict:_ `stabil`

### 157. køb

- stratum: **general** · batch: batch-0026.json · rank 1253
- facts: pos `noun` · gender `et` · definite `købet` · IPA `[ˈkøˀb]`
- pronunciation: **кёб**

1. **покупка** _(noun, et)_
   - Det var et godt køb.
   - Это была хорошая покупка.

_verdict:_ `køb`

### 158. grundlag

- stratum: **general** · batch: batch-0023.json · rank 1137
- facts: pos `noun` · gender `et` · definite `grundlaget` · IPA `[-ˌlæˀj]`
- pronunciation: **лэй**

1. **основа** _(noun, et)_
   - Det er et godt grundlag for arbejdet.
   - Это хорошая основа для работы.

_verdict:_ `grundlag`

### 159. tidsskrift

- stratum: **general** · batch: batch-0050.json · rank 2460
- facts: pos `noun` · gender `et` · definite `tidsskriftet` · IPA `[ˈtˢiðˌsɡ̊ʁɛfd̥]`
- pronunciation: **тидсгрэфт**

1. **журнал, периодическое издание** _(noun, et)_
   - Jeg læser et videnskabeligt tidsskrift.
   - Я читаю научный журнал.

_verdict:_ `tidsskrift`

### 160. jøde

- stratum: **general** · batch: batch-0034.json · rank 1696
- facts: pos `noun` · gender `en` · definite `jøden` · IPA `[ˈjøːðə]`
- pronunciation: **йё́одэ**

1. **еврей, еврейка** _(noun, en)_
   - Han er jøde.
   - Он еврей.

_verdict:_ `jøde`

### 161. fugl

- stratum: **general** · batch: batch-0035.json · rank 1724
- facts: pos `noun` · gender `en` · definite `fuglen` · IPA `[ˈfuˀl]`
- pronunciation: **фул**

1. **птица** _(noun, en)_
   - Der sidder en fugl i træet.
   - На дереве сидит птица.

_verdict:_ `fugl`

### 162. synes

- stratum: **general** · batch: batch-0034.json · rank 1657
- facts: pos `verb` · gender `null` · IPA `[ˈsynəs]`
- pronunciation: **сю́нес**

1. **считать, полагать** _(verb)_
   - Jeg synes, filmen er god.
   - Я считаю, что фильм хороший.

_verdict:_ `synes`

### 163. video

- stratum: **general** · batch: batch-0037.json · rank 1850
- facts: pos `noun` · gender `en` · definite `videoen` · IPA `[ˈviˀdjo]`
- pronunciation: **ви́дьо**

1. **видео** _(noun, en)_
   - Jeg ser en kort video.
   - Я смотрю короткое видео.

_verdict:_ `video`

### 164. semifinale

- stratum: **general** · batch: batch-0048.json · rank 2368
- facts: pos `noun` · gender `en` · definite `semifinalen` · IPA `[ˈsemi-]`
- pronunciation: **сэ́ми**

1. **полуфинал** _(noun, en)_
   - Holdet spiller i semifinalen.
   - Команда играет в полуфинале.

_verdict:_ `semifinale`

### 165. ægteskab

- stratum: **general** · batch: batch-0034.json · rank 1690
- facts: pos `noun` · gender `et` · definite `ægteskabet` · IPA `[ˈεgdəˌsgæˀb]`
- pronunciation: **э́гдэсгэб**

1. **брак** _(noun, et)_
   - De har et godt ægteskab.
   - У них хороший брак.

_verdict:_ `ægteskab`

### 166. skrue

- stratum: **general** · batch: batch-0036.json · rank 1772
- facts: pos `verb` · gender `null` · IPA `[ˈsgʁuːə]`
- pronunciation: **сгру́уэ**

1. **закручивать, крутить** _(verb)_
   - Du skal skrue låget på.
   - Тебе нужно закрутить крышку.

_verdict:_ `skrue`

### 167. ambassadør

- stratum: **general** · batch: batch-0042.json · rank 2051
- facts: pos `noun` · gender `en` · definite `ambassadøren` · IPA `[ɑmbasaˈdøˀɐ̯]`
- pronunciation: **амбассадё́а**

1. **посол** _(noun, en)_
   - Hun arbejder som ambassadør.
   - Она работает послом.

_verdict:_ `ambassadør`

### 168. overstå

- stratum: **general** · batch: batch-0047.json · rank 2350
- facts: pos `verb` · gender `null` · IPA `[-ˌsdɔˀ]`
- pronunciation: **сдо́**

1. **пережить, закончить** _(verb)_
   - Jeg vil gerne have prøven overstået, men først skal jeg overstå den.
   - Я хочу, чтобы экзамен уже закончился, но сначала мне нужно его пройти.

_verdict:_ `overstå`

### 169. pointe

- stratum: **general** · batch: batch-0042.json · rank 2093
- facts: pos `noun` · gender `en` · definite `pointen` · IPA `[poˈεŋdə]`
- pronunciation: **поэ́нтэ**

1. **суть, мысль** _(noun, en)_
   - Jeg forstår din pointe.
   - Я понимаю твою мысль.

_verdict:_ `pointe`

### 170. illustrere

- stratum: **general** · batch: batch-0050.json · rank 2476
- facts: pos `verb` · gender `null` · IPA `[iluˈsdʁεˀʌ]`
- pronunciation: **илусдрэ́эа**

1. **иллюстрировать, показывать на примере** _(verb)_
   - Grafen kan illustrere udviklingen.
   - График может показать развитие.

_verdict:_ `illustrere`

### 171. koge

- stratum: **general** · batch: batch-0040.json · rank 1967
- facts: pos `verb` · gender `null` · IPA `[ˈkɔːwə]`
- pronunciation: **ко́овэ**

1. **кипятить, варить** _(verb)_
   - Jeg skal koge vand.
   - Мне нужно вскипятить воду.

_verdict:_ `koge`

### 172. kategori

- stratum: **general** · batch: batch-0041.json · rank 2048
- facts: pos `noun` · gender `en` · definite `kategorien` · IPA `[kadəgoˈʁiˀ]`
- pronunciation: **кадэгори́**

1. **категория** _(noun, en)_
   - Varen hører til en anden kategori.
   - Товар относится к другой категории.

_verdict:_ `kategori`

### 173. stjerne

- stratum: **general** · batch: batch-0016.json · rank 777
- facts: pos `noun` · gender `en` · definite `stjernen` · IPA `[ˈsdjæɐ̯nə]`
- pronunciation: **сдья́анэ**

1. **звезда** _(noun, en)_
   - Om natten kan man se stjernerne.
   - Ночью можно увидеть звёзды.

_verdict:_ `stjerne`

### 174. tv

- stratum: **general** · batch: batch-0009.json · rank 441
- facts: pos `noun` · gender `et` · definite `tv'et` · IPA `[ˈteˀˌveˀ]`
- pronunciation: **тэ́вэ́**

1. **телевизор** _(noun, et)_
   - Vi køber et nyt tv.
   - Мы покупаем новый телевизор.
2. **телевидение** _(noun, et)_
   - Vi ser tv om aftenen.
   - Мы смотрим телевизор вечером.

_verdict:_ `tv`

### 175. tillade

- stratum: **general** · batch: batch-0021.json · rank 1008
- facts: pos `verb` · gender `null` · IPA `[ˈteˌlæˀðə]`
- pronunciation: **тэ́лэ́дэ**

1. **разрешать** _(verb)_
   - Reglerne tillader ikke rygning.
   - Правила не разрешают курить.

_verdict:_ `tillade`

### 176. forfærdelig

- stratum: **general** · batch: batch-0049.json · rank 2448
- facts: pos `adjective` · gender `null` · IPA `[fʌˈfæɐ̯ˀdli]`
- pronunciation: **фофэ́адли**

1. **ужасный** _(adjective)_
   - Det var en forfærdelig dag.
   - Это был ужасный день.

_verdict:_ `forfærdelig`

### 177. demonstrant

- stratum: **general** · batch: batch-0054.json · rank 2677
- facts: pos `noun` · gender `en` · definite `demonstranten` · IPA `[demɔnˈsdʁɑnˀd]`
- pronunciation: **демонсдра́нд**

1. **демонстрант, участник демонстрации** _(noun, en)_
   - Demonstranterne gik gennem gaderne.
   - Демонстранты шли по улицам.

_verdict:_ `demonstrant`

### 178. således

- stratum: **general** · batch: batch-0007.json · rank 324
- facts: pos `adverb` · gender `null` · IPA `[ˈsʌˌleðəs]`
- pronunciation: **со́лэдэс**

1. **таким образом** _(adverb)_
   - Hun gjorde det således.
   - Она сделала это таким образом.

_verdict:_ `således`

### 179. score

- stratum: **general** · batch: batch-0022.json · rank 1061
- facts: pos `verb` · gender `null` · IPA `[ˈsgoːʌ]`
- pronunciation: **сго́оа**

1. **забивать, набирать очки** _(verb)_
   - Han kan score et mål.
   - Он может забить гол.

_verdict:_ `score`

### 180. engagement

- stratum: **general** · batch: batch-0040.json · rank 1964
- facts: pos `noun` · gender `et` · definite `engagementet` · IPA `[ɑŋgaɕəˈmɑŋ]`
- pronunciation: **ангашэма́нг**

1. **вовлечённость, участие** _(noun, et)_
   - Hun viser stort engagement.
   - Она проявляет большую вовлечённость.

_verdict:_ `engagement`

### 181. politik

- stratum: **general** · batch: batch-0009.json · rank 439
- facts: pos `noun` · gender `en` · definite `politikken` · IPA `[poliˈtig]`
- pronunciation: **полити́г**

1. **политика** _(noun, en)_
   - Hun interesserer sig for politik.
   - Она интересуется политикой.

_verdict:_ `politik`

### 182. rolig

- stratum: **general** · batch: batch-0027.json · rank 1326
- facts: pos `adjective` · gender `null` · IPA `[ˈʁoːli]`
- pronunciation: **ро́оли**

1. **спокойный** _(adjective)_
   - Det er et roligt sted.
   - Это спокойное место.

_verdict:_ `rolig`

### 183. afsløre

- stratum: **general** · batch: batch-0018.json · rank 856
- facts: pos `verb` · gender `null` · IPA `[-ˌsløˀʌ]`
- pronunciation: **слё́эа**

1. **раскрывать, разоблачать** _(verb)_
   - Journalisten afslørede sandheden.
   - Журналист раскрыл правду.

_verdict:_ `afsløre`

### 184. parat

- stratum: **general** · batch: batch-0033.json · rank 1632
- facts: pos `adjective` · gender `null` · IPA `[pɑˈʁɑˀd]`
- pronunciation: **пара́д**

1. **готовый** _(adjective)_
   - Jeg er parat til at gå.
   - Я готов идти.

_verdict:_ `parat`

### 185. rige

- stratum: **general** · batch: batch-0050.json · rank 2481
- facts: pos `noun` · gender `et` · definite `riget` · IPA `[ˈʁiːə]`
- pronunciation: **ри́иэ**

1. **королевство, государство** _(noun, et)_
   - Det var engang et stort rige.
   - Когда-то это было большое государство.

_verdict:_ `rige`

### 186. begrundelse

- stratum: **general** · batch: batch-0041.json · rank 2049
- facts: pos `noun` · gender `en` · definite `begrundelsen` · IPA `[beˈgʁɔnˀəlsə]`
- pronunciation: **бэгро́нэлсэ**

1. **обоснование, причина** _(noun, en)_
   - Jeg vil gerne høre din begrundelse.
   - Я хотел бы услышать твоё обоснование.

_verdict:_ `begrundelse`

### 187. køn

- stratum: **general** · batch: batch-0049.json · rank 2424
- facts: pos `noun` · gender `et` · definite `kønnet` · IPA `[ˈkœnˀ]`
- pronunciation: **кён**

1. **пол** _(noun, et)_
   - Formularen spørger om køn.
   - В форме спрашивают пол.

_verdict:_ `køn`

### 188. leg

- stratum: **general** · batch: batch-0035.json · rank 1710
- facts: pos `noun` · gender `en` · definite `legen` · IPA `[ˈlɑjˀ]`
- pronunciation: **лай**

1. **игра** _(noun, en)_
   - Det er en sjov leg.
   - Это весёлая игра.

_verdict:_ `leg`

### 189. ansættelse

- stratum: **general** · batch: batch-0052.json · rank 2576
- facts: pos `noun` · gender `en` · definite `ansættelsen` · IPA `[ˈanˌsεdəlsə]`
- pronunciation: **а́нсэдэльсэ**

1. **трудоустройство, наём на работу** _(noun, en)_
   - Hendes ansættelse starter i januar.
   - Её трудоустройство начинается в январе.

_verdict:_ `ansættelse`

### 190. afbryde

- stratum: **general** · batch: batch-0049.json · rank 2441
- facts: pos `verb` · gender `null` · IPA `[-ˌbʁyˀðə]`
- pronunciation: **брю́дэ**

1. **прерывать** _(verb)_
   - Jeg vil ikke afbryde dig.
   - Я не хочу тебя перебивать.

_verdict:_ `afbryde`

### 191. debut

- stratum: **general** · batch: batch-0054.json · rank 2688
- facts: pos `noun` · gender `en` · definite `debuten` · IPA `[deˈby]`
- pronunciation: **дэбю́**

1. **дебют** _(noun, en)_
   - Han havde sin debut som skuespiller sidste år.
   - У него был дебют в качестве актёра в прошлом году.

_verdict:_ `debut`

### 192. bekæmpe

- stratum: **general** · batch: batch-0041.json · rank 2017
- facts: pos `verb` · gender `null` · IPA `[beˈkεmˀbə]`
- pronunciation: **бэкэ́мбэ**

1. **бороться с** _(verb)_
   - Vi skal bekæmpe sygdommen.
   - Мы должны бороться с болезнью.

_verdict:_ `bekæmpe`

### 193. system

- stratum: **general** · batch: batch-0010.json · rank 458
- facts: pos `noun` · gender `et` · definite `systemet` · IPA `[syˈsdeˀm]`
- pronunciation: **сюсдэ́м**

1. **система** _(noun, et)_
   - Systemet virker ikke i dag.
   - Система сегодня не работает.

_verdict:_ `system`

### 194. kæmpe

- stratum: **general** · batch: batch-0014.json · rank 694
- facts: pos `verb` · gender `null` · IPA `[ˈkεmbə]`
- pronunciation: **кэ́мбэ**

1. **бороться** _(verb)_
   - De kæmper for frihed.
   - Они борются за свободу.
2. **великан** _(noun)_
   - I historien er der en stor kæmpe.
   - В сказке есть большой великан.

_verdict:_ `kæmpe`

### 195. forudse

- stratum: **general** · batch: batch-0045.json · rank 2250
- facts: pos `verb` · gender `null` · IPA `[ˈfɒuðˌseˀ]`
- pronunciation: **фо́удсэ**

1. **предвидеть** _(verb)_
   - Ingen kunne forudse problemet.
   - Никто не мог предвидеть проблему.

_verdict:_ `forudse`

### 196. realitet

- stratum: **general** · batch: batch-0037.json · rank 1843
- facts: pos `noun` · gender `en` · definite `realiteten` · IPA `[ʁεaliˈteˀd]`
- pronunciation: **рэалитэ́д**

1. **реальность** _(noun, en)_
   - Planen blev en realitet.
   - План стал реальностью.

_verdict:_ `realitet`

### 197. effektiv

- stratum: **general** · batch: batch-0019.json · rank 949
- facts: pos `adjective` · gender `null` · IPA `[ˈεfəgˌtiwˀ]`
- pronunciation: **э́фэгтиу**

1. **эффективный** _(adjective)_
   - Det er en effektiv metode.
   - Это эффективный метод.

_verdict:_ `effektiv`

### 198. sige

- stratum: **general** · batch: batch-0001.json · rank 31
- facts: pos `verb` · gender `null` · IPA `[ˈsiː]`
- pronunciation: **си́и**

1. **говорить, сказать** _(verb)_
   - Kan du sige det igen?
   - Можешь сказать это ещё раз?

_verdict:_ `sige`

### 199. forside

- stratum: **general** · batch: batch-0051.json · rank 2511
- facts: pos `noun` · gender `en` · definite `forsiden` · IPA `[ˈfɒː-]`
- pronunciation: **фо́о**

1. **обложка, первая страница** _(noun, en)_
   - Billedet er på avisens forside.
   - Фотография на первой странице газеты.

_verdict:_ `forside`

### 200. liberal

- stratum: **general** · batch: batch-0028.json · rank 1386
- facts: pos `adjective` · gender `null` · IPA `[libəˈʁɑˀl]`
- pronunciation: **либэра́л**

1. **либеральный** _(adjective)_
   - Bogen beskriver en liberal idé.
   - Книга описывает либеральную идею.

_verdict:_ `liberal`

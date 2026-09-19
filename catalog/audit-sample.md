# Catalog audit sample

200 of 2927 accepted rows · seed `1` · drawn 2026-09-19T22:18:45.991Z

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

- **pos_unsettled** (3) — COR could not classify the lemma, so the generator chose — and can be wrong.
- **no_ipa** (24) — No IPA was found, so the pronunciation must be null. Check nobody quietly filled it.
- **tail** (30) — The deep end of the ranking, where meanings get thin and examples get strange.
- **head** (30) — The most frequent words. A defect here is the one you will meet.
- **general** (113) — Drawn at random across everything else, including every batch.

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

### 3. anden

- stratum: **pos_unsettled** · batch: batch-0001.json · rank 34
- facts: pos `null` · gender `null` · IPA `[ˈanən]`
- pronunciation: **а́нэн**

1. **другой** _(adjective)_
   - Jeg tager en anden bus.
   - Я поеду на другом автобусе.

_verdict:_ `anden`

### 4. magtfuld

- stratum: **no_ipa** · batch: batch-0056.json · rank 2786
- facts: pos `adjective` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **могущественный, влиятельный** _(adjective)_
   - Han er en magtfuld mand i byen.
   - Он влиятельный человек в городе.

_verdict:_ `magtfuld`

### 5. tredjedel

- stratum: **no_ipa** · batch: batch-0038.json · rank 1867
- facts: pos `noun` · gender `en` · definite `tredjedelen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **треть** _(noun, en)_
   - En tredjedel af gruppen er ny.
   - Треть группы новая.

_verdict:_ `tredjedel`

### 6. overse

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

### 7. valgkamp

- stratum: **no_ipa** · batch: batch-0030.json · rank 1473
- facts: pos `noun` · gender `en` · definite `valgkampen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **избирательная кампания** _(noun, en)_
   - Avisen skriver om en valgkamp.
   - Газета пишет об избирательной кампании.

_verdict:_ `valgkamp`

### 8. folkeparti

- stratum: **no_ipa** · batch: batch-0015.json · rank 714
- facts: pos `noun` · gender `et` · definite `folkepartiet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **народная партия** _(noun, et)_
   - Bogen beskriver et folkeparti.
   - Книга описывает народную партию.

_verdict:_ `folkeparti`

### 9. indsætte

- stratum: **no_ipa** · batch: batch-0060.json · rank 2987
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **вносить, вставлять** _(verb)_
   - Du kan indsætte penge på kontoen i banken.
   - Ты можешь внести деньги на счёт в банке.

_verdict:_ `indsætte`

### 10. præsidentvalg

- stratum: **no_ipa** · batch: batch-0060.json · rank 2982
- facts: pos `noun` · gender `et` · definite `præsidentvalget` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **президентские выборы** _(noun, et)_
   - Præsidentvalget finder sted i november.
   - Президентские выборы состоятся в ноябре.

_verdict:_ `præsidentvalg`

### 11. indgreb

- stratum: **no_ipa** · batch: batch-0050.json · rank 2462
- facts: pos `noun` · gender `et` · definite `indgrebet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **вмешательство, процедура** _(noun, et)_
   - Lægen forklarer det lille indgreb.
   - Врач объясняет небольшую процедуру.

_verdict:_ `indgreb`

### 12. generalforsamling

- stratum: **no_ipa** · batch: batch-0036.json · rank 1751
- facts: pos `noun` · gender `en` · definite `generalforsamlingen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **общее собрание** _(noun, en)_
   - Foreningen holder generalforsamling i marts.
   - Объединение проводит общее собрание в марте.

_verdict:_ `generalforsamling`

### 13. opfatte

- stratum: **no_ipa** · batch: batch-0025.json · rank 1217
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **воспринимать, понимать** _(verb)_
   - Jeg opfatter beskeden anderledes.
   - Я воспринимаю сообщение иначе.

_verdict:_ `opfatte`

### 14. retssag

- stratum: **no_ipa** · batch: batch-0036.json · rank 1757
- facts: pos `noun` · gender `en` · definite `retssagen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **судебное дело** _(noun, en)_
   - Firmaet er med i en retssag.
   - Компания участвует в судебном деле.

_verdict:_ `retssag`

### 15. topmøde

- stratum: **no_ipa** · batch: batch-0042.json · rank 2068
- facts: pos `noun` · gender `et` · definite `topmødet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **саммит** _(noun, et)_
   - De deltager i et topmøde.
   - Они участвуют в саммите.

_verdict:_ `topmøde`

### 16. topchef

- stratum: **no_ipa** · batch: batch-0049.json · rank 2435
- facts: pos `noun` · gender `en` · definite `topchefen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **высший руководитель** _(noun, en)_
   - Hun er topchef i virksomheden.
   - Она высший руководитель компании.

_verdict:_ `topchef`

### 17. hestekraft

- stratum: **no_ipa** · batch: batch-0037.json · rank 1815
- facts: pos `noun` · gender `en` · definite `hestekraften` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **лошадиная сила** _(noun, en)_
   - Motoren har én hestekraft mere.
   - У двигателя на одну лошадиную силу больше.

_verdict:_ `hestekraft`

### 18. årrække

- stratum: **no_ipa** · batch: batch-0038.json · rank 1864
- facts: pos `noun` · gender `en` · definite `årrækken` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **ряд лет** _(noun, en)_
   - Hun har boet her i en årrække.
   - Она живёт здесь уже ряд лет.

_verdict:_ `årrække`

### 19. statsminister

- stratum: **no_ipa** · batch: batch-0013.json · rank 642
- facts: pos `noun` · gender `en` · definite `statsministeren` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **премьер-министр** _(noun, en)_
   - Avisen skriver om en statsminister.
   - Газета пишет о премьер-министре.

_verdict:_ `statsminister`

### 20. pressemøde

- stratum: **no_ipa** · batch: batch-0047.json · rank 2310
- facts: pos `noun` · gender `et` · definite `pressemødet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **пресс-конференция** _(noun, et)_
   - Der er pressemøde i morgen.
   - Завтра будет пресс-конференция.

_verdict:_ `pressemøde`

### 21. pressemeddelelse

- stratum: **no_ipa** · batch: batch-0040.json · rank 1993
- facts: pos `noun` · gender `en` · definite `pressemeddelelsen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **пресс-релиз** _(noun, en)_
   - Firmaet sender en pressemeddelelse.
   - Компания выпускает пресс-релиз.

_verdict:_ `pressemeddelelse`

### 22. udspil

- stratum: **no_ipa** · batch: batch-0040.json · rank 1981
- facts: pos `noun` · gender `et` · definite `udspillet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **предложение, инициатива** _(noun, et)_
   - De kommer med et nyt udspil.
   - Они выступают с новым предложением.

_verdict:_ `udspil`

### 23. halvdel

- stratum: **no_ipa** · batch: batch-0016.json · rank 784
- facts: pos `noun` · gender `en` · definite `halvdelen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **половина** _(noun, en)_
   - Jeg spiser en halvdel af kagen.
   - Я съедаю половину торта.

_verdict:_ `halvdel`

### 24. hjemmebane

- stratum: **no_ipa** · batch: batch-0051.json · rank 2520
- facts: pos `noun` · gender `en` · definite `hjemmebanen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **домашнее поле** _(noun, en)_
   - Holdet spiller på hjemmebane.
   - Команда играет на домашнем поле.

_verdict:_ `hjemmebane`

### 25. sundhedsvæsen

- stratum: **no_ipa** · batch: batch-0056.json · rank 2791
- facts: pos `noun` · gender `et` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **здравоохранение** _(noun, et)_
   - Det danske sundhedsvæsen er gratis for borgerne.
   - Датское здравоохранение бесплатно для граждан.

_verdict:_ `sundhedsvæsen`

### 26. tilknytte

- stratum: **no_ipa** · batch: batch-0046.json · rank 2263
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **прикреплять, связывать** _(verb)_
   - Vi vil tilknytte en rådgiver til projektet.
   - Мы прикрепим консультанта к проекту.

_verdict:_ `tilknytte`

### 27. højskole

- stratum: **no_ipa** · batch: batch-0037.json · rank 1812
- facts: pos `noun` · gender `en` · definite `højskolen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **народная высшая школа** _(noun, en)_
   - Hun går på højskole i et år.
   - Она учится год в народной высшей школе.

_verdict:_ `højskole`

### 28. annoncere

- stratum: **tail** · batch: batch-0057.json · rank 2830
- facts: pos `verb` · gender `null` · IPA `[anʌŋˈseˀʌ]`
- pronunciation: **анонсэ́а**

1. **объявлять, анонсировать** _(verb)_
   - Firmaet vil annoncere det nye produkt i morgen.
   - Компания объявит о новом продукте завтра.

_verdict:_ `annoncere`

### 29. dimension

- stratum: **tail** · batch: batch-0058.json · rank 2888
- facts: pos `noun` · gender `en` · definite `dimensionen` · IPA `[dimənˈɕoˀn]`
- pronunciation: **димэншо'н**

1. **измерение, размер** _(noun, en)_
   - Problemet har en ny dimension nu.
   - Теперь у проблемы новое измерение.

_verdict:_ `dimension`

### 30. sårbar

- stratum: **tail** · batch: batch-0060.json · rank 2956
- facts: pos `adjective` · gender `null` · IPA `[ˈsɒːˌbɑˀ]`
- pronunciation: **сорба**

1. **уязвимый** _(adjective)_
   - Hun følte sig meget sårbar efter operationen.
   - После операции она чувствовала себя очень уязвимой.

_verdict:_ `sårbar`

### 31. smør

- stratum: **tail** · batch: batch-0055.json · rank 2711
- facts: pos `noun` · gender `et` · definite `smørret` · IPA `[ˈsmɶɐ̯]`
- pronunciation: **смё́а**

1. **масло (сливочное)** _(noun, et)_
   - Kan du række mig smørret?
   - Можешь передать мне масло?

_verdict:_ `smør`

### 32. udfald

- stratum: **tail** · batch: batch-0060.json · rank 2990
- facts: pos `noun` · gender `et` · definite `udfaldet` · IPA `[ˈuðˌfalˀ]`
- pronunciation: **удфаль**

1. **исход, результат** _(noun, et)_
   - Udfaldet af valget overraskede mange.
   - Исход выборов удивил многих.

_verdict:_ `udfald`

### 33. røveri

- stratum: **tail** · batch: batch-0056.json · rank 2790
- facts: pos `noun` · gender `et` · definite `røveriet` · IPA `[ʁœwʌˈʁiˀ]`
- pronunciation: **рёвори́**

1. **ограбление** _(noun, et)_
   - Politiet stoppede et røveri i banken.
   - Полиция предотвратила ограбление банка.

_verdict:_ `røveri`

### 34. allé

- stratum: **tail** · batch: batch-0057.json · rank 2806
- facts: pos `noun` · gender `en` · IPA `[aˈleˀ]`
- pronunciation: **алэ́**

1. **аллея** _(noun, en)_
   - Vi gik en tur ned ad alléen.
   - Мы прогулялись по аллее.

_verdict:_ `allé`

### 35. sproglig

- stratum: **tail** · batch: batch-0057.json · rank 2847
- facts: pos `adjective` · gender `null` · IPA `[ˈsbʁɔwli]`
- pronunciation: **сбро́вли**

1. **языковой, лингвистический** _(adjective)_
   - Børnene har store sproglige evner.
   - У детей большие языковые способности.

_verdict:_ `sproglig`

### 36. styrte

- stratum: **tail** · batch: batch-0060.json · rank 2963
- facts: pos `verb` · gender `null` · IPA `[ˈsdyɐ̯də]`
- pronunciation: **стюрдэ**

1. **падать, рушиться** _(verb)_
   - Flyet styrtede ned i havet.
   - Самолёт упал в море.
2. **мчаться, нестись** _(verb)_
   - Han styrtede ud af huset.
   - Он бросился вон из дома.

_verdict:_ `styrte`

### 37. fundament

- stratum: **tail** · batch: batch-0058.json · rank 2851
- facts: pos `noun` · gender `et` · definite `fundamentet` · IPA `[fɔndaˈmεnˀd]`
- pronunciation: **фонда'мент**

1. **фундамент (основание здания)** _(noun, et)_
   - Huset har et solidt fundament.
   - У дома прочный фундамент.
2. **основа (чего-либо, в переносном смысле)** _(noun, et)_
   - Tillid er fundamentet for et godt ægteskab.
   - Доверие — основа хорошего брака.

_verdict:_ `fundament`

### 38. psykologisk

- stratum: **tail** · batch: batch-0055.json · rank 2737
- facts: pos `adjective` · gender `null` · IPA `[sygoˈloˀisg]`
- pronunciation: **сюголо́исг**

1. **психологический** _(adjective)_
   - Hun har brug for psykologisk hjælp efter ulykken.
   - Ей нужна психологическая помощь после аварии.

_verdict:_ `psykologisk`

### 39. skandinavisk

- stratum: **tail** · batch: batch-0055.json · rank 2736
- facts: pos `adjective` · gender `null` · IPA `[sgandiˈnæˀvisg]`
- pronunciation: **сгандинэ́висг**

1. **скандинавский** _(adjective)_
   - De elsker den skandinaviske natur om sommeren.
   - Они любят скандинавскую природу летом.

_verdict:_ `skandinavisk`

### 40. appellere

- stratum: **tail** · batch: batch-0060.json · rank 2970
- facts: pos `verb` · gender `null` · IPA `[ɑbəˈleˀʌ]`
- pronunciation: **абэлеа**

1. **подавать апелляцию, апеллировать** _(verb)_
   - Advokaten valgte at appellere dommen.
   - Адвокат решил подать апелляцию на приговор.

_verdict:_ `appellere`

### 41. fase

- stratum: **tail** · batch: batch-0058.json · rank 2878
- facts: pos `noun` · gender `en` · definite `fasen` · IPA `[ˈfæːsə]`
- pronunciation: **фэ'се**

1. **фаза, этап** _(noun, en)_
   - Vi er i en ny fase af projektet.
   - Мы на новом этапе проекта.

_verdict:_ `fase`

### 42. vaccine

- stratum: **tail** · batch: batch-0056.json · rank 2769
- facts: pos `noun` · gender `en` · definite `vaccinen` · IPA `[vɑgˈsiːnə]`
- pronunciation: **вагси́не**

1. **вакцина** _(noun, en)_
   - Børnene får en vaccine mod mæslinger.
   - Детям делают вакцину от кори.

_verdict:_ `vaccine`

### 43. kemisk

- stratum: **tail** · batch: batch-0060.json · rank 2972
- facts: pos `adjective` · gender `null` · IPA `[ˈkeˀmisg]`
- pronunciation: **кемиск**

1. **химический** _(adjective)_
   - Vandet indeholder flere kemiske stoffer.
   - Вода содержит несколько химических веществ.

_verdict:_ `kemisk`

### 44. øjeblikkelig

- stratum: **tail** · batch: batch-0058.json · rank 2864
- facts: pos `adjective` · gender `null` · IPA `[ʌjəˈblegəli]`
- pronunciation: **ёйебле'гели**

1. **немедленный, мгновенный** _(adjective)_
   - Vi har brug for øjeblikkelig hjælp.
   - Нам нужна немедленная помощь.

_verdict:_ `øjeblikkelig`

### 45. eksperiment

- stratum: **tail** · batch: batch-0059.json · rank 2912
- facts: pos `noun` · gender `et` · definite `eksperimentet` · IPA `[εgspæɐ̯iˈmεnˀd]`
- pronunciation: **эгспэаимэ́нд**

1. **эксперимент** _(noun, et)_
   - Læreren lavede et eksperiment i timen.
   - Учитель провёл эксперимент на уроке.

_verdict:_ `eksperiment`

### 46. forlængelse

- stratum: **tail** · batch: batch-0056.json · rank 2767
- facts: pos `noun` · gender `en` · definite `forlængelsen` · IPA `[fʌˈlεŋˀəlsə]`
- pronunciation: **фоле́нгельсе**

1. **продление** _(noun, en)_
   - Vi har søgt om forlængelse af visummet.
   - Мы подали заявку на продление визы.

_verdict:_ `forlængelse`

### 47. frustration

- stratum: **tail** · batch: batch-0059.json · rank 2940
- facts: pos `noun` · gender `en` · definite `frustrationen` · IPA `[fʁusdʁɑˈɕoˀn]`
- pronunciation: **фрусдрашо́н**

1. **разочарование, фрустрация** _(noun, en)_
   - Han udtrykte sin frustration over ventetiden.
   - Он выразил своё разочарование из-за ожидания.

_verdict:_ `frustration`

### 48. cigaret

- stratum: **tail** · batch: batch-0060.json · rank 2983
- facts: pos `noun` · gender `en` · definite `cigaretten` · IPA `[sigəˈʁad]`
- pronunciation: **сигарад**

1. **сигарета** _(noun, en)_
   - Han tændte en cigaret udenfor.
   - Он закурил сигарету на улице.

_verdict:_ `cigaret`

### 49. pave

- stratum: **tail** · batch: batch-0059.json · rank 2927
- facts: pos `noun` · gender `en` · definite `paven` · IPA `[ˈpæːvə]`
- pronunciation: **пэ́ве**

1. **папа римский** _(noun, en)_
   - Paven besøgte Danmark.
   - Папа римский посетил Данию.

_verdict:_ `pave`

### 50. hade

- stratum: **tail** · batch: batch-0055.json · rank 2746
- facts: pos `verb` · gender `null` · IPA `[ˈhæːðə]`
- pronunciation: **хэ́де**

1. **ненавидеть** _(verb)_
   - Jeg hader at stå tidligt op om vinteren.
   - Я ненавижу вставать рано зимой.

_verdict:_ `hade`

### 51. dødsfald

- stratum: **tail** · batch: batch-0058.json · rank 2872
- facts: pos `noun` · gender `et` · definite `dødsfaldet` · IPA `[-ˌfalˀ]`
- pronunciation: **дёсфа'л**

1. **смерть, случай смерти** _(noun, et)_
   - Der var tre dødsfald i familien sidste år.
   - В прошлом году в семье было три смерти.

_verdict:_ `dødsfald`

### 52. læsning

- stratum: **tail** · batch: batch-0055.json · rank 2741
- facts: pos `noun` · gender `en` · definite `læsningen` · IPA `[ˈlεːsneŋ]`
- pronunciation: **лэ́сненг**

1. **чтение** _(noun, en)_
   - Læsning før sengetid gør mig træt.
   - Чтение перед сном меня утомляет.

_verdict:_ `læsning`

### 53. egne

- stratum: **tail** · batch: batch-0056.json · rank 2779
- facts: pos `verb` · gender `null` · IPA `[ˈɑjnə]`
- pronunciation: **а́йне**

1. **подходить, годиться** _(verb)_
   - Denne bog egner sig godt til børn.
   - Эта книга хорошо подходит для детей.

_verdict:_ `egne`

### 54. norm

- stratum: **tail** · batch: batch-0058.json · rank 2861
- facts: pos `noun` · gender `en` · definite `normen` · IPA `[ˈnɒˀm]`
- pronunciation: **но'рм**

1. **норма (принятое правило поведения)** _(noun, en)_
   - Det er en norm at sige goddag.
   - Здороваться — это норма.
2. **норма (установленный показатель)** _(noun, en)_
   - Fabrikken overholder normen for støj.
   - Завод соблюдает норму по шуму.

_verdict:_ `norm`

### 55. vanvittig

- stratum: **tail** · batch: batch-0057.json · rank 2841
- facts: pos `adjective` · gender `null` · IPA `[ˈvanˌvidi]`
- pronunciation: **ва́нвиди**

1. **безумный, сумасшедший** _(adjective)_
   - Det er vanvittigt, hvor meget det koster.
   - Это безумие — сколько это стоит.

_verdict:_ `vanvittig`

### 56. fair

- stratum: **tail** · batch: batch-0056.json · rank 2762
- facts: pos `adjective` · gender `null` · IPA `[ˈfεːɐ̯]`
- pronunciation: **фэ́а**

1. **честный, справедливый** _(adjective)_
   - Det var ikke fair af dig.
   - Это было нечестно с твоей стороны.

_verdict:_ `fair`

### 57. humør

- stratum: **tail** · batch: batch-0055.json · rank 2714
- facts: pos `noun` · gender `et` · definite `humøret` · IPA `[huˈmøˀɐ̯]`
- pronunciation: **хумё́а**

1. **настроение** _(noun, et)_
   - Jeg er i godt humør i dag.
   - Я сегодня в хорошем настроении.

_verdict:_ `humør`

### 58. betydning

- stratum: **head** · batch: batch-0013.json · rank 616
- facts: pos `noun` · gender `en` · definite `betydningen` · IPA `[beˈtyðˀneŋ]`
- pronunciation: **бэтю́днинг**

1. **значение** _(noun, en)_
   - Jeg kender ikke ordets betydning.
   - Я не знаю значения слова.

_verdict:_ `betydning`

### 59. bryde

- stratum: **head** · batch: batch-0010.json · rank 490
- facts: pos `verb` · gender `null` · IPA `[ˈbʁyːðə]`
- pronunciation: **брю́удэ**

1. **ломать, нарушать** _(verb)_
   - Du må ikke bryde reglerne.
   - Нельзя нарушать правила.

_verdict:_ `bryde`

### 60. gade

- stratum: **head** · batch: batch-0014.json · rank 677
- facts: pos `noun` · gender `en` · definite `gaden` · IPA `[ˈgæːðə]`
- pronunciation: **гэ́эдэ**

1. **улица** _(noun, en)_
   - Vi bor i en stille gade.
   - Мы живём на тихой улице.

_verdict:_ `gade`

### 61. betydelig

- stratum: **head** · batch: batch-0020.json · rank 987
- facts: pos `adjective` · gender `null` · IPA `[beˈtyˀðəli]`
- pronunciation: **бэтю́дэли**

1. **значительный** _(adjective)_
   - Der er en betydelig forskel.
   - Есть значительная разница.

_verdict:_ `betydelig`

### 62. overraske

- stratum: **head** · batch: batch-0016.json · rank 756
- facts: pos `verb` · gender `null` · IPA `[ˈɒwʌˌʁɑsgə]`
- pronunciation: **о́вора́скэ**

1. **удивлять** _(verb)_
   - Jeg vil overraske hende med en gave.
   - Я хочу удивить её подарком.

_verdict:_ `overraske`

### 63. forsker

- stratum: **head** · batch: batch-0014.json · rank 696
- facts: pos `noun` · gender `en` · definite `forskeren` · IPA `[ˈfɒːsgʌ]`
- pronunciation: **фо́осго**

1. **исследователь, учёный** _(noun, en)_
   - Hun arbejder som forsker.
   - Она работает исследователем.

_verdict:_ `forsker`

### 64. fælles

- stratum: **head** · batch: batch-0010.json · rank 472
- facts: pos `adjective` · gender `null` · IPA `[ˈfεlˀəs]`
- pronunciation: **фэ́лэс**

1. **общий, совместный** _(adjective)_
   - Vi har et fælles mål.
   - У нас общая цель.

_verdict:_ `fælles`

### 65. artikel

- stratum: **head** · batch: batch-0011.json · rank 528
- facts: pos `noun` · gender `en` · definite `artiklen` · IPA `[ɑˈtigəl]`
- pronunciation: **ати́гэл**

1. **статья** _(noun, en)_
   - Jeg læser en artikel.
   - Я читаю статью.

_verdict:_ `artikel`

### 66. læse

- stratum: **head** · batch: batch-0006.json · rank 282
- facts: pos `verb` · gender `null` · IPA `[ˈlεːsə]`
- pronunciation: **лэ́эсэ**

1. **читать** _(verb)_
   - Jeg vil læse denne bog.
   - Я хочу прочитать эту книгу.

_verdict:_ `læse`

### 67. kort

- stratum: **head** · batch: batch-0006.json · rank 276
- facts: pos `adjective` · gender `null` · IPA `[ˈkɒːd]`
- pronunciation: **ко́од**

1. **короткий** _(adjective)_
   - Det var en kort tur.
   - Это была короткая поездка.

_verdict:_ `kort`

### 68. tradition

- stratum: **head** · batch: batch-0020.json · rank 983
- facts: pos `noun` · gender `en` · definite `traditionen` · IPA `[tʁɑdiˈɕoˀn]`
- pronunciation: **традишо́н**

1. **традиция** _(noun, en)_
   - Det er en gammel tradition.
   - Это старая традиция.

_verdict:_ `tradition`

### 69. eftermiddag

- stratum: **head** · batch: batch-0020.json · rank 953
- facts: pos `noun` · gender `en` · definite `eftermiddagen` · IPA `[ˈεfdʌmeˌdæˀ]`
- pronunciation: **э́фтомэдэ́й**

1. **вторая половина дня** _(noun, en)_
   - Vi ses i eftermiddag.
   - Увидимся сегодня днём.

_verdict:_ `eftermiddag`

### 70. lade

- stratum: **head** · batch: batch-0004.json · rank 176
- facts: pos `verb` · gender `null` · IPA `[ˈla]`
- pronunciation: **ла**

1. **позволять** _(verb)_
   - Jeg vil lade ham prøve først.
   - Я позволю ему попробовать первым.

_verdict:_ `lade`

### 71. væk

- stratum: **head** · batch: batch-0008.json · rank 357
- facts: pos `adverb` · gender `null` · IPA `[ˈvεg]`
- pronunciation: **вэг**

1. **прочь, отсутствующий** _(adverb)_
   - Min nøgle er væk.
   - Мой ключ пропал.

_verdict:_ `væk`

### 72. næste

- stratum: **head** · batch: batch-0005.json · rank 216
- facts: pos `adjective` · gender `null` · IPA `[ˈnεsdə]`
- pronunciation: **нэ́стэ**

1. **следующий** _(adjective)_
   - Vi ses næste uge.
   - Увидимся на следующей неделе.

_verdict:_ `næste`

### 73. selve

- stratum: **head** · batch: batch-0016.json · rank 788
- facts: pos `adjective` · gender `null` · IPA `[ˈsεlvə]`
- pronunciation: **сэ́лвэ**

1. **сам, непосредственно** _(adjective)_
   - Selve huset er gammelt.
   - Сам дом старый.

_verdict:_ `selve`

### 74. kæmpe

- stratum: **head** · batch: batch-0014.json · rank 694
- facts: pos `verb` · gender `null` · IPA `[ˈkεmbə]`
- pronunciation: **кэ́мбэ**

1. **бороться** _(verb)_
   - Vi må kæmpe for vores mål.
   - Мы должны бороться за нашу цель.

_verdict:_ `kæmpe`

### 75. professionel

- stratum: **head** · batch: batch-0019.json · rank 941
- facts: pos `adjective` · gender `null` · IPA `[pʁoˈfεɕoˌnεlˀ]`
- pronunciation: **профэшонэ́л**

1. **профессиональный** _(adjective)_
   - Hun giver professionel hjælp.
   - Она оказывает профессиональную помощь.

_verdict:_ `professionel`

### 76. vej

- stratum: **head** · batch: batch-0003.json · rank 148
- facts: pos `noun` · gender `en` · definite `vejen` · IPA `[ˈvɑjˀ]`
- pronunciation: **вай**

1. **дорога, путь** _(noun, en)_
   - Det er den rigtige vej.
   - Это правильная дорога.

_verdict:_ `vej`

### 77. omkring

- stratum: **head** · batch: batch-0004.json · rank 157
- facts: pos `preposition` · gender `null` · IPA `[ʌmˈkʁεŋˀ]`
- pronunciation: **омкрэ́нг**

1. **вокруг** _(preposition)_
   - Vi går omkring søen.
   - Мы идём вокруг озера.

_verdict:_ `omkring`

### 78. endda

- stratum: **head** · batch: batch-0018.json · rank 891
- facts: pos `adverb` · gender `null` · IPA `[enˈda]`
- pronunciation: **энда́**

1. **даже** _(adverb)_
   - Han kom endda før mig.
   - Он пришёл даже раньше меня.

_verdict:_ `endda`

### 79. positiv

- stratum: **head** · batch: batch-0010.json · rank 475
- facts: pos `adjective` · gender `null` · IPA `[ˈpoːsiˌtiwˀ]`
- pronunciation: **по́ситиу**

1. **положительный** _(adjective)_
   - Det er en positiv nyhed.
   - Это хорошая новость.

_verdict:_ `positiv`

### 80. afvise

- stratum: **head** · batch: batch-0011.json · rank 526
- facts: pos `verb` · gender `null` · IPA `[ˈɑwˌviˀsə]`
- pronunciation: **ауи́сэ**

1. **отклонять, отвергать** _(verb)_
   - Hun vil afvise tilbuddet.
   - Она отклонит предложение.

_verdict:_ `afvise`

### 81. siden

- stratum: **head** · batch: batch-0003.json · rank 126
- facts: pos `adverb` · gender `null` · IPA `[ˈsiðən]`
- pronunciation: **си́дэн**

1. **с тех пор** _(adverb)_
   - Jeg har ikke set ham siden.
   - Я не видел его с тех пор.

_verdict:_ `siden`

### 82. selvfølgelig

- stratum: **head** · batch: batch-0007.json · rank 331
- facts: pos `adverb` · gender `null` · IPA `[sεˈføli]`
- pronunciation: **сэфё́ли**

1. **конечно** _(adverb)_
   - Selvfølgelig kan jeg hjælpe.
   - Конечно, я могу помочь.

_verdict:_ `selvfølgelig`

### 83. syne

- stratum: **head** · batch: batch-0005.json · rank 219
- facts: pos `verb` · gender `null` · IPA `[ˈsyːnə]`
- pronunciation: **сю́унэ**

1. **казаться, выглядеть** _(verb)_
   - Huset syner stort.
   - Дом выглядит большим.

_verdict:_ `syne`

### 84. svar

- stratum: **head** · batch: batch-0010.json · rank 495
- facts: pos `noun` · gender `et` · definite `svaret` · IPA `[ˈsvɑˀ]`
- pronunciation: **сва**

1. **ответ** _(noun, et)_
   - Jeg venter på et svar.
   - Я жду ответа.

_verdict:_ `svar`

### 85. forsøge

- stratum: **head** · batch: batch-0006.json · rank 273
- facts: pos `verb` · gender `null` · IPA `[fʌˈsøˀjə]`
- pronunciation: **фосё́йэ**

1. **пытаться** _(verb)_
   - Jeg vil forsøge igen.
   - Я попробую снова.

_verdict:_ `forsøge`

### 86. post

- stratum: **head** · batch: batch-0013.json · rank 649
- facts: pos `noun` · gender `en` · definite `posten` · IPA `[ˈpʌsd]`
- pronunciation: **пост**

1. **почта** _(noun, en)_
   - Der kom post i dag.
   - Сегодня пришла почта.

_verdict:_ `post`

### 87. udgøre

- stratum: **head** · batch: batch-0016.json · rank 755
- facts: pos `verb` · gender `null` · IPA `[-ˌgɶˀʌ]`
- pronunciation: **гё́эа**

1. **составлять** _(verb)_
   - Børn udgør halvdelen af gruppen.
   - Дети составляют половину группы.

_verdict:_ `udgøre`

### 88. verdenskrig

- stratum: **general** · batch: batch-0026.json · rank 1270
- facts: pos `noun` · gender `en` · definite `verdenskrigen` · IPA `[ˈvæɐ̯d̥ənsˌkʰʁiːˀ]`
- pronunciation: **вэ́адэнскри**

1. **мировая война** _(noun, en)_
   - Bogen handler om en verdenskrig.
   - Книга рассказывает о мировой войне.

_verdict:_ `verdenskrig`

### 89. beskæftige

- stratum: **general** · batch: batch-0027.json · rank 1319
- facts: pos `verb` · gender `null` · IPA `[beˈsgεfˌdiˀə]`
- pronunciation: **бэсгэ́фди́э**

1. **занимать, заниматься** _(verb)_
   - Jeg vil beskæftige mig med økonomi.
   - Я хочу заниматься экономикой.

_verdict:_ `beskæftige`

### 90. ordre

- stratum: **general** · batch: batch-0038.json · rank 1897
- facts: pos `noun` · gender `en` · definite `ordren` · IPA `[ˈɒˀdʁʌ]`
- pronunciation: **о́дро**

1. **заказ, приказ** _(noun, en)_
   - Vi har modtaget en stor ordre.
   - Мы получили большой заказ.

_verdict:_ `ordre`

### 91. bund

- stratum: **general** · batch: batch-0021.json · rank 1035
- facts: pos `noun` · gender `en` · definite `bunden` · IPA `[ˈbɔnˀ]`
- pronunciation: **бон**

1. **дно, низ** _(noun, en)_
   - Nøglen ligger på bunden af tasken.
   - Ключ лежит на дне сумки.

_verdict:_ `bund`

### 92. kommentere

- stratum: **general** · batch: batch-0035.json · rank 1726
- facts: pos `verb` · gender `null` · IPA `[kɔmənˈteˀʌ]`
- pronunciation: **комэнтэ́эа**

1. **комментировать** _(verb)_
   - Jeg vil ikke kommentere sagen.
   - Я не хочу комментировать дело.

_verdict:_ `kommentere`

### 93. arrangør

- stratum: **general** · batch: batch-0044.json · rank 2173
- facts: pos `noun` · gender `en` · definite `arrangøren` · IPA `[ɑɑŋˈɕøˀɐ̯]`
- pronunciation: **аангшё́а**

1. **организатор** _(noun, en)_
   - Hun er arrangør af festivalen.
   - Она организатор фестиваля.

_verdict:_ `arrangør`

### 94. tværs

- stratum: **general** · batch: batch-0031.json · rank 1503
- facts: pos `adverb` · gender `null` · IPA `[ˈtvæɐ̯s]`
- pronunciation: **твэас**

1. **поперёк** _(adverb)_
   - Vejen går på tværs.
   - Дорога идёт поперёк.

_verdict:_ `tværs`

### 95. dukke

- stratum: **general** · batch: batch-0022.json · rank 1096
- facts: pos `verb` · gender `null` · IPA `[ˈdɔgə]`
- pronunciation: **до́гэ**

1. **появляться** _(verb)_
   - Han kan dukke op senere.
   - Он может появиться позже.

_verdict:_ `dukke`

### 96. hår

- stratum: **general** · batch: batch-0030.json · rank 1487
- facts: pos `noun` · gender `et` · definite `håret` · IPA `[ˈhɒˀ]`
- pronunciation: **хо**

1. **волосы** _(noun, et)_
   - Hun har langt hår.
   - У неё длинные волосы.

_verdict:_ `hår`

### 97. tusindvis

- stratum: **general** · batch: batch-0045.json · rank 2242
- facts: pos `adverb` · gender `null` · IPA `[ˈtuˀsənˌviˀs]`
- pronunciation: **ту́сэнви́с**

1. **тысячами** _(adverb)_
   - Folk kom tusindvis.
   - Люди пришли тысячами.

_verdict:_ `tusindvis`

### 98. ligeglad

- stratum: **general** · batch: batch-0054.json · rank 2678
- facts: pos `adjective` · gender `null` · IPA `[ˈliːəˌglað]`
- pronunciation: **ли́эгла́з**

1. **безразличный, равнодушный** _(adjective)_
   - Han er helt ligeglad med resultatet.
   - Ему совершенно безразличен результат.

_verdict:_ `ligeglad`

### 99. nyhed

- stratum: **general** · batch: batch-0022.json · rank 1075
- facts: pos `noun` · gender `en` · definite `nyheden` · IPA `[ˈnyˌheðˀ]`
- pronunciation: **ню́хэд**

1. **новость** _(noun, en)_
   - Jeg har en god nyhed.
   - У меня хорошая новость.

_verdict:_ `nyhed`

### 100. utilfreds

- stratum: **general** · batch: batch-0050.json · rank 2483
- facts: pos `adjective` · gender `null` · IPA `[ˈuteˌfʁεs]`
- pronunciation: **у́тэфрэ́с**

1. **недовольный** _(adjective)_
   - Jeg er utilfreds med servicen.
   - Я недоволен обслуживанием.

_verdict:_ `utilfreds`

### 101. strategi

- stratum: **general** · batch: batch-0024.json · rank 1197
- facts: pos `noun` · gender `en` · definite `strategien` · IPA `[sdʁɑdəˈgiˀ]`
- pronunciation: **сдрадэги́**

1. **стратегия** _(noun, en)_
   - Vi har en ny strategi.
   - У нас новая стратегия.

_verdict:_ `strategi`

### 102. villa

- stratum: **general** · batch: batch-0048.json · rank 2388
- facts: pos `noun` · gender `en` · definite `villaen` · IPA `[ˈvila]`
- pronunciation: **ви́ла**

1. **вилла, частный дом** _(noun, en)_
   - De bor i en stor villa.
   - Они живут в большом частном доме.

_verdict:_ `villa`

### 103. hollandsk

- stratum: **general** · batch: batch-0036.json · rank 1766
- facts: pos `adjective` · gender `null` · IPA `[ˈhʌˌlanˀsg]`
- pronunciation: **хо́ланск**

1. **голландский** _(adjective)_
   - Det er en hollandsk ost.
   - Это голландский сыр.

_verdict:_ `hollandsk`

### 104. stue

- stratum: **general** · batch: batch-0039.json · rank 1909
- facts: pos `noun` · gender `en` · definite `stuen` · IPA `[ˈsduːə]`
- pronunciation: **сду́уэ**

1. **гостиная** _(noun, en)_
   - Vi sidder i stuen.
   - Мы сидим в гостиной.

_verdict:_ `stue`

### 105. tilværelse

- stratum: **general** · batch: batch-0032.json · rank 1580
- facts: pos `noun` · gender `en` · definite `tilværelsen` · IPA `[ˈtelˌvεˀʌlsə]`
- pronunciation: **тэ́лвэ́элсэ**

1. **существование, жизнь** _(noun, en)_
   - Han har en rolig tilværelse.
   - У него спокойная жизнь.

_verdict:_ `tilværelse`

### 106. palæstinenser

- stratum: **general** · batch: batch-0050.json · rank 2480
- facts: pos `noun` · gender `en` · definite `palæstinenseren` · IPA `[paləsdiˈnεnˀsʌ]`
- pronunciation: **палэстинэ́нсо**

1. **палестинец, палестинка** _(noun, en)_
   - Han er palæstinenser.
   - Он палестинец.

_verdict:_ `palæstinenser`

### 107. påstå

- stratum: **general** · batch: batch-0034.json · rank 1695
- facts: pos `verb` · gender `null` · IPA `[ˈpʌˌsdɔˀ]`
- pronunciation: **по́сдо**

1. **утверждать** _(verb)_
   - Han vil påstå, at det er sandt.
   - Он будет утверждать, что это правда.

_verdict:_ `påstå`

### 108. radio

- stratum: **general** · batch: batch-0032.json · rank 1579
- facts: pos `noun` · gender `en` · definite `radioen` · IPA `[ˈʁɑˀdjo]`
- pronunciation: **ра́дьо**

1. **радио** _(noun, en)_
   - Jeg hører nyheder i radioen.
   - Я слушаю новости по радио.

_verdict:_ `radio`

### 109. henblik

- stratum: **general** · batch: batch-0050.json · rank 2488
- facts: pos `noun` · gender `et` · IPA `[ˈhεnˌbleg]`
- pronunciation: **хэ́нблэг**

1. **цель, намерение** _(noun, et)_
   - Det sker med henblik på at spare penge.
   - Это делается с целью сэкономить деньги.

_verdict:_ `henblik`

### 110. forudse

- stratum: **general** · batch: batch-0045.json · rank 2250
- facts: pos `verb` · gender `null` · IPA `[ˈfɒuðˌseˀ]`
- pronunciation: **фо́удсэ**

1. **предвидеть** _(verb)_
   - Ingen kunne forudse problemet.
   - Никто не мог предвидеть проблему.

_verdict:_ `forudse`

### 111. kandidat

- stratum: **general** · batch: batch-0021.json · rank 1025
- facts: pos `noun` · gender `en` · definite `kandidaten` · IPA `[kandiˈdæˀd]`
- pronunciation: **кандидэ́д**

1. **кандидат** _(noun, en)_
   - Hun er kandidat til jobbet.
   - Она кандидат на эту работу.

_verdict:_ `kandidat`

### 112. forpligtelse

- stratum: **general** · batch: batch-0052.json · rank 2590
- facts: pos `noun` · gender `en` · IPA `[fʌˈplegdəlsə]`
- pronunciation: **фаплэ́гдэльсэ**

1. **обязательство, обязанность** _(noun, en)_
   - Det er min forpligtelse at hjælpe familien.
   - Это моя обязанность — помогать семье.

_verdict:_ `forpligtelse`

### 113. repræsentant

- stratum: **general** · batch: batch-0028.json · rank 1362
- facts: pos `noun` · gender `en` · definite `repræsentanten` · IPA `[ʁεpʁεsənˈtanˀd]`
- pronunciation: **рэпрэсэнта́нт**

1. **представитель** _(noun, en)_
   - Hun er repræsentant for firmaet.
   - Она представитель компании.

_verdict:_ `repræsentant`

### 114. antyde

- stratum: **general** · batch: batch-0048.json · rank 2382
- facts: pos `verb` · gender `null` · IPA `[-ˌtyðˀə]`
- pronunciation: **тю́дэ**

1. **намекать** _(verb)_
   - Hun vil antyde, at noget er galt.
   - Она намекнёт, что что-то не так.

_verdict:_ `antyde`

### 115. aktionær

- stratum: **general** · batch: batch-0043.json · rank 2113
- facts: pos `noun` · gender `en` · definite `aktionæren` · IPA `[ɑgɕoˈnεˀɐ̯]`
- pronunciation: **акшонэ́а**

1. **акционер** _(noun, en)_
   - Han er aktionær i firmaet.
   - Он акционер компании.

_verdict:_ `aktionær`

### 116. ansvarlig

- stratum: **general** · batch: batch-0028.json · rank 1376
- facts: pos `adjective` · gender `null` · IPA `[anˈsvɑˀli]`
- pronunciation: **ансва́ли**

1. **ответственный** _(adjective)_
   - Hun er ansvarlig for projektet.
   - Она отвечает за проект.

_verdict:_ `ansvarlig`

### 117. passager

- stratum: **general** · batch: batch-0034.json · rank 1665
- facts: pos `noun` · gender `en` · definite `passageren` · IPA `[pasaˈɕeˀɐ̯]`
- pronunciation: **пасашэ́а**

1. **пассажир** _(noun, en)_
   - Hver passager skal have en billet.
   - У каждого пассажира должен быть билет.

_verdict:_ `passager`

### 118. strategisk

- stratum: **general** · batch: batch-0045.json · rank 2246
- facts: pos `adjective` · gender `null` · IPA `[sdʁɑˈteˀgisg]`
- pronunciation: **сдратэ́гиск**

1. **стратегический** _(adjective)_
   - Det er en strategisk beslutning.
   - Это стратегическое решение.

_verdict:_ `strategisk`

### 119. jødisk

- stratum: **general** · batch: batch-0039.json · rank 1944
- facts: pos `adjective` · gender `null` · IPA `[ˈjøːðisg]`
- pronunciation: **йё́одиск**

1. **еврейский** _(adjective)_
   - Det er en jødisk tradition.
   - Это еврейская традиция.

_verdict:_ `jødisk`

### 120. irakisk

- stratum: **general** · batch: batch-0049.json · rank 2450
- facts: pos `adjective` · gender `null` · IPA `[iˈʁɑkisg]`
- pronunciation: **ира́киск**

1. **иракский** _(adjective)_
   - Det er en irakisk ret.
   - Это иракское блюдо.

_verdict:_ `irakisk`

### 121. udgivelse

- stratum: **general** · batch: batch-0042.json · rank 2052
- facts: pos `noun` · gender `en` · definite `udgivelsen` · IPA `[ˈuðˌgiˀwəlsə]`
- pronunciation: **у́дги́вэлсэ**

1. **издание, выпуск** _(noun, en)_
   - Bogen er en ny udgivelse.
   - Книга — новое издание.

_verdict:_ `udgivelse`

### 122. fjende

- stratum: **general** · batch: batch-0039.json · rank 1949
- facts: pos `noun` · gender `en` · definite `fjenden` · IPA `[ˈfjenə]`
- pronunciation: **фьэ́нэ**

1. **враг** _(noun, en)_
   - Han ser ham som en fjende.
   - Он считает его врагом.

_verdict:_ `fjende`

### 123. mistænke

- stratum: **general** · batch: batch-0046.json · rank 2281
- facts: pos `verb` · gender `null` · IPA `[ˈmisˌtεŋˀgə]`
- pronunciation: **мэ́стэ́нгэ**

1. **подозревать** _(verb)_
   - Politiet mistænker ham, men vil først mistænke nogen med bevis.
   - Полиция подозревает его, но будет подозревать кого-либо только при наличии доказательств.

_verdict:_ `mistænke`

### 124. landskab

- stratum: **general** · batch: batch-0036.json · rank 1773
- facts: pos `noun` · gender `et` · definite `landskabet` · IPA `[ˈlanˌsgæˀb]`
- pronunciation: **ла́нсгэб**

1. **ландшафт** _(noun, et)_
   - Det er et smukt landskab.
   - Это красивый пейзаж.

_verdict:_ `landskab`

### 125. klæde

- stratum: **general** · batch: batch-0043.json · rank 2125
- facts: pos `verb` · gender `null` · IPA `[ˈklεˀ]`
- pronunciation: **клэ**

1. **одевать, идти к лицу** _(verb)_
   - Den farve klæder dig.
   - Этот цвет тебе идёт.

_verdict:_ `klæde`

### 126. vægt

- stratum: **general** · batch: batch-0024.json · rank 1195
- facts: pos `noun` · gender `en` · definite `vægten` · IPA `[ˈvεgd]`
- pronunciation: **вэгд**

1. **вес** _(noun, en)_
   - Kassen har en høj vægt.
   - Коробка много весит.

_verdict:_ `vægt`

### 127. børnehave

- stratum: **general** · batch: batch-0035.json · rank 1728
- facts: pos `noun` · gender `en` · definite `børnehaven` · IPA `/bœɐ̯nəhæːʊ̯ə/`
- pronunciation: **бёанэхэ́ауэ**

1. **детский сад** _(noun, en)_
   - Barnet går i børnehave.
   - Ребёнок ходит в детский сад.

_verdict:_ `børnehave`

### 128. resultere

- stratum: **general** · batch: batch-0041.json · rank 2021
- facts: pos `verb` · gender `null` · IPA `[ʁεsulˈteˀʌ]`
- pronunciation: **рэсултэ́эа**

1. **приводить к результату** _(verb)_
   - Fejlen kan resultere i et tab.
   - Ошибка может привести к убытку.

_verdict:_ `resultere`

### 129. regn

- stratum: **general** · batch: batch-0050.json · rank 2485
- facts: pos `noun` · gender `en` · definite `regnen` · IPA `[ˈʁɑjˀn]`
- pronunciation: **райн**

1. **дождь** _(noun, en)_
   - Der kommer regn i morgen.
   - Завтра будет дождь.

_verdict:_ `regn`

### 130. respektere

- stratum: **general** · batch: batch-0042.json · rank 2096
- facts: pos `verb` · gender `null` · IPA `[ʁεsbεgˈteˀʌ]`
- pronunciation: **рэспэгтэ́эа**

1. **уважать** _(verb)_
   - Vi skal respektere hinanden.
   - Мы должны уважать друг друга.

_verdict:_ `respektere`

### 131. maleri

- stratum: **general** · batch: batch-0028.json · rank 1357
- facts: pos `noun` · gender `et` · definite `maleriet` · IPA `[ˌmæːlʌˈʁiˀ]`
- pronunciation: **мэ́элори́**

1. **картина** _(noun, et)_
   - Museet har et berømt maleri.
   - В музее есть знаменитая картина.

_verdict:_ `maleri`

### 132. begrave

- stratum: **general** · batch: batch-0051.json · rank 2513
- facts: pos `verb` · gender `null` · IPA `[beˈgʁɑˀvə]`
- pronunciation: **бэгра́вэ**

1. **хоронить** _(verb)_
   - De skal begrave hunden i haven.
   - Они похоронят собаку в саду.

_verdict:_ `begrave`

### 133. bud

- stratum: **general** · batch: batch-0023.json · rank 1121
- facts: pos `noun` · gender `et` · definite `buddet` · IPA `[ˈbuð]`
- pronunciation: **буд**

1. **предложение цены** _(noun, et)_
   - Vi har fået et bud på huset.
   - Мы получили предложение цены за дом.

_verdict:_ `bud`

### 134. undervejs

- stratum: **general** · batch: batch-0024.json · rank 1186
- facts: pos `adverb` · gender `null` · IPA `[ɔnʌˈvɑjˀs]`
- pronunciation: **оновайс**

1. **по пути** _(adverb)_
   - Vi spiser noget undervejs.
   - Мы что-нибудь поедим по пути.

_verdict:_ `undervejs`

### 135. barnebarn

- stratum: **general** · batch: batch-0041.json · rank 2024
- facts: pos `noun` · gender `et` · definite `barnebarnet` · IPA `[ˈbɑːnəˌbɑˀn]`
- pronunciation: **ба́анэба́н**

1. **внук, внучка** _(noun, et)_
   - Hun har et barnebarn.
   - У неё есть внук.

_verdict:_ `barnebarn`

### 136. frue

- stratum: **general** · batch: batch-0035.json · rank 1706
- facts: pos `noun` · gender `en` · definite `fruen` · IPA `[ˈfʁuːə]`
- pronunciation: **фру́уэ**

1. **госпожа, дама** _(noun, en)_
   - En ældre frue venter udenfor.
   - Пожилая дама ждёт снаружи.

_verdict:_ `frue`

### 137. heraf

- stratum: **general** · batch: batch-0037.json · rank 1804
- facts: pos `adverb` · gender `null` · IPA `[ˈhεˀɐ̯ˈæˀ]`
- pronunciation: **хэ́аэ́**

1. **из этого, отсюда** _(adverb)_
   - Der er ti elever, heraf tre nye.
   - Есть десять учеников, из них трое новых.

_verdict:_ `heraf`

### 138. gylden

- stratum: **general** · batch: batch-0048.json · rank 2353
- facts: pos `adjective` · gender `null` · IPA `[ˈgylˀən]`
- pronunciation: **гю́лэн**

1. **золотой** _(adjective)_
   - Hun har en gylden ring.
   - У неё золотое кольцо.

_verdict:_ `gylden`

### 139. motorvej

- stratum: **general** · batch: batch-0038.json · rank 1868
- facts: pos `noun` · gender `en` · definite `motorvejen` · IPA `[ˈmoːtʌˌvɑjˀ]`
- pronunciation: **мо́отовай**

1. **автомагистраль** _(noun, en)_
   - Vi kører på motorvejen.
   - Мы едем по автомагистрали.

_verdict:_ `motorvej`

### 140. strække

- stratum: **general** · batch: batch-0045.json · rank 2207
- facts: pos `verb` · gender `null` · IPA `[ˈsdʁagə]`
- pronunciation: **сдра́гэ**

1. **растягивать, простираться** _(verb)_
   - Jeg skal strække benene.
   - Мне нужно размять ноги.

_verdict:_ `strække`

### 141. hest

- stratum: **general** · batch: batch-0026.json · rank 1285
- facts: pos `noun` · gender `en` · definite `hesten` · IPA `[ˈhεsd]`
- pronunciation: **хэст**

1. **лошадь** _(noun, en)_
   - Hun rider på en hest.
   - Она едет верхом на лошади.

_verdict:_ `hest`

### 142. net

- stratum: **general** · batch: batch-0022.json · rank 1100
- facts: pos `noun` · gender `et` · definite `nettet` · IPA `[ˈnεd]`
- pronunciation: **нэд**

1. **сеть** _(noun, et)_
   - Telefonen er ikke på nettet.
   - Телефон не подключён к сети.

_verdict:_ `net`

### 143. omegn

- stratum: **general** · batch: batch-0053.json · rank 2622
- facts: pos `noun` · gender `en` · definite `omegnen` · IPA `[ˈʌmˌɑjˀn]`
- pronunciation: **о́майн**

1. **окрестности, пригород** _(noun, en)_
   - Han bor i byen og dens omegn.
   - Он живёт в городе и его окрестностях.

_verdict:_ `omegn`

### 144. faktum

- stratum: **general** · batch: batch-0031.json · rank 1525
- facts: pos `noun` · gender `et` · definite `faktummet` · IPA `[ˈfɑgtɔm]`
- pronunciation: **фа́гтом**

1. **факт** _(noun, et)_
   - Det er et vigtigt faktum.
   - Это важный факт.

_verdict:_ `faktum`

### 145. barndom

- stratum: **general** · batch: batch-0042.json · rank 2086
- facts: pos `noun` · gender `en` · definite `barndommen` · IPA `[ˈbɑːnˌdʌmˀ]`
- pronunciation: **ба́андом**

1. **детство** _(noun, en)_
   - Hun tænker på sin barndom.
   - Она думает о своём детстве.

_verdict:_ `barndom`

### 146. afbryde

- stratum: **general** · batch: batch-0049.json · rank 2441
- facts: pos `verb` · gender `null` · IPA `[-ˌbʁyˀðə]`
- pronunciation: **брю́дэ**

1. **прерывать** _(verb)_
   - Jeg vil ikke afbryde dig.
   - Я не хочу тебя перебивать.

_verdict:_ `afbryde`

### 147. gennembrud

- stratum: **general** · batch: batch-0049.json · rank 2412
- facts: pos `noun` · gender `et` · definite `gennembruddet` · IPA `[-ˌbʁuð]`
- pronunciation: **бруд**

1. **прорыв** _(noun, et)_
   - Det var et vigtigt gennembrud.
   - Это был важный прорыв.

_verdict:_ `gennembrud`

### 148. foreløbig

- stratum: **general** · batch: batch-0021.json · rank 1018
- facts: pos `adjective` · gender `null` · IPA `[ˈfɒːɒˌløˀbi]`
- pronunciation: **фо́оолё́би**

1. **предварительный** _(adjective)_
   - Det er en foreløbig plan.
   - Это предварительный план.

_verdict:_ `foreløbig`

### 149. landsby

- stratum: **general** · batch: batch-0027.json · rank 1311
- facts: pos `noun` · gender `en` · definite `landsbyen` · IPA `[ˈlanˀsˌbyˀ]`
- pronunciation: **ла́нсбю**

1. **деревня** _(noun, en)_
   - De bor i en lille landsby.
   - Они живут в маленькой деревне.

_verdict:_ `landsby`

### 150. kop

- stratum: **general** · batch: batch-0054.json · rank 2660
- facts: pos `noun` · gender `en` · definite `koppen` · IPA `[ˈkʌb]`
- pronunciation: **коб**

1. **чашка** _(noun, en)_
   - Jeg drikker kaffe af en kop.
   - Я пью кофе из чашки.

_verdict:_ `kop`

### 151. betaling

- stratum: **general** · batch: batch-0044.json · rank 2165
- facts: pos `noun` · gender `en` · definite `betalingen` · IPA `[beˈtæˀleŋ]`
- pronunciation: **бэтэ́линг**

1. **оплата** _(noun, en)_
   - Vi har modtaget din betaling.
   - Мы получили твою оплату.

_verdict:_ `betaling`

### 152. lovgivning

- stratum: **general** · batch: batch-0029.json · rank 1418
- facts: pos `noun` · gender `en` · definite `lovgivningen` · IPA `[ˈlɒwˌgiwˀneŋ]`
- pronunciation: **ло́угивнинг**

1. **законодательство** _(noun, en)_
   - Virksomheden følger gældende lovgivning.
   - Компания соблюдает действующее законодательство.

_verdict:_ `lovgivning`

### 153. fri

- stratum: **general** · batch: batch-0007.json · rank 334
- facts: pos `adjective` · gender `null` · IPA `[ˈfʁiˀ]`
- pronunciation: **фри**

1. **свободный** _(adjective)_
   - Jeg er fri i morgen.
   - Я свободен завтра.

_verdict:_ `fri`

### 154. fore

- stratum: **general** · batch: batch-0031.json · rank 1549
- facts: pos `verb` · gender `null` · IPA `[ˈfoːʌ]`
- pronunciation: **фо́оа**

1. **снабжать подкладкой** _(verb)_
   - Hun vil fore jakken.
   - Она хочет пришить подкладку к куртке.

_verdict:_ `fore`

### 155. kunde

- stratum: **general** · batch: batch-0009.json · rank 403
- facts: pos `noun` · gender `en` · definite `kunden` · IPA `[ˈkɔnə]`
- pronunciation: **ко́нэ**

1. **клиент, покупатель** _(noun, en)_
   - Der venter en kunde ved kassen.
   - У кассы ждёт клиент.

_verdict:_ `kunde`

### 156. glimrende

- stratum: **general** · batch: batch-0049.json · rank 2422
- facts: pos `adjective` · gender `null` · IPA `[ˈglemʁʌnə]`
- pronunciation: **глэ́мронэ**

1. **отличный** _(adjective)_
   - Det er en glimrende idé.
   - Это отличная идея.

_verdict:_ `glimrende`

### 157. øje

- stratum: **general** · batch: batch-0008.json · rank 361
- facts: pos `noun` · gender `et` · definite `øjet` · IPA `[ˈʌjə]`
- pronunciation: **о́йэ**

1. **глаз** _(noun, et)_
   - Jeg har noget i mit øje.
   - У меня что-то в глазу.

_verdict:_ `øje`

### 158. straks

- stratum: **general** · batch: batch-0024.json · rank 1170
- facts: pos `adverb` · gender `null` · IPA `[ˈsdʁɑgs]`
- pronunciation: **сдрагс**

1. **сразу, немедленно** _(adverb)_
   - Kom hjem straks.
   - Иди домой немедленно.

_verdict:_ `straks`

### 159. sund

- stratum: **general** · batch: batch-0023.json · rank 1116
- facts: pos `adjective` · gender `null` · IPA `[ˈsɔnˀ]`
- pronunciation: **сон**

1. **здоровый** _(adjective)_
   - Det er sund mad.
   - Это здоровая еда.

_verdict:_ `sund`

### 160. starte

- stratum: **general** · batch: batch-0009.json · rank 408
- facts: pos `verb` · gender `null` · IPA `[ˈsdɑːdə]`
- pronunciation: **сдэ́адэ**

1. **начинать** _(verb)_
   - Vi skal starte klokken ni.
   - Мы должны начать в девять.

_verdict:_ `starte`

### 161. sko

- stratum: **general** · batch: batch-0043.json · rank 2111
- facts: pos `noun` · gender `en` · definite `skoen` · IPA `[ˈsgoˀ]`
- pronunciation: **сго**

1. **туфля, обувь** _(noun, en)_
   - Jeg køber en ny sko.
   - Я покупаю новую туфлю.

_verdict:_ `sko`

### 162. officiel

- stratum: **general** · batch: batch-0018.json · rank 862
- facts: pos `adjective` · gender `null` · IPA `[ʌfiˈɕεlˀ]`
- pronunciation: **офи́шэл**

1. **официальный** _(adjective)_
   - Det er den officielle hjemmeside.
   - Это официальный сайт.

_verdict:_ `officiel`

### 163. synes

- stratum: **general** · batch: batch-0034.json · rank 1657
- facts: pos `verb` · gender `null` · IPA `[ˈsynəs]`
- pronunciation: **сю́нес**

1. **считать, полагать** _(verb)_
   - Jeg synes, filmen er god.
   - Я считаю, что фильм хороший.

_verdict:_ `synes`

### 164. gennemsnitlig

- stratum: **general** · batch: batch-0044.json · rank 2195
- facts: pos `adjective` · gender `null` · IPA `[ˈgεnəmˌsnidli]`
- pronunciation: **гэ́нэмснидли**

1. **средний** _(adjective)_
   - Det er en gennemsnitlig pris.
   - Это средняя цена.

_verdict:_ `gennemsnitlig`

### 165. indrette

- stratum: **general** · batch: batch-0031.json · rank 1512
- facts: pos `verb` · gender `null` · IPA `[ˈenˌʁadə]`
- pronunciation: **э́нра́дэ**

1. **обустраивать** _(verb)_
   - Vi skal indrette den nye lejlighed.
   - Мы должны обустроить новую квартиру.

_verdict:_ `indrette`

### 166. dokument

- stratum: **general** · batch: batch-0042.json · rank 2073
- facts: pos `noun` · gender `et` · definite `dokumentet` · IPA `[doguˈmεnˀd]`
- pronunciation: **догумэ́нт**

1. **документ** _(noun, et)_
   - Jeg skal underskrive et dokument.
   - Мне нужно подписать документ.

_verdict:_ `dokument`

### 167. tak

- stratum: **general** · batch: batch-0023.json · rank 1127
- facts: pos `noun` · gender `en` · definite `takken` · IPA `[ˈtɑg]`
- pronunciation: **таг**

1. **благодарность** _(noun, en)_
   - En stor tak til alle.
   - Большое спасибо всем.

_verdict:_ `tak`

### 168. papir

- stratum: **general** · batch: batch-0025.json · rank 1237
- facts: pos `noun` · gender `et` · definite `papiret` · IPA `[paˈpiɐ̯ˀ]`
- pronunciation: **папи́а**

1. **бумага** _(noun, et)_
   - Skriv det på et papir.
   - Напиши это на бумаге.

_verdict:_ `papir`

### 169. forleden

- stratum: **general** · batch: batch-0029.json · rank 1421
- facts: pos `adjective` · gender `null` · IPA `[fʌˈleðˀən]`
- pronunciation: **фолэ́дэн**

1. **недавний** _(adjective)_
   - Jeg så ham forleden dag.
   - Я видел его на днях.

_verdict:_ `forleden`

### 170. adskille

- stratum: **general** · batch: batch-0040.json · rank 2000
- facts: pos `verb` · gender `null` · IPA `[ˈaðˌsgelˀə]`
- pronunciation: **а́дсгэ́лэ**

1. **разделять, отличать** _(verb)_
   - Farven kan adskille de to modeller.
   - Цвет может отличать две модели.

_verdict:_ `adskille`

### 171. ungdom

- stratum: **general** · batch: batch-0038.json · rank 1857
- facts: pos `noun` · gender `en` · definite `ungdommen` · IPA `[ˈɔŋˌdʌmˀ]`
- pronunciation: **о́нгдом**

1. **молодёжь, юность** _(noun, en)_
   - Han tænker ofte på sin ungdom.
   - Он часто думает о своей юности.

_verdict:_ `ungdom`

### 172. professor

- stratum: **general** · batch: batch-0011.json · rank 532
- facts: pos `noun` · gender `en` · definite `professoren` · IPA `[pʁoˈfεsʌ]`
- pronunciation: **профэ́со**

1. **профессор** _(noun, en)_
   - Hun arbejder som professor.
   - Она работает профессором.

_verdict:_ `professor`

### 173. musikalsk

- stratum: **general** · batch: batch-0034.json · rank 1687
- facts: pos `adjective` · gender `null` · IPA `[musiˈkæˀlsg]`
- pronunciation: **мусикэ́лск**

1. **музыкальный** _(adjective)_
   - Hun har et musikalsk talent.
   - У неё музыкальный талант.

_verdict:_ `musikalsk`

### 174. demokrati

- stratum: **general** · batch: batch-0018.json · rank 893
- facts: pos `noun` · gender `et` · definite `demokratiet` · IPA `[demokʁɑˈtiˀ]`
- pronunciation: **дэмократи́**

1. **демократия** _(noun, et)_
   - Danmark er et demokrati.
   - Дания — демократия.

_verdict:_ `demokrati`

### 175. univers

- stratum: **general** · batch: batch-0040.json · rank 1960
- facts: pos `noun` · gender `et` · definite `universet` · IPA `[uniˈvæɐ̯s]`
- pronunciation: **унивэ́ас**

1. **вселенная** _(noun, et)_
   - Bogen beskriver et andet univers.
   - Книга описывает другую вселенную.

_verdict:_ `univers`

### 176. længere

- stratum: **general** · batch: batch-0010.json · rank 493
- facts: pos `adverb` · gender `null` · IPA `[ˈlεŋʌʌ]`
- pronunciation: **лэ́нгоа**

1. **дольше, больше не** _(adverb)_
   - Jeg kan ikke vente længere.
   - Я больше не могу ждать.

_verdict:_ `længere`

### 177. anledning

- stratum: **general** · batch: batch-0023.json · rank 1136
- facts: pos `noun` · gender `en` · definite `anledningen` · IPA `[-ˌleðˀneŋ]`
- pronunciation: **лэ́днинг**

1. **повод** _(noun, en)_
   - Vi fejrer dagen ved denne anledning.
   - Мы отмечаем день по этому поводу.

_verdict:_ `anledning`

### 178. spørgsmål

- stratum: **general** · batch: batch-0005.json · rank 233
- facts: pos `noun` · gender `et` · definite `spørgsmålet` · IPA `[ˈsbɶɐ̯sˌmɔˀl]`
- pronunciation: **сбё́асмо́л**

1. **вопрос** _(noun, et)_
   - Jeg har et spørgsmål.
   - У меня есть вопрос.

_verdict:_ `spørgsmål`

### 179. mur

- stratum: **general** · batch: batch-0035.json · rank 1746
- facts: pos `noun` · gender `en` · definite `muren` · IPA `[ˈmuɐ̯ˀ]`
- pronunciation: **муа**

1. **стена** _(noun, en)_
   - Der står en høj mur rundt om haven.
   - Вокруг сада стоит высокая стена.

_verdict:_ `mur`

### 180. turnering

- stratum: **general** · batch: batch-0023.json · rank 1118
- facts: pos `noun` · gender `en` · definite `turneringen` · IPA `[tuɐ̯ˈneˀɐ̯eŋ]`
- pronunciation: **туанэ́эринг**

1. **турнир** _(noun, en)_
   - Holdet deltager i en turnering.
   - Команда участвует в турнире.

_verdict:_ `turnering`

### 181. omsætning

- stratum: **general** · batch: batch-0023.json · rank 1135
- facts: pos `noun` · gender `en` · definite `omsætningen` · IPA `[ˈʌmˌsεdneŋ]`
- pronunciation: **о́мсэднинг**

1. **оборот, выручка** _(noun, en)_
   - Butikken har høj omsætning.
   - У магазина высокий оборот.

_verdict:_ `omsætning`

### 182. hen

- stratum: **general** · batch: batch-0009.json · rank 413
- facts: pos `adverb` · gender `null` · IPA `[ˈhεn]`
- pronunciation: **хэн**

1. **туда, к** _(adverb)_
   - Gå hen til døren.
   - Подойди к двери.

_verdict:_ `hen`

### 183. fornøjelse

- stratum: **general** · batch: batch-0054.json · rank 2670
- facts: pos `noun` · gender `en` · definite `fornøjelsen` · IPA `[fʌˈnʌjˀəlsə]`
- pronunciation: **фано́йэльсэ**

1. **удовольствие** _(noun, en)_
   - Det var en stor fornøjelse at møde dig.
   - Было большим удовольствием встретить тебя.

_verdict:_ `fornøjelse`

### 184. gammel

- stratum: **general** · batch: batch-0003.json · rank 111
- facts: pos `adjective` · gender `null` · IPA `[ˈgɑməl]`
- pronunciation: **га́мэл**

1. **старый** _(adjective)_
   - Det er en gammel bil.
   - Это старая машина.

_verdict:_ `gammel`

### 185. kontakt

- stratum: **general** · batch: batch-0015.json · rank 715
- facts: pos `noun` · gender `en` · definite `kontakten` · IPA `[kɔnˈtɑgd]`
- pronunciation: **конта́гд**

1. **контакт, связь** _(noun, en)_
   - Jeg har kontakt med min familie.
   - Я поддерживаю связь со своей семьёй.

_verdict:_ `kontakt`

### 186. base

- stratum: **general** · batch: batch-0048.json · rank 2355
- facts: pos `noun` · gender `en` · definite `basen` · IPA `[ˈbæːsə]`
- pronunciation: **бэ́эсэ**

1. **база** _(noun, en)_
   - Holdet har en base i byen.
   - У команды есть база в городе.

_verdict:_ `base`

### 187. sandhed

- stratum: **general** · batch: batch-0027.json · rank 1306
- facts: pos `noun` · gender `en` · definite `sandheden` · IPA `[ˈsanˌheðˀ]`
- pronunciation: **са́нхэд**

1. **правда** _(noun, en)_
   - Jeg vil kende sandheden.
   - Я хочу знать правду.

_verdict:_ `sandhed`

### 188. udbytte

- stratum: **general** · batch: batch-0052.json · rank 2591
- facts: pos `noun` · gender `et` · definite `udbyttet` · IPA `[ˈuðˌbydə]`
- pronunciation: **у́быдэ**

1. **прибыль, доход** _(noun, et)_
   - Virksomheden fik et stort udbytte i år.
   - Компания получила большую прибыль в этом году.
2. **польза, выгода (от учёбы, работы)** _(noun, et)_
   - Jeg havde godt udbytte af kurset.
   - Я извлёк большую пользу из курса.

_verdict:_ `udbytte`

### 189. teknisk

- stratum: **general** · batch: batch-0018.json · rank 866
- facts: pos `adjective` · gender `null` · IPA `[ˈtεgnisg]`
- pronunciation: **тэ́гниск**

1. **технический** _(adjective)_
   - Vi har et teknisk problem.
   - У нас техническая проблема.

_verdict:_ `teknisk`

### 190. frihed

- stratum: **general** · batch: batch-0021.json · rank 1048
- facts: pos `noun` · gender `en` · definite `friheden` · IPA `[ˈfʁiˌheðˀ]`
- pronunciation: **фри́хэд**

1. **свобода** _(noun, en)_
   - Frihed er vigtig for mange.
   - Свобода важна для многих.

_verdict:_ `frihed`

### 191. ude

- stratum: **general** · batch: batch-0008.json · rank 352
- facts: pos `adverb` · gender `null` · IPA `[ˈuːðə]`
- pronunciation: **у́удэ**

1. **снаружи, на улице** _(adverb)_
   - Børnene leger ude.
   - Дети играют на улице.

_verdict:_ `ude`

### 192. efterlade

- stratum: **general** · batch: batch-0031.json · rank 1526
- facts: pos `verb` · gender `null` · IPA `[-ˌlæˀðə]`
- pronunciation: **лэ́дэ**

1. **оставлять после себя** _(verb)_
   - Du må ikke efterlade tasken her.
   - Не оставляй сумку здесь.

_verdict:_ `efterlade`

### 193. behandling

- stratum: **general** · batch: batch-0013.json · rank 604
- facts: pos `noun` · gender `en` · definite `behandlingen` · IPA `[beˈhanˀleŋ]`
- pronunciation: **бэха́нлинг**

1. **лечение, обработка** _(noun, en)_
   - Han får behandling på hospitalet.
   - Он получает лечение в больнице.

_verdict:_ `behandling`

### 194. skulptur

- stratum: **general** · batch: batch-0050.json · rank 2491
- facts: pos `noun` · gender `en` · definite `skulpturen` · IPA `[sgulbˈtuɐ̯ˀ]`
- pronunciation: **сгулбту́а**

1. **скульптура** _(noun, en)_
   - Museet har en stor skulptur.
   - В музее есть большая скульптура.

_verdict:_ `skulptur`

### 195. død

- stratum: **general** · batch: batch-0010.json · rank 497
- facts: pos `noun` · gender `en` · definite `døden` · IPA `[ˈdøðˀ]`
- pronunciation: **дёд**

1. **смерть** _(noun, en)_
   - Hans død kom pludseligt.
   - Его смерть наступила внезапно.

_verdict:_ `død`

### 196. rød

- stratum: **general** · batch: batch-0010.json · rank 467
- facts: pos `adjective` · gender `null` · IPA `[ˈʁœðˀ]`
- pronunciation: **рёд**

1. **красный** _(adjective)_
   - Hun har en rød kjole.
   - На ней красное платье.

_verdict:_ `rød`

### 197. telefon

- stratum: **general** · batch: batch-0014.json · rank 669
- facts: pos `noun` · gender `en` · definite `telefonen` · IPA `[teləˈfoˀn]`
- pronunciation: **тэлэфо́н**

1. **телефон** _(noun, en)_
   - Min telefon ligger på bordet.
   - Мой телефон лежит на столе.

_verdict:_ `telefon`

### 198. udarbejde

- stratum: **general** · batch: batch-0035.json · rank 1747
- facts: pos `verb` · gender `null` · IPA `[-ɑˌbɑjˀdə]`
- pronunciation: **абайдэ**

1. **разрабатывать, составлять** _(verb)_
   - Vi skal udarbejde en plan.
   - Мы должны разработать план.

_verdict:_ `udarbejde`

### 199. modsætning

- stratum: **general** · batch: batch-0025.json · rank 1238
- facts: pos `noun` · gender `en` · definite `modsætningen` · IPA `[ˈmoðˌsεdneŋ]`
- pronunciation: **мо́дсэднинг**

1. **противоположность** _(noun, en)_
   - Det er en klar modsætning.
   - Это явная противоположность.

_verdict:_ `modsætning`

### 200. udstille

- stratum: **general** · batch: batch-0034.json · rank 1693
- facts: pos `verb` · gender `null` · IPA `[ˈuðˌsdelˀə]`
- pronunciation: **у́дсдэ́лэ**

1. **выставлять** _(verb)_
   - Museet vil udstille maleriet.
   - Музей выставит картину.

_verdict:_ `udstille`

# Catalog audit sample

200 of 2940 accepted rows · seed `20260922` · drawn 2026-09-21T06:05:29.232Z

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

### 3. anklagemyndighed

- stratum: **no_ipa** · batch: batch-0059.json · rank 2916
- facts: pos `noun` · gender `en` · definite `anklagemyndigheden` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **прокуратура** _(noun, en)_
   - Anklagemyndigheden rejste tiltale.
   - Прокуратура предъявила обвинение.

_verdict:_ `anklagemyndighed`

### 4. afskaffe

- stratum: **no_ipa** · batch: batch-0045.json · rank 2216
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **отменять, упразднять** _(verb)_
   - De vil afskaffe skatten.
   - Они хотят отменить налог.

_verdict:_ `afskaffe`

### 5. udnævne

- stratum: **no_ipa** · batch: batch-0032.json · rank 1596
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **назначать на должность** _(verb)_
   - De vil udnævne en ny direktør.
   - Они хотят назначить нового директора.

_verdict:_ `udnævne`

### 6. nedtur

- stratum: **no_ipa** · batch: batch-0056.json · rank 2760
- facts: pos `noun` · gender `en` · definite `nedturen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **спад, разочарование** _(noun, en)_
   - Det var en stor nedtur for holdet.
   - Это было большим разочарованием для команды.
2. **спуск (вниз)** _(noun, en)_
   - Turen ned var en lang nedtur.
   - Путь вниз был долгим спуском.

_verdict:_ `nedtur`

### 7. folkekirke

- stratum: **no_ipa** · batch: batch-0051.json · rank 2518
- facts: pos `noun` · gender `en` · definite `folkekirken` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **народная церковь Дании** _(noun, en)_
   - Mange danskere er medlem af folkekirken.
   - Многие датчане являются членами народной церкви.

_verdict:_ `folkekirke`

### 8. hjemmehold

- stratum: **no_ipa** · batch: batch-0053.json · rank 2648
- facts: pos `noun` · gender `et` · definite `hjemmeholdet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **домашняя команда, хозяева поля** _(noun, et)_
   - Hjemmeholdet vandt kampen 2-0.
   - Домашняя команда выиграла матч со счётом два ноль.

_verdict:_ `hjemmehold`

### 9. folkeparti

- stratum: **no_ipa** · batch: batch-0015.json · rank 714
- facts: pos `noun` · gender `et` · definite `folkepartiet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **народная партия** _(noun, et)_
   - Han stemte på et folkeparti ved valget.
   - Он голосовал за народную партию на выборах.

_verdict:_ `folkeparti`

### 10. udgangspunkt

- stratum: **no_ipa** · batch: batch-0018.json · rank 879
- facts: pos `noun` · gender `et` · definite `udgangspunktet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **исходная точка** _(noun, et)_
   - Vi tager udgangspunkt i de gamle tal.
   - Мы берём за исходную точку старые цифры.

_verdict:_ `udgangspunkt`

### 11. plejehjem

- stratum: **no_ipa** · batch: batch-0043.json · rank 2110
- facts: pos `noun` · gender `et` · definite `plejehjemmet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **дом престарелых** _(noun, et)_
   - Min bedstefar bor på et plejehjem.
   - Мой дедушка живет в доме престарелых.

_verdict:_ `plejehjem`

### 12. understrege

- stratum: **no_ipa** · batch: batch-0012.json · rank 566
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **подчёркивать** _(verb)_
   - Jeg vil understrege dette punkt.
   - Я хочу подчеркнуть этот момент.

_verdict:_ `understrege`

### 13. skattelettelse

- stratum: **no_ipa** · batch: batch-0057.json · rank 2824
- facts: pos `noun` · gender `en` · definite `skattelettelsen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **снижение налогов, налоговая льгота** _(noun, en)_
   - Regeringen foreslår en skattelettelse.
   - Правительство предлагает снижение налогов.

_verdict:_ `skattelettelse`

### 14. ventetid

- stratum: **no_ipa** · batch: batch-0052.json · rank 2593
- facts: pos `noun` · gender `en` · definite `ventetiden` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **время ожидания** _(noun, en)_
   - Der er lang ventetid på hospitalet.
   - В больнице долгое время ожидания.

_verdict:_ `ventetid`

### 15. fortid

- stratum: **no_ipa** · batch: batch-0024.json · rank 1187
- facts: pos `noun` · gender `en` · definite `fortiden` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **прошлое** _(noun, en)_
   - Man kan ikke ændre sin fortid.
   - Нельзя изменить свое прошлое.

_verdict:_ `fortid`

### 16. bagside

- stratum: **no_ipa** · batch: batch-0060.json · rank 2962
- facts: pos `noun` · gender `en` · definite `bagsiden` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **обратная сторона, задняя часть** _(noun, en)_
   - Der står noget på bagsiden af papiret.
   - На обратной стороне бумаги что-то написано.

_verdict:_ `bagside`

### 17. tilbyde

- stratum: **no_ipa** · batch: batch-0014.json · rank 681
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **предлагать** _(verb)_
   - Han tilbød mig hjælp.
   - Он предложил мне помощь.

_verdict:_ `tilbyde`

### 18. hovedperson

- stratum: **no_ipa** · batch: batch-0039.json · rank 1908
- facts: pos `noun` · gender `en` · definite `hovedpersonen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **главный герой** _(noun, en)_
   - Hovedpersonen i bogen er en ung pige.
   - Главная героиня книги — молодая девушка.

_verdict:_ `hovedperson`

### 19. henvise

- stratum: **no_ipa** · batch: batch-0024.json · rank 1189
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **направлять, ссылаться** _(verb)_
   - Lægen vil henvise mig til en specialist.
   - Врач направит меня к специалисту.

_verdict:_ `henvise`

### 20. ægtepar

- stratum: **no_ipa** · batch: batch-0053.json · rank 2629
- facts: pos `noun` · gender `et` · definite `ægteparret` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **супружеская пара** _(noun, et)_
   - De er et lykkeligt ægtepar.
   - Они счастливая супружеская пара.

_verdict:_ `ægtepar`

### 21. sommerferie

- stratum: **no_ipa** · batch: batch-0041.json · rank 2033
- facts: pos `noun` · gender `en` · definite `sommerferien` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **летние каникулы** _(noun, en)_
   - Vi skal til Spanien i sommerferien.
   - Мы поедем в Испанию на летние каникулы.

_verdict:_ `sommerferie`

### 22. pressemøde

- stratum: **no_ipa** · batch: batch-0047.json · rank 2310
- facts: pos `noun` · gender `et` · definite `pressemødet` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **пресс-конференция** _(noun, et)_
   - Statsministeren indkaldte til pressemøde.
   - Премьер-министр созвал пресс-конференцию.

_verdict:_ `pressemøde`

### 23. infrastruktur

- stratum: **no_ipa** · batch: batch-0058.json · rank 2858
- facts: pos `noun` · gender `en` · definite `infrastrukturen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **инфраструктура** _(noun, en)_
   - Landet har en dårlig infrastruktur.
   - У страны плохая инфраструктура.

_verdict:_ `infrastruktur`

### 24. generalforsamling

- stratum: **no_ipa** · batch: batch-0036.json · rank 1751
- facts: pos `noun` · gender `en` · definite `generalforsamlingen` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **общее собрание** _(noun, en)_
   - Vi skal til generalforsamling i foreningen.
   - Мы идем на общее собрание ассоциации.

_verdict:_ `generalforsamling`

### 25. løslade

- stratum: **no_ipa** · batch: batch-0058.json · rank 2887
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **освободить (из заключения)** _(verb)_
   - Fangen blev løsladt i morges.
   - Заключенного освободили сегодня утром.

_verdict:_ `løslade`

### 26. medbringe

- stratum: **no_ipa** · batch: batch-0059.json · rank 2931
- facts: pos `verb` · gender `null` · IPA `null`
- pronunciation: **_(null)_** — correctly silent

1. **приносить, брать с собой** _(verb)_
   - Husk at medbringe din billet.
   - Не забудь взять с собой билет.

_verdict:_ `medbringe`

### 27. blive

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

### 28. bakke

- stratum: **three_senses** · batch: batch-0055.json · rank 2730
- facts: pos `noun` · gender `en` · definite `bakken` · IPA `[ˈbɑgə]`
- pronunciation: **ба́ге**

1. **холм** _(noun, en)_
   - Vi gik op ad en bakke i skoven.
   - Мы поднялись на холм в лесу.
2. **поднос** _(noun, en)_
   - Tjeneren bar glassene på en bakke.
   - Официант нёс стаканы на подносе.
3. **двигаться назад, сдавать назад** _(verb)_
   - Kan du bakke bilen lidt?
   - Можешь немного сдать назад?

_verdict:_ `bakke`

### 29. nummer

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

### 30. liste

- stratum: **three_senses** · batch: batch-0033.json · rank 1643
- facts: pos `noun` · gender `en` · definite `listen` · IPA `[ˈlesdə]`
- pronunciation: **лэ́стэ**

1. **список** _(noun, en)_
   - Jeg har skrevet det på min liste.
   - Я записал это в свой список.
2. **красться** _(verb)_
   - Han listede ud af døren.
   - Он прокрался за дверь.
3. **плинтус** _(noun, en)_
   - Der mangler en liste ved gulvet.
   - У пола не хватает плинтуса.

_verdict:_ `liste`

### 31. trykke

- stratum: **three_senses** · batch: batch-0032.json · rank 1556
- facts: pos `verb` · gender `null` · IPA `[ˈtʁœgə]`
- pronunciation: **трё́гэ**

1. **нажимать** _(verb)_
   - Du skal trykke på knappen.
   - Тебе нужно нажать на кнопку.
2. **печатать** _(verb)_
   - Bogen er trykt i mange eksemplarer.
   - Книга напечатана во многих экземплярах.
3. **сжимать, давить** _(verb)_
   - Skoene trykker mine fødder.
   - Ботинки жмут мне ноги.

_verdict:_ `trykke`

### 32. for

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

### 33. anelse

- stratum: **three_senses** · batch: batch-0054.json · rank 2676
- facts: pos `noun` · gender `en` · definite `anelsen` · IPA `[ˈæːnəlsə]`
- pronunciation: **э́нэльсэ**

1. **понятие, представление (о чём-либо)** _(noun, en)_
   - Jeg har ikke en anelse om det.
   - Я не имею об этом ни малейшего понятия.
2. **чуточка, лёгкий оттенок** _(noun, en)_
   - Der er en anelse salt i suppen.
   - В супе есть чуточка соли.
3. **предчувствие** _(noun, en)_
   - Hun havde en dårlig anelse.
   - У неё было плохое предчувствие.

_verdict:_ `anelse`

### 34. vægt

- stratum: **three_senses** · batch: batch-0024.json · rank 1195
- facts: pos `noun` · gender `en` · definite `vægten` · IPA `[ˈvεgd]`
- pronunciation: **вэгд**

1. **вес** _(noun, en)_
   - Hvad er din vægt?
   - Какой у тебя вес?
2. **весы** _(noun, en)_
   - Jeg stiller mig op på vægten.
   - Я встаю на весы.
3. **значимость** _(noun, en)_
   - Det lægger stor vægt på kvalitet.
   - Это придает большое значение качеству.

_verdict:_ `vægt`

### 35. mod

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

### 36. karakter

- stratum: **three_senses** · batch: batch-0020.json · rank 954
- facts: pos `noun` · gender `en` · definite `karakteren` · IPA `[kɑɑgˈteˀɐ̯]`
- pronunciation: **каагтэ́а**

1. **оценка** _(noun, en)_
   - Han fik en god karakter i matematik.
   - Он получил хорошую оценку по математике.
2. **характер** _(noun, en)_
   - Hun har en stærk karakter.
   - У неё сильный характер.
3. **персонаж** _(noun, en)_
   - Den karakter i filmen er meget sjov.
   - Этот персонаж в фильме очень смешной.

_verdict:_ `karakter`

### 37. ordentlig

- stratum: **three_senses** · batch: batch-0023.json · rank 1101
- facts: pos `adjective` · gender `null` · IPA `[ˈɒˀdənli]`
- pronunciation: **о́дэнли**

1. **приличный, порядочный** _(adjective)_
   - Han er en ordentlig mand.
   - Он порядочный человек.
2. **тщательный, основательный** _(adjective)_
   - Du skal gøre et ordentligt stykke arbejde.
   - Ты должен сделать работу основательно.
3. **как следует, по-настоящему** _(adverb)_
   - Jeg kan ikke se ordentligt uden briller.
   - Я не вижу как следует без очков.

_verdict:_ `ordentlig`

### 38. sætte

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

### 39. skrue

- stratum: **three_senses** · batch: batch-0036.json · rank 1772
- facts: pos `verb` · gender `null` · IPA `[ˈsgʁuːə]`
- pronunciation: **сгру́уэ**

1. **закручивать, откручивать** _(verb)_
   - Du skal skrue låget på.
   - Тебе нужно закрутить крышку.
2. **регулировать, увеличивать или уменьшать** _(verb)_
   - Kan du skrue ned for musikken?
   - Можешь сделать музыку потише?
3. **винт, шуруп** _(noun)_
   - Der mangler en skrue i stolen.
   - В стуле не хватает одного винта.

_verdict:_ `skrue`

### 40. støde

- stratum: **three_senses** · batch: batch-0037.json · rank 1826
- facts: pos `verb` · gender `null` · IPA `[ˈsdøːðə]`
- pronunciation: **сдё́одэ**

1. **ударяться, сталкиваться** _(verb)_
   - Hun kom til at støde ind i døren.
   - Она случайно столкнулась с дверью.
2. **встречать, наталкиваться** _(verb)_
   - Vi kan støde på problemer undervejs.
   - По пути мы можем столкнуться с проблемами.
3. **оскорблять, отталкивать** _(verb)_
   - Hans ord kan støde mange mennesker.
   - Его слова могут оскорбить многих людей.

_verdict:_ `støde`

### 41. rive

- stratum: **three_senses** · batch: batch-0037.json · rank 1842
- facts: pos `verb` · gender `null` · IPA `[ˈʁiːvə]`
- pronunciation: **ри́ивэ**

1. **рвать** _(verb)_
   - Hun kan rive papiret i stykker.
   - Она может разорвать бумагу на куски.
2. **тереть (на терке)** _(verb)_
   - Jeg skal rive gulerødder til salaten.
   - Мне нужно натереть морковь для салата.
3. **грабли (инструмент)** _(noun)_
   - Han bruger en rive i haven.
   - Он использует грабли в саду.

_verdict:_ `rive`

### 42. løse

- stratum: **three_senses** · batch: batch-0014.json · rank 671
- facts: pos `verb` · gender `null` · IPA `[ˈløːsə]`
- pronunciation: **лё́осэ**

1. **решать (проблему)** _(verb)_
   - Vi skal løse problemet.
   - Нам нужно решить проблему.
2. **покупать (билет)** _(verb)_
   - Man skal løse en billet før turen.
   - Нужно купить билет перед поездкой.
3. **развязывать, отвязывать** _(verb)_
   - Hun løser knuden langsomt.
   - Она медленно развязывает узел.

_verdict:_ `løse`

### 43. køn

- stratum: **three_senses** · batch: batch-0049.json · rank 2424
- facts: pos `noun` · gender `et` · definite `kønnet` · IPA `[ˈkœnˀ]`
- pronunciation: **кён**

1. **пол** _(noun, et)_
   - Formularen spørger om køn.
   - В форме спрашивают пол.
2. **грамматический род** _(noun, et)_
   - Ordet har intetkøn som grammatisk køn.
   - У слова средний грамматический род.
3. **милый, красивый** _(adjective)_
   - Hun har en køn kjole på.
   - На ней красивое платье.

_verdict:_ `køn`

### 44. udskrive

- stratum: **three_senses** · batch: batch-0056.json · rank 2799
- facts: pos `verb` · gender `null` · IPA `[ˈuðˌsgʁiˀvə]`
- pronunciation: **у́дсгриве**

1. **выписывать (из больницы)** _(verb)_
   - Lægen vil udskrive ham i morgen.
   - Врач выпишет его завтра.
2. **выписывать (документ, рецепт)** _(verb)_
   - Lægen skal udskrive en recept.
   - Врач должен выписать рецепт.
3. **назначать (выборы)** _(verb)_
   - Statsministeren vil udskrive valg.
   - Премьер-министр назначит выборы.

_verdict:_ `udskrive`

### 45. plads

- stratum: **three_senses** · batch: batch-0005.json · rank 201
- facts: pos `noun` · gender `en` · definite `pladsen` · IPA `[ˈplas]`
- pronunciation: **плас**

1. **место, пространство** _(noun, en)_
   - Der er ikke plads i bilen.
   - В машине нет места.
2. **площадь (городская)** _(noun, en)_
   - Vi mødes på pladsen klokken tre.
   - Мы встретимся на площади в три часа.
3. **место, должность** _(noun, en)_
   - Hun fik en plads på universitetet.
   - Она получила место в университете.

_verdict:_ `plads`

### 46. ydelse

- stratum: **three_senses** · batch: batch-0037.json · rank 1844
- facts: pos `noun` · gender `en` · definite `ydelsen` · IPA `[ˈyːðəlsə]`
- pronunciation: **ю́удэлсэ**

1. **выплата** _(noun, en)_
   - Hun modtager en månedlig ydelse fra staten.
   - Она получает ежемесячную выплату от государства.
2. **услуга** _(noun, en)_
   - Firmaet tilbyder en god ydelse til kunderne.
   - Фирма предлагает клиентам хорошую услугу.
3. **производительность** _(noun, en)_
   - Maskinens ydelse er meget høj.
   - Производительность машины очень высокая.

_verdict:_ `ydelse`

### 47. stof

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

### 48. skille

- stratum: **three_senses** · batch: batch-0034.json · rank 1700
- facts: pos `verb` · gender `null` · IPA `[ˈsgelə]`
- pronunciation: **сгэ́лэ**

1. **разделять** _(verb)_
   - Man skal skille affaldet.
   - Нужно разделять мусор.
2. **отличать** _(verb)_
   - Det er svært at skille sandhed fra løgn.
   - Трудно отличить правду от лжи.
3. **разводиться** _(verb)_
   - De valgte at skille sig efter mange år.
   - Они решили развестись после многих лет.

_verdict:_ `skille`

### 49. post

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

### 50. rigtig

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

### 51. romantisk

- stratum: **tail** · batch: batch-0055.json · rank 2710
- facts: pos `adjective` · gender `null` · IPA `[ʁoˈmanˀtisg]`
- pronunciation: **рома́нтисг**

1. **романтичный** _(adjective)_
   - Det var en romantisk middag.
   - Это был романтичный ужин.

_verdict:_ `romantisk`

### 52. arkiv

- stratum: **tail** · batch: batch-0055.json · rank 2719
- facts: pos `noun` · gender `et` · definite `arkivet` · IPA `[ɑˈkiwˀ]`
- pronunciation: **аки́в**

1. **архив** _(noun, et)_
   - Dokumentet ligger i arkivet.
   - Документ лежит в архиве.

_verdict:_ `arkiv`

### 53. kommentator

- stratum: **tail** · batch: batch-0057.json · rank 2808
- facts: pos `noun` · gender `en` · definite `kommentatoren` · IPA `[kɔmənˈtæːtʌ]`
- pronunciation: **комэнтэ́та**

1. **комментатор** _(noun, en)_
   - Kommentatoren beskrev kampen meget detaljeret.
   - Комментатор подробно описал матч.

_verdict:_ `kommentator`

### 54. ære

- stratum: **tail** · batch: batch-0056.json · rank 2785
- facts: pos `noun` · gender `en` · definite `æren` · IPA `[ˈεːʌ]`
- pronunciation: **э́а**

1. **честь** _(noun, en)_
   - Det er en stor ære.
   - Это большая честь.
2. **чтить, почитать** _(verb)_
   - Man skal ære sine forældre.
   - Нужно почитать своих родителей.

_verdict:_ `ære`

### 55. kaos

- stratum: **tail** · batch: batch-0056.json · rank 2792
- facts: pos `noun` · gender `et` · definite `kaosset` · IPA `[ˈkæːʌs]`
- pronunciation: **кэ́ос**

1. **хаос, беспорядок** _(noun, et)_
   - Der var totalt kaos i trafikken.
   - В дорожном движении был полный хаос.

_verdict:_ `kaos`

### 56. rock

- stratum: **tail** · batch: batch-0059.json · rank 2921
- facts: pos `noun` · gender `en` · definite `rocken` · IPA `[ˈʁʌg]`
- pronunciation: **рог**

1. **рок (музыка)** _(noun, en)_
   - Jeg kan godt lide rock.
   - Мне нравится рок.

_verdict:_ `rock`

### 57. protestere

- stratum: **tail** · batch: batch-0059.json · rank 2906
- facts: pos `verb` · gender `null` · IPA `[pʁodəˈsdeˀʌ]`
- pronunciation: **продэсдэ́а**

1. **протестовать** _(verb)_
   - De vil protestere mod loven.
   - Они хотят протестовать против закона.

_verdict:_ `protestere`

### 58. dæk

- stratum: **tail** · batch: batch-0058.json · rank 2880
- facts: pos `noun` · gender `et` · definite `dækket` · IPA `[ˈdεg]`
- pronunciation: **дэг**

1. **шина** _(noun, et)_
   - Jeg skal have skiftet dæk på bilen.
   - Мне нужно поменять шины на машине.
2. **палуба** _(noun, et)_
   - Vi gik en tur på dækket.
   - Мы прогулялись по палубе.

_verdict:_ `dæk`

### 59. besættelse

- stratum: **tail** · batch: batch-0055.json · rank 2744
- facts: pos `noun` · gender `en` · definite `besættelsen` · IPA `[beˈsεdəlsə]`
- pronunciation: **бесэ́делсе**

1. **оккупация** _(noun, en)_
   - Danmark var under besættelse under krigen.
   - Дания была под оккупацией во время войны.
2. **одержимость, навязчивое увлечение** _(noun, en)_
   - Hans besættelse af sport tager al hans tid.
   - Его одержимость спортом отнимает всё его время.

_verdict:_ `besættelse`

### 60. lukning

- stratum: **tail** · batch: batch-0057.json · rank 2807
- facts: pos `noun` · gender `en` · definite `lukningen` · IPA `[ˈlɔgneŋ]`
- pronunciation: **ло́гнэн**

1. **закрытие** _(noun, en)_
   - Butikken annoncerede sin lukning.
   - Магазин объявил о своем закрытии.

_verdict:_ `lukning`

### 61. anmelder

- stratum: **tail** · batch: batch-0055.json · rank 2748
- facts: pos `noun` · gender `en` · definite `anmelderen` · IPA `[ˈanˌmεlˀʌ]`
- pronunciation: **а́нмэла**

1. **рецензент, критик** _(noun, en)_
   - Anmelderen gav filmen fem stjerner.
   - Рецензент дал фильму пять звёзд.

_verdict:_ `anmelder`

### 62. regulere

- stratum: **tail** · batch: batch-0060.json · rank 2961
- facts: pos `verb` · gender `null` · IPA `[ʁεguˈleˀʌ]`
- pronunciation: **регулеа**

1. **регулировать** _(verb)_
   - Man skal regulere varmen i huset.
   - Нужно регулировать тепло в доме.

_verdict:_ `regulere`

### 63. skeptisk

- stratum: **tail** · batch: batch-0058.json · rank 2865
- facts: pos `adjective` · gender `null` · IPA `[ˈsgεbtisg]`
- pronunciation: **сгэ'бтиск**

1. **скептический, настроенный скептически** _(adjective)_
   - Jeg er skeptisk over for planen.
   - Я скептически отношусь к этому плану.

_verdict:_ `skeptisk`

### 64. lom

- stratum: **tail** · batch: batch-0056.json · rank 2757
- facts: pos `noun` · gender `en` · definite `lommen` · IPA `[ˈlʌmˀ]`
- pronunciation: **ло́м**

1. **гагара (птица)** _(noun, en)_
   - En lom svømmer på søen.
   - Гагара плавает на озере.

_verdict:_ `lom`

### 65. forinden

- stratum: **tail** · batch: batch-0059.json · rank 2925
- facts: pos `adverb` · gender `null` · IPA `[fʌˈenən]`
- pronunciation: **фоэ́нэн**

1. **перед этим, заранее** _(adverb)_
   - Jeg havde læst bogen forinden.
   - Я прочитал книгу заранее.
2. **до того как** _(conjunction)_
   - Han ringede forinden han kom.
   - Он позвонил до того, как пришел.

_verdict:_ `forinden`

### 66. bande

- stratum: **tail** · batch: batch-0055.json · rank 2712
- facts: pos `noun` · gender `en` · definite `banden` · IPA `[ˈbandə]`
- pronunciation: **ба́нде**

1. **банда** _(noun, en)_
   - Politiet fangede en bande.
   - Полиция поймала банду.
2. **ругаться, сквернословить** _(verb)_
   - Han begyndte at bande af vrede.
   - Он начал ругаться от злости.

_verdict:_ `bande`

### 67. uhyggelig

- stratum: **tail** · batch: batch-0059.json · rank 2932
- facts: pos `adjective` · gender `null` · IPA `[uˈhygəli]`
- pronunciation: **ухю́гэли**

1. **жуткий, зловещий** _(adjective)_
   - Det var en uhyggelig film.
   - Это был жуткий фильм.
2. **очень плохой, ужасный** _(adjective)_
   - Det er uhyggeligt vejr.
   - Погода ужасная.

_verdict:_ `uhyggelig`

### 68. disciplin

- stratum: **tail** · batch: batch-0057.json · rank 2813
- facts: pos `noun` · gender `en` · definite `disciplinen` · IPA `[disiˈpliˀn]`
- pronunciation: **дисипли́н**

1. **дисциплина, порядок** _(noun, en)_
   - Der kræves disciplin for at lære et sprog.
   - Требуется дисциплина, чтобы выучить язык.
2. **дисциплина (вид спорта)** _(noun, en)_
   - Svømning er en svær disciplin.
   - Плавание — это сложная дисциплина.

_verdict:_ `disciplin`

### 69. øve

- stratum: **tail** · batch: batch-0058.json · rank 2882
- facts: pos `verb` · gender `null` · IPA `[ˈøːvə]`
- pronunciation: **ё'вё**

1. **тренироваться, упражняться** _(verb)_
   - Jeg skal øve mig på at spille klaver.
   - Мне нужно потренироваться играть на пианино.
2. **практиковать** _(verb)_
   - Vi øver dansk hver dag.
   - Мы практикуем датский каждый день.

_verdict:_ `øve`

### 70. fair

- stratum: **tail** · batch: batch-0056.json · rank 2762
- facts: pos `adjective` · gender `null` · IPA `[ˈfεːɐ̯]`
- pronunciation: **фэ́а**

1. **честный, справедливый** _(adjective)_
   - Det er ikke fair.
   - Это нечестно.

_verdict:_ `fair`

### 71. indkøb

- stratum: **tail** · batch: batch-0055.json · rank 2707
- facts: pos `noun` · gender `et` · definite `indkøbet` · IPA `[ˈenˌkøˀb]`
- pronunciation: **э́нкёб**

1. **покупка, закупка** _(noun, et)_
   - Jeg skal ud at gøre indkøb.
   - Мне нужно сходить за покупками.

_verdict:_ `indkøb`

### 72. omtrent

- stratum: **tail** · batch: batch-0056.json · rank 2789
- facts: pos `adverb` · gender `null` · IPA `[ʌmˈtʁanˀd]`
- pronunciation: **омтра́нд**

1. **приблизительно** _(adverb)_
   - Det koster omtrent hundrede kroner.
   - Это стоит приблизительно сто крон.

_verdict:_ `omtrent`

### 73. aspekt

- stratum: **tail** · batch: batch-0060.json · rank 2978
- facts: pos `noun` · gender `et` · definite `aspektet` · IPA `[aˈsbεgd]`
- pronunciation: **аспегд**

1. **аспект** _(noun, et)_
   - Vi skal se på sagen fra et andet aspekt.
   - Нам нужно взглянуть на дело с другого аспекта.

_verdict:_ `aspekt`

### 74. appellere

- stratum: **tail** · batch: batch-0060.json · rank 2970
- facts: pos `verb` · gender `null` · IPA `[ɑbəˈleˀʌ]`
- pronunciation: **абэлеа**

1. **подавать апелляцию** _(verb)_
   - Han vil appellere dommen.
   - Он хочет подать апелляцию на приговор.
2. **взывать, обращаться** _(verb)_
   - Vi må appellere til folks fornuft.
   - Мы должны взывать к здравому смыслу людей.

_verdict:_ `appellere`

### 75. uventet

- stratum: **tail** · batch: batch-0060.json · rank 2971
- facts: pos `adjective` · gender `null` · IPA `[ˈuˌvεnˀdəð]`
- pronunciation: **увендэт**

1. **неожиданный** _(adjective)_
   - Det var et uventet besøg.
   - Это был неожиданный визит.

_verdict:_ `uventet`

### 76. tilsyn

- stratum: **tail** · batch: batch-0057.json · rank 2804
- facts: pos `noun` · gender `et` · definite `tilsynet` · IPA `[ˈtelˌsyˀn]`
- pronunciation: **тэльсю́н**

1. **надзор, присмотр** _(noun, et)_
   - Børnene er under opsyn og tilsyn.
   - Дети находятся под наблюдением и присмотром.

_verdict:_ `tilsyn`

### 77. sproglig

- stratum: **tail** · batch: batch-0057.json · rank 2847
- facts: pos `adjective` · gender `null` · IPA `[ˈsbʁɔwli]`
- pronunciation: **сбро́вли**

1. **языковой, лингвистический** _(adjective)_
   - Der er sproglige forskelle.
   - Существуют языковые различия.

_verdict:_ `sproglig`

### 78. forberedelse

- stratum: **tail** · batch: batch-0057.json · rank 2817
- facts: pos `noun` · gender `en` · definite `forberedelsen` · IPA `[ˈfɒːbeˌʁεðˀəlsə]`
- pronunciation: **фо́бэрэ́дльсэ**

1. **подготовка** _(noun, en)_
   - God forberedelse er vigtig før eksamen.
   - Хорошая подготовка важна перед экзаменом.

_verdict:_ `forberedelse`

### 79. bestemmelse

- stratum: **tail** · batch: batch-0058.json · rank 2874
- facts: pos `noun` · gender `en` · definite `bestemmelsen` · IPA `[beˈsdεmˀəlsə]`
- pronunciation: **бэсдэ́мэлсэ**

1. **постановление, предписание** _(noun, en)_
   - Der er en bestemmelse om rygeforbud.
   - Существует предписание о запрете курения.
2. **решение, намерение** _(noun, en)_
   - Det var hans faste bestemmelse at rejse.
   - Он твёрдо решил уехать.

_verdict:_ `bestemmelse`

### 80. pol

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

### 81. land

- stratum: **head** · batch: batch-0002.json · rank 84
- facts: pos `noun` · gender `et` · definite `landet` · IPA `[ˈlanˀ]`
- pronunciation: **лан**

1. **страна** _(noun, et)_
   - Danmark er et lille land.
   - Дания — маленькая страна.
2. **земля, суша** _(noun, et)_
   - Skibet nærmede sig land.
   - Корабль приближался к суше.

_verdict:_ `land`

### 82. forstå

- stratum: **head** · batch: batch-0007.json · rank 316
- facts: pos `verb` · gender `null` · IPA `[fʌˈsdɔˀ]`
- pronunciation: **фосдо́**

1. **понимать** _(verb)_
   - Jeg forstår ikke spørgsmålet.
   - Я не понимаю вопрос.

_verdict:_ `forstå`

### 83. fortælle

- stratum: **head** · batch: batch-0003.json · rank 150
- facts: pos `verb` · gender `null` · IPA `[fʌˈtεlˀə]`
- pronunciation: **фотэ́лэ**

1. **рассказывать** _(verb)_
   - Jeg vil fortælle dig noget.
   - Я хочу тебе кое-что рассказать.

_verdict:_ `fortælle`

### 84. firma

- stratum: **head** · batch: batch-0012.json · rank 557
- facts: pos `noun` · gender `et` · definite `firmaet` · IPA `[ˈfiɐ̯ma]`
- pronunciation: **фи́ама**

1. **фирма, компания** _(noun, et)_
   - Hun arbejder i et stort firma.
   - Она работает в большой компании.

_verdict:_ `firma`

### 85. tegne

- stratum: **head** · batch: batch-0017.json · rank 843
- facts: pos `verb` · gender `null` · IPA `[ˈtɑjnə]`
- pronunciation: **та́йнэ**

1. **рисовать** _(verb)_
   - Barnet tegner et hus.
   - Ребёнок рисует дом.
2. **оформлять, заключать (страховку, подписку)** _(verb)_
   - Vi skal tegne en forsikring til bilen.
   - Нам нужно оформить страховку на машину.

_verdict:_ `tegne`

### 86. dreje

- stratum: **head** · batch: batch-0015.json · rank 704
- facts: pos `verb` · gender `null` · IPA `[ˈdʁɑjə]`
- pronunciation: **дра́йэ**

1. **поворачивать** _(verb)_
   - Du skal dreje til højre ved lyskrydset.
   - Тебе нужно повернуть направо на перекрёстке.
2. **быть о (чём-л.), идти речь о** _(verb)_
   - Filmen drejer sig om to venner.
   - Фильм рассказывает о двух друзьях.

_verdict:_ `dreje`

### 87. foran

- stratum: **head** · batch: batch-0011.json · rank 509
- facts: pos `preposition` · gender `null` · IPA `[ˈfɒɒn]`
- pronunciation: **фо́он**

1. **перед** _(preposition)_
   - Bilen holder foran huset.
   - Машина стоит перед домом.
2. **впереди** _(adverb)_
   - Han gik foran og viste vej.
   - Он шёл впереди и показывал дорогу.

_verdict:_ `foran`

### 88. således

- stratum: **head** · batch: batch-0007.json · rank 324
- facts: pos `adverb` · gender `null` · IPA `[ˈsʌˌleðəs]`
- pronunciation: **со́лэдэс**

1. **таким образом** _(adverb)_
   - Hun gjorde det således.
   - Она сделала это таким образом.

_verdict:_ `således`

### 89. speciel

- stratum: **head** · batch: batch-0014.json · rank 673
- facts: pos `adjective` · gender `null` · IPA `[sbeˈɕεlˀ]`
- pronunciation: **сбэшэ́л**

1. **особенный, специальный** _(adjective)_
   - Det var en speciel dag.
   - Это был особенный день.

_verdict:_ `speciel`

### 90. idé

- stratum: **head** · batch: batch-0016.json · rank 785
- facts: pos `noun` · gender `en` · IPA `[iˈdeˀ]`
- pronunciation: **идэ́**

1. **идея** _(noun, en)_
   - Det er en god idé.
   - Это хорошая идея.

_verdict:_ `idé`

### 91. forestilling

- stratum: **head** · batch: batch-0017.json · rank 828
- facts: pos `noun` · gender `en` · definite `forestillingen` · IPA `[ˈfɒːɒˌsdelˀeŋ]`
- pronunciation: **фо́оосдэ́линг**

1. **спектакль, представление (театральное)** _(noun, en)_
   - Vi så en flot forestilling i teatret.
   - Мы посмотрели прекрасный спектакль в театре.
2. **представление, понятие** _(noun, en)_
   - Han har en klar forestilling om fremtiden.
   - У него есть чёткое представление о будущем.

_verdict:_ `forestilling`

### 92. region

- stratum: **head** · batch: batch-0012.json · rank 555
- facts: pos `noun` · gender `en` · definite `regionen` · IPA `[ʁεgiˈoˀn]`
- pronunciation: **рэгио́н**

1. **регион** _(noun, en)_
   - Han bor i en anden region.
   - Он живёт в другом регионе.

_verdict:_ `region`

### 93. bestemt

- stratum: **head** · batch: batch-0019.json · rank 907
- facts: pos `adjective` · gender `null` · IPA `[beˈsdεmˀd]`
- pronunciation: **бэсдэ́мт**

1. **определённый, конкретный** _(adjective)_
   - Vi mødes på et bestemt tidspunkt.
   - Мы встречаемся в определённое время.

_verdict:_ `bestemt`

### 94. følge

- stratum: **head** · batch: batch-0004.json · rank 188
- facts: pos `verb` · gender `null` · IPA `[ˈføljə]`
- pronunciation: **фё́лье**

1. **следовать, сопровождать** _(verb)_
   - Hunden følger mig overalt.
   - Собака следует за мной повсюду.
2. **следствие, последствие** _(noun)_
   - Det skete som en følge af hans beslutning.
   - Это произошло как следствие его решения.

_verdict:_ `følge`

### 95. vi

- stratum: **head** · batch: batch-0001.json · rank 21
- facts: pos `pronoun` · gender `null` · IPA `[ˈvi]`
- pronunciation: **ви**

1. **мы** _(pronoun)_
   - Vi spiser sammen.
   - Мы едим вместе.

_verdict:_ `vi`

### 96. aktie

- stratum: **head** · batch: batch-0012.json · rank 551
- facts: pos `noun` · gender `en` · definite `aktien` · IPA `[ˈɑgɕə]`
- pronunciation: **а́кше**

1. **акция (ценная бумага)** _(noun, en)_
   - Han køber aktier i firmaet.
   - Он покупает акции компании.

_verdict:_ `aktie`

### 97. samfund

- stratum: **head** · batch: batch-0007.json · rank 310
- facts: pos `noun` · gender `et` · definite `samfundet` · IPA `[ˈsɑmˌfɔnˀ]`
- pronunciation: **са́мфон**

1. **общество** _(noun, et)_
   - Han interesserer sig for samfundet.
   - Он интересуется обществом.

_verdict:_ `samfund`

### 98. billede

- stratum: **head** · batch: batch-0006.json · rank 268
- facts: pos `noun` · gender `et` · definite `billedet` · IPA `[ˈbeləðə]`
- pronunciation: **бэ́лэдэ**

1. **изображение, фотография** _(noun, et)_
   - Kan du sende mig et billede?
   - Можешь прислать мне фотографию?

_verdict:_ `billede`

### 99. hånd

- stratum: **head** · batch: batch-0007.json · rank 332
- facts: pos `noun` · gender `en` · definite `hånden` · IPA `[ˈhʌnˀ]`
- pronunciation: **хон**

1. **рука, кисть** _(noun, en)_
   - Hun holder barnet i hånden.
   - Она держит ребёнка за руку.

_verdict:_ `hånd`

### 100. første

- stratum: **head** · batch: batch-0002.json · rank 82
- facts: pos `adjective` · gender `null` · IPA `[ˈfɶɐ̯sdə]`
- pronunciation: **фё́астэ**

1. **первый** _(adjective)_
   - Det er hendes første dag på arbejdet.
   - Это её первый день на работе.

_verdict:_ `første`

### 101. dom

- stratum: **head** · batch: batch-0019.json · rank 913
- facts: pos `noun` · gender `en` · IPA `[ˈdʌmˀ]`
- pronunciation: **дом**

1. **приговор, решение суда** _(noun, en)_
   - Retten afsagde en dom i dag.
   - Сегодня суд вынес приговор.

_verdict:_ `dom`

### 102. masse

- stratum: **head** · batch: batch-0008.json · rank 400
- facts: pos `noun` · gender `en` · definite `massen` · IPA `[ˈmasə]`
- pronunciation: **ма́сэ**

1. **множество, уйма** _(noun, en)_
   - Der var en masse mennesker til koncerten.
   - На концерте было множество людей.
2. **масса (физическая величина)** _(noun, en)_
   - Fysik handler blandt andet om masse og energi.
   - Физика, среди прочего, занимается массой и энергией.

_verdict:_ `masse`

### 103. onsdag

- stratum: **head** · batch: batch-0011.json · rank 518
- facts: pos `noun` · gender `en` · definite `onsdagen` · IPA `[ˈɔnˀsda]`
- pronunciation: **о́нсда**

1. **среда** _(noun, en)_
   - Vi mødes på onsdag.
   - Мы встречаемся в среду.

_verdict:_ `onsdag`

### 104. læse

- stratum: **head** · batch: batch-0006.json · rank 282
- facts: pos `verb` · gender `null` · IPA `[ˈlεːsə]`
- pronunciation: **лэ́эсэ**

1. **читать** _(verb)_
   - Jeg læser en bog.
   - Я читаю книгу.
2. **учиться, изучать** _(verb)_
   - Hun læser til lærer.
   - Она учится на учителя.

_verdict:_ `læse`

### 105. elske

- stratum: **head** · batch: batch-0015.json · rank 744
- facts: pos `verb` · gender `null` · IPA `[ˈεlsgə]`
- pronunciation: **э́лскэ**

1. **любить** _(verb)_
   - Jeg elsker min familie meget.
   - Я очень люблю свою семью.

_verdict:_ `elske`

### 106. pres

- stratum: **head** · batch: batch-0018.json · rank 851
- facts: pos `noun` · gender `et` · definite `presset` · IPA `[ˈpʁas]`
- pronunciation: **прас**

1. **давление** _(noun, et)_
   - Der er meget pres på arbejdet.
   - На работе сильное давление.
2. **пресс (устройство)** _(noun, et)_
   - Han lagde bogen under et pres.
   - Он положил книгу под пресс.

_verdict:_ `pres`

### 107. efterhånden

- stratum: **head** · batch: batch-0015.json · rank 749
- facts: pos `adverb` · gender `null` · IPA `[εfdʌˈhʌnˀən]`
- pronunciation: **эфтохо́нэн**

1. **постепенно, со временем** _(adverb)_
   - Han lærte efterhånden at tale dansk.
   - Он постепенно научился говорить по-датски.

_verdict:_ `efterhånden`

### 108. bevæge

- stratum: **head** · batch: batch-0019.json · rank 946
- facts: pos `verb` · gender `null` · IPA `[beˈvεˀjə]`
- pronunciation: **бэвэ́йэ**

1. **двигать, двигаться** _(verb)_
   - Hun bevægede sig langsomt mod døren.
   - Она медленно двигалась к двери.
2. **растрогать, взволновать** _(verb)_
   - Filmen bevægede hende til tårer.
   - Фильм растрогал её до слёз.

_verdict:_ `bevæge`

### 109. hvid

- stratum: **head** · batch: batch-0009.json · rank 436
- facts: pos `adjective` · gender `null` · IPA `[ˈviðˀ]`
- pronunciation: **вид**

1. **белый** _(adjective)_
   - Hun har en hvid skjorte.
   - На ней белая рубашка.

_verdict:_ `hvid`

### 110. økonomi

- stratum: **head** · batch: batch-0009.json · rank 427
- facts: pos `noun` · gender `en` · definite `økonomien` · IPA `[økonoˈmiˀ]`
- pronunciation: **ёконо́ми**

1. **экономика** _(noun, en)_
   - Landets økonomi vokser.
   - Экономика страны растёт.
2. **финансы, бюджет** _(noun, en)_
   - Min økonomi er bedre nu.
   - Мои финансы сейчас лучше.

_verdict:_ `økonomi`

### 111. kritiker

- stratum: **general** · batch: batch-0039.json · rank 1912
- facts: pos `noun` · gender `en` · definite `kritikeren` · IPA `[ˈkʁidigʌ]`
- pronunciation: **кри́диго**

1. **критик** _(noun, en)_
   - Filmen fik gode anmeldelser fra alle kritikere.
   - Фильм получил хорошие отзывы от всех критиков.

_verdict:_ `kritiker`

### 112. teknologisk

- stratum: **general** · batch: batch-0054.json · rank 2665
- facts: pos `adjective` · gender `null` · IPA `[tεgnoˈloˀisg]`
- pronunciation: **тэгноло́иск**

1. **технологический** _(adjective)_
   - Det er en teknologisk løsning.
   - Это технологическое решение.

_verdict:_ `teknologisk`

### 113. bekæmpe

- stratum: **general** · batch: batch-0041.json · rank 2017
- facts: pos `verb` · gender `null` · IPA `[beˈkεmˀbə]`
- pronunciation: **бэкэ́мбэ**

1. **бороться с** _(verb)_
   - Vi skal bekæmpe fattigdom.
   - Мы должны бороться с бедностью.

_verdict:_ `bekæmpe`

### 114. manager

- stratum: **general** · batch: batch-0054.json · rank 2655
- facts: pos `noun` · gender `en` · definite `manageren` · IPA `[ˈmanidjʌ]`
- pronunciation: **ма́ниджа**

1. **менеджер, управляющий** _(noun, en)_
   - Han er manager for et band.
   - Он менеджер музыкальной группы.

_verdict:_ `manager`

### 115. synlig

- stratum: **general** · batch: batch-0041.json · rank 2014
- facts: pos `adjective` · gender `null` · IPA `[ˈsyːnli]`
- pronunciation: **сю́унли**

1. **видимый** _(adjective)_
   - Månen er synlig på himlen.
   - Луна видна на небе.

_verdict:_ `synlig`

### 116. jul

- stratum: **general** · batch: batch-0021.json · rank 1015
- facts: pos `noun` · gender `en` · definite `julen` · IPA `[ˈjuˀl]`
- pronunciation: **юл**

1. **Рождество** _(noun, en)_
   - Vi holder jul hos mine forældre.
   - Мы празднуем Рождество у моих родителей.

_verdict:_ `jul`

### 117. forfølge

- stratum: **general** · batch: batch-0053.json · rank 2626
- facts: pos `verb` · gender `null` · IPA `[fʌˈfølˀjə]`
- pronunciation: **фофёлье**

1. **преследовать, гнаться** _(verb)_
   - Politiet begyndte at forfølge tyven.
   - Полиция начала преследовать вора.
2. **преследовать цель или идею** _(verb)_
   - Hun forfølger sine drømme.
   - Она следует за своими мечтами.

_verdict:_ `forfølge`

### 118. stramme

- stratum: **general** · batch: batch-0049.json · rank 2442
- facts: pos `verb` · gender `null` · IPA `[ˈsdʁɑmə]`
- pronunciation: **сдра́мэ**

1. **затягивать** _(verb)_
   - Du skal stramme skruen.
   - Тебе нужно затянуть винт.
2. **быть тесным** _(verb)_
   - Bukserne strammer om livet.
   - Брюки тесны в талии.

_verdict:_ `stramme`

### 119. grov

- stratum: **general** · batch: batch-0028.json · rank 1369
- facts: pos `adjective` · gender `null` · IPA `[ˈgʁɒwˀ]`
- pronunciation: **гроу**

1. **грубый** _(adjective)_
   - Det var en grov fejl.
   - Это была грубая ошибка.
2. **невоспитанный** _(adjective)_
   - Han var meget grov mod tjeneren.
   - Он был очень груб с официантом.

_verdict:_ `grov`

### 120. kor

- stratum: **general** · batch: batch-0044.json · rank 2159
- facts: pos `noun` · gender `et` · definite `koret` · IPA `[ˈkoˀɐ̯]`
- pronunciation: **коа**

1. **хор** _(noun, et)_
   - Hun synger i et kor.
   - Она поёт в хоре.

_verdict:_ `kor`

### 121. bøde

- stratum: **general** · batch: batch-0038.json · rank 1871
- facts: pos `noun` · gender `en` · definite `bøden` · IPA `[ˈbøːðə]`
- pronunciation: **бё́одэ**

1. **штраф** _(noun, en)_
   - Jeg fik en bøde for at køre for stærkt.
   - Я получил штраф за превышение скорости.
2. **исправлять, возмещать ущерб** _(verb)_
   - Han prøvede at bøde på fejlen.
   - Он пытался исправить ошибку.

_verdict:_ `bøde`

### 122. redskab

- stratum: **general** · batch: batch-0049.json · rank 2426
- facts: pos `noun` · gender `et` · definite `redskabet` · IPA `[ˈʁεðˌsgæˀb]`
- pronunciation: **рэ́дсгэб**

1. **инструмент, орудие** _(noun, et)_
   - Han bruger det rigtige redskab til arbejdet.
   - Он использует правильный инструмент для работы.

_verdict:_ `redskab`

### 123. øre

- stratum: **general** · batch: batch-0027.json · rank 1320
- facts: pos `noun` · gender `null` · IPA `[ˈøːʌ]`
- pronunciation: **ё́эа**

1. **ухо** _(noun)_
   - Jeg har ondt i mit øre.
   - У меня болит ухо.

_verdict:_ `øre`

### 124. humor

- stratum: **general** · batch: batch-0046.json · rank 2284
- facts: pos `noun` · gender `en` · definite `humoren` · IPA `[ˈhuːmʌ]`
- pronunciation: **ху́умо**

1. **юмор** _(noun, en)_
   - Han har en god humor.
   - У него хороший юмор.

_verdict:_ `humor`

### 125. hensigt

- stratum: **general** · batch: batch-0045.json · rank 2222
- facts: pos `noun` · gender `en` · definite `hensigten` · IPA `[ˈhεnˌsegd]`
- pronunciation: **хэ́нсэгд**

1. **намерение** _(noun, en)_
   - Hvad er din hensigt med det?
   - Каково твое намерение насчет этого?
2. **цель** _(noun, en)_
   - Det var ikke min hensigt at gøre dig ked af det.
   - Моей целью не было тебя расстроить.

_verdict:_ `hensigt`

### 126. gennemsnit

- stratum: **general** · batch: batch-0033.json · rank 1605
- facts: pos `noun` · gender `et` · definite `gennemsnittet` · IPA `[ˈgεnəmˌsnid]`
- pronunciation: **гэ́нэмснид**

1. **среднее значение** _(noun, et)_
   - I gennemsnit sover vi otte timer.
   - В среднем мы спим восемь часов.

_verdict:_ `gennemsnit`

### 127. tjeneste

- stratum: **general** · batch: batch-0034.json · rank 1652
- facts: pos `noun` · gender `en` · definite `tjenesten` · IPA `[ˈtjεːnəsdə]`
- pronunciation: **тьэ́энэстэ**

1. **услуга, одолжение** _(noun, en)_
   - Må jeg bede dig om en tjeneste?
   - Могу я попросить тебя об одолжении?
2. **служба, работа** _(noun, en)_
   - Han er i militær tjeneste.
   - Он на военной службе.

_verdict:_ `tjeneste`

### 128. sal

- stratum: **general** · batch: batch-0031.json · rank 1520
- facts: pos `noun` · gender `en` · definite `salen` · IPA `[ˈsæˀl]`
- pronunciation: **сэл**

1. **зал** _(noun, en)_
   - Koncerten foregår i en stor sal.
   - Концерт проходит в большом зале.
2. **этаж** _(noun, en)_
   - De bor på anden sal.
   - Они живут на втором этаже.

_verdict:_ `sal`

### 129. fascinere

- stratum: **general** · batch: batch-0050.json · rank 2464
- facts: pos `verb` · gender `null` · IPA `[fasiˈneˀʌ]`
- pronunciation: **фасинэ́эа**

1. **очаровывать** _(verb)_
   - Naturen kan fascinere alle.
   - Природа может очаровать каждого.
2. **увлекать** _(verb)_
   - Historien fascinerer mig.
   - История меня увлекает.

_verdict:_ `fascinere`

### 130. tillid

- stratum: **general** · batch: batch-0027.json · rank 1302
- facts: pos `noun` · gender `en` · definite `tilliden` · IPA `[ˈteˌliðˀ]`
- pronunciation: **тэ́лид**

1. **доверие** _(noun, en)_
   - Jeg har stor tillid til ham.
   - Я очень доверяю ему.

_verdict:_ `tillid`

### 131. forsikre

- stratum: **general** · batch: batch-0051.json · rank 2539
- facts: pos `verb` · gender `null` · IPA `[fʌˈsegʁʌ]`
- pronunciation: **фосэ́гро**

1. **уверять** _(verb)_
   - Han forsikrede mig om, at alt var i orden.
   - Он уверил меня, что все в порядке.
2. **страховать** _(verb)_
   - Man bør forsikre sit hus mod brand.
   - Следует застраховать свой дом от пожара.

_verdict:_ `forsikre`

### 132. tilmed

- stratum: **general** · batch: batch-0050.json · rank 2479
- facts: pos `adverb` · gender `null` · IPA `[ˈtelˌmεð]`
- pronunciation: **тэ́лмэд**

1. **даже, к тому же** _(adverb)_
   - Det var dyrt og tilmed dårligt.
   - Это было дорого и к тому же плохо.

_verdict:_ `tilmed`

### 133. tilfredsstille

- stratum: **general** · batch: batch-0053.json · rank 2623
- facts: pos `verb` · gender `null` · IPA `[tˢeˈfʁɛsˌsd̥elˀə]`
- pronunciation: **_(null)_**

1. **удовлетворять** _(verb)_
   - Det er svært at tilfredsstille alle.
   - Трудно удовлетворить всех.

_verdict:_ `tilfredsstille`

### 134. fremme

- stratum: **general** · batch: batch-0036.json · rank 1785
- facts: pos `adverb` · gender `null` · IPA `[ˈfʁamə]`
- pronunciation: **фра́мэ**

1. **на месте назначения, впереди** _(adverb)_
   - Vi er snart fremme.
   - Мы скоро будем на месте.
2. **продвигать, способствовать** _(verb)_
   - Det kan fremme samarbejdet.
   - Это может способствовать сотрудничеству.

_verdict:_ `fremme`

### 135. desto

- stratum: **general** · batch: batch-0036.json · rank 1765
- facts: pos `conjunction` · gender `null` · IPA `[desdo]`
- pronunciation: **дэсто**

1. **тем (в конструкциях чем... тем...)** _(conjunction)_
   - Jo før, desto bedre.
   - Чем раньше, тем лучше.

_verdict:_ `desto`

### 136. forrige

- stratum: **general** · batch: batch-0042.json · rank 2081
- facts: pos `adjective` · gender `null` · IPA `[ˈfɒːiə]`
- pronunciation: **фо́оиэ**

1. **предыдущий, прошлый** _(adjective)_
   - Vi mødtes i forrige uge.
   - Мы встречались на прошлой неделе.

_verdict:_ `forrige`

### 137. tør

- stratum: **general** · batch: batch-0035.json · rank 1704
- facts: pos `adjective` · gender `null` · IPA `[ˈtɶˀɐ̯]`
- pronunciation: **тё́а**

1. **сухой** _(adjective)_
   - Jakken er tør nu.
   - Куртка теперь сухая.

_verdict:_ `tør`

### 138. glas

- stratum: **general** · batch: batch-0031.json · rank 1535
- facts: pos `noun` · gender `et` · definite `glasset` · IPA `[ˈglas]`
- pronunciation: **глас**

1. **стакан** _(noun, et)_
   - Jeg vil gerne have et glas vand.
   - Я бы хотел стакан воды.
2. **стекло** _(noun, et)_
   - Vinduet er lavet af glas.
   - Окно сделано из стекла.

_verdict:_ `glas`

### 139. sætning

- stratum: **general** · batch: batch-0052.json · rank 2556
- facts: pos `noun` · gender `en` · definite `sætningen` · IPA `[ˈsεdneŋ]`
- pronunciation: **сэ́днен**

1. **предложение (грамматическое)** _(noun, en)_
   - Skriv en sætning på dansk.
   - Напишите предложение на датском.

_verdict:_ `sætning`

### 140. fan

- stratum: **general** · batch: batch-0035.json · rank 1731
- facts: pos `noun` · gender `en` · IPA `[ˈfæːn]`
- pronunciation: **фэ́эн**

1. **фанат** _(noun, en)_
   - Han er stor fan af fodbold.
   - Он большой фанат футбола.

_verdict:_ `fan`

### 141. modsat

- stratum: **general** · batch: batch-0051.json · rank 2508
- facts: pos `adjective` · gender `null` · IPA `[ˈmoðˌsad]`
- pronunciation: **мо́дсад**

1. **противоположный** _(adjective)_
   - De har en modsat holdning.
   - У них противоположная позиция.

_verdict:_ `modsat`

### 142. farlig

- stratum: **general** · batch: batch-0021.json · rank 1044
- facts: pos `adjective` · gender `null` · IPA `[ˈfɑːli]`
- pronunciation: **фа́али**

1. **опасный** _(adjective)_
   - Det er farligt at køre for stærkt.
   - Опасно ездить слишком быстро.

_verdict:_ `farlig`

### 143. utallig

- stratum: **general** · batch: batch-0053.json · rank 2641
- facts: pos `adjective` · gender `null` · IPA `[uˈtalˀi]`
- pronunciation: **ута́ли**

1. **бесчисленный** _(adjective)_
   - Der er utallige muligheder.
   - Существует бесчисленное множество возможностей.

_verdict:_ `utallig`

### 144. begå

- stratum: **general** · batch: batch-0021.json · rank 1014
- facts: pos `verb` · gender `null` · IPA `[beˈgɔˀ]`
- pronunciation: **бэго́**

1. **совершать (ошибку, преступление)** _(verb)_
   - Han begik en stor fejl.
   - Он совершил большую ошибку.

_verdict:_ `begå`

### 145. fremstille

- stratum: **general** · batch: batch-0026.json · rank 1269
- facts: pos `verb` · gender `null` · IPA `/ˈfʁamˌsdelˀə/`
- pronunciation: **_(null)_**

1. **производить** _(verb)_
   - Fabrikken fremstiller møbler.
   - Фабрика производит мебель.
2. **изображать, представлять** _(verb)_
   - Han fremstiller sagen meget enkelt.
   - Он представляет дело очень просто.

_verdict:_ `fremstille`

### 146. udstyre

- stratum: **general** · batch: batch-0050.json · rank 2463
- facts: pos `verb` · gender `null` · IPA `[ˈuðˌsdyˀʌ]`
- pronunciation: **у́дсдю́эа**

1. **оснащать** _(verb)_
   - Vi skal udstyre kontoret med nye computere.
   - Мы должны оснастить офис новыми компьютерами.

_verdict:_ `udstyre`

### 147. litteratur

- stratum: **general** · batch: batch-0028.json · rank 1378
- facts: pos `noun` · gender `en` · definite `litteraturen` · IPA `[lidəʁɑˈtuɐ̯ˀ]`
- pronunciation: **лидэрату́а**

1. **литература** _(noun, en)_
   - Jeg elsker dansk litteratur.
   - Я люблю датскую литературу.

_verdict:_ `litteratur`

### 148. lav

- stratum: **general** · batch: batch-0009.json · rank 407
- facts: pos `adjective` · gender `null` · IPA `[ˈlæˀv]`
- pronunciation: **лэв**

1. **низкий** _(adjective)_
   - Prisen er lav.
   - Цена низкая.
2. **тихий (о голосе, звуке)** _(adjective)_
   - Hun talte med en lav stemme.
   - Она говорила тихим голосом.

_verdict:_ `lav`

### 149. end

- stratum: **general** · batch: batch-0002.json · rank 73
- facts: pos `conjunction` · gender `null` · IPA `[en]`
- pronunciation: **эн**

1. **чем** _(conjunction)_
   - Hun er højere end mig.
   - Она выше, чем я.

_verdict:_ `end`

### 150. svenske

- stratum: **general** · batch: batch-0042.json · rank 2095
- facts: pos `noun` · gender `en` · definite `svensken` · IPA `[ˈsvεnsgə]`
- pronunciation: **свэ́нскэ**

1. **швед, шведка** _(noun, en)_
   - Han er svenske.
   - Он швед.
2. **шведский язык** _(noun, en)_
   - Jeg lærer svenske.
   - Я учу шведский язык.

_verdict:_ `svenske`

### 151. iværksætte

- stratum: **general** · batch: batch-0053.json · rank 2621
- facts: pos `verb` · gender `null` · IPA `[iˈvæɐ̯gˌsεdə]`
- pronunciation: **ивэ́рксэдэ**

1. **начинать, запускать** _(verb)_
   - Vi skal iværksætte projektet nu.
   - Мы должны запустить проект сейчас.

_verdict:_ `iværksætte`

### 152. krise

- stratum: **general** · batch: batch-0025.json · rank 1231
- facts: pos `noun` · gender `en` · definite `krisen` · IPA `[ˈkʁiːsə]`
- pronunciation: **кри́исэ**

1. **кризис** _(noun, en)_
   - Landet er i en dyb krise.
   - Страна находится в глубоком кризисе.

_verdict:_ `krise`

### 153. musiker

- stratum: **general** · batch: batch-0028.json · rank 1373
- facts: pos `noun` · gender `en` · definite `musikeren` · IPA `[ˈmuˀsigʌ]`
- pronunciation: **му́сиго**

1. **музыкант** _(noun, en)_
   - Han er en dygtig musiker.
   - Он талантливый музыкант.

_verdict:_ `musiker`

### 154. skønt

- stratum: **general** · batch: batch-0052.json · rank 2595
- facts: pos `conjunction` · gender `null` · IPA `[ˌsgœnˀd]`
- pronunciation: **скёнт**

1. **хотя, несмотря на то что** _(conjunction)_
   - Skønt det regnede, gik vi en tur.
   - Хотя шёл дождь, мы пошли на прогулку.

_verdict:_ `skønt`

### 155. person

- stratum: **general** · batch: batch-0006.json · rank 272
- facts: pos `noun` · gender `en` · definite `personen` · IPA `[pæɐ̯ˈsoˀn]`
- pronunciation: **пэасо́н**

1. **человек** _(noun, en)_
   - Der var kun én person i rummet.
   - В комнате был только один человек.

_verdict:_ `person`

### 156. centrum

- stratum: **general** · batch: batch-0029.json · rank 1408
- facts: pos `noun` · gender `et` · IPA `[ˈsεntʁɔm]`
- pronunciation: **сэ́нтром**

1. **центр города** _(noun, et)_
   - Vi bor tæt på centrum.
   - Мы живем недалеко от центра.
2. **центр, средоточие чего-либо** _(noun, et)_
   - Han vil altid være i centrum.
   - Он всегда хочет быть в центре внимания.

_verdict:_ `centrum`

### 157. tilsammen

- stratum: **general** · batch: batch-0049.json · rank 2428
- facts: pos `adverb` · gender `null` · IPA `[teˈsɑmˀən]`
- pronunciation: **тэса́мэн**

1. **вместе, в общей сложности** _(adverb)_
   - Vi er ti personer tilsammen.
   - Нас всего десять человек.

_verdict:_ `tilsammen`

### 158. forklaring

- stratum: **general** · batch: batch-0016.json · rank 773
- facts: pos `noun` · gender `en` · definite `forklaringen` · IPA `[fʌˈklɑˀeŋ]`
- pronunciation: **фокла́аринг**

1. **объяснение** _(noun, en)_
   - Han gav en god forklaring.
   - Он дал хорошее объяснение.

_verdict:_ `forklaring`

### 159. styre

- stratum: **general** · batch: batch-0019.json · rank 934
- facts: pos `verb` · gender `null` · IPA `[ˈsdyːʌ]`
- pronunciation: **сдю́эа**

1. **управлять, руководить** _(verb)_
   - Han styrer bilen meget sikkert.
   - Он очень уверенно управляет машиной.
2. **сдерживаться, совладать с собой** _(verb)_
   - Hun kunne ikke styre sig og lo højt.
   - Она не смогла сдержаться и громко рассмеялась.

_verdict:_ `styre`

### 160. tone

- stratum: **general** · batch: batch-0030.json · rank 1470
- facts: pos `noun` · gender `en` · definite `tonen` · IPA `[ˈtoːnə]`
- pronunciation: **то́онэ**

1. **тон, звук** _(noun, en)_
   - Hun sang en ren tone.
   - Она спела чистую ноту.
2. **тон, манера речи** _(noun, en)_
   - Han talte i en hård tone.
   - Он говорил в жестком тоне.

_verdict:_ `tone`

### 161. forhold

- stratum: **general** · batch: batch-0004.json · rank 167
- facts: pos `noun` · gender `et` · definite `forholdet` · IPA `[ˈfɒːˌhʌlˀ]`
- pronunciation: **фо́охол**

1. **отношения** _(noun, et)_
   - De har et godt forhold.
   - У них хорошие отношения.
2. **обстоятельства, условия** _(noun, et)_
   - Vi arbejder under svære forhold.
   - Мы работаем в тяжёлых условиях.

_verdict:_ `forhold`

### 162. arabisk

- stratum: **general** · batch: batch-0032.json · rank 1578
- facts: pos `adjective` · gender `null` · IPA `[ɑˈʁɑˀbisg]`
- pronunciation: **ара́биск**

1. **арабский** _(adjective)_
   - Han lærer arabisk sprog.
   - Он учит арабский язык.

_verdict:_ `arabisk`

### 163. nordisk

- stratum: **general** · batch: batch-0021.json · rank 1013
- facts: pos `adjective` · gender `null` · IPA `[ˈnoɐ̯disg]`
- pronunciation: **но́адиск**

1. **северный, скандинавский** _(adjective)_
   - Danmark er et nordisk land.
   - Дания — скандинавская страна.

_verdict:_ `nordisk`

### 164. pige

- stratum: **general** · batch: batch-0008.json · rank 396
- facts: pos `noun` · gender `en` · definite `pigen` · IPA `[ˈpiːə]`
- pronunciation: **пи́иэ**

1. **девочка, девушка** _(noun, en)_
   - Pigen leger i parken.
   - Девочка играет в парке.

_verdict:_ `pige`

### 165. ærlig

- stratum: **general** · batch: batch-0036.json · rank 1784
- facts: pos `adjective` · gender `null` · IPA `[ˈæɐ̯li]`
- pronunciation: **э́али**

1. **честный** _(adjective)_
   - Det er vigtigt at være ærlig.
   - Важно быть честным.

_verdict:_ `ærlig`

### 166. halvanden

- stratum: **general** · batch: batch-0031.json · rank 1504
- facts: pos `adjective` · gender `null` · IPA `[halˈanən]`
- pronunciation: **хала́нэн**

1. **полтора** _(adjective)_
   - Det tager halvanden time.
   - Это занимает полтора часа.

_verdict:_ `halvanden`

### 167. gerne

- stratum: **general** · batch: batch-0004.json · rank 189
- facts: pos `adverb` · gender `null` · IPA `[ˈgæɐ̯nə]`
- pronunciation: **гэ́анэ**

1. **охотно, с удовольствием** _(adverb)_
   - Jeg vil gerne have kaffe.
   - Я хотел бы кофе.

_verdict:_ `gerne`

### 168. praktisere

- stratum: **general** · batch: batch-0048.json · rank 2394
- facts: pos `verb` · gender `null` · IPA `[pʁɑgtiˈseˀʌ]`
- pronunciation: **прагтисэ́эа**

1. **практиковать** _(verb)_
   - Hun praktiserer som læge.
   - Она практикует как врач.
2. **применять на практике** _(verb)_
   - De praktiserer nye metoder.
   - Они применяют на практике новые методы.

_verdict:_ `praktisere`

### 169. alt

- stratum: **general** · batch: batch-0005.json · rank 238
- facts: pos `adverb` · gender `null` · IPA `[ˈalˀd]`
- pronunciation: **алд**

1. **слишком, чересчур** _(adverb)_
   - Det er alt for dyrt.
   - Это слишком дорого.

_verdict:_ `alt`

### 170. opmærksom

- stratum: **general** · batch: batch-0020.json · rank 979
- facts: pos `adjective` · gender `null` · IPA `[ʌbˈmæɐ̯gˌsʌmˀ]`
- pronunciation: **обмэ́агсом**

1. **внимательный** _(adjective)_
   - Vær opmærksom på trafikken.
   - Будь внимателен к движению.

_verdict:_ `opmærksom`

### 171. kontrakt

- stratum: **general** · batch: batch-0021.json · rank 1021
- facts: pos `noun` · gender `en` · definite `kontrakten` · IPA `[kɔnˈtʁɑgd]`
- pronunciation: **контра́гд**

1. **контракт, договор** _(noun, en)_
   - Vi har underskrevet en kontrakt.
   - Мы подписали контракт.

_verdict:_ `kontrakt`

### 172. østlig

- stratum: **general** · batch: batch-0053.json · rank 2649
- facts: pos `adjective` · gender `null` · IPA `[ˈøsdli]`
- pronunciation: **ёстли**

1. **восточный** _(adjective)_
   - Vi rejste mod den østlige del af landet.
   - Мы поехали в восточную часть страны.

_verdict:_ `østlig`

### 173. fællesskab

- stratum: **general** · batch: batch-0022.json · rank 1078
- facts: pos `noun` · gender `et` · definite `fællesskabet` · IPA `[ˈfεlˀəsˌsgæˀb]`
- pronunciation: **фэ́лэсгэб**

1. **сообщество, чувство общности** _(noun, et)_
   - Vi har et stærkt fællesskab i klubben.
   - У нас сильное чувство общности в клубе.

_verdict:_ `fællesskab`

### 174. umiddelbar

- stratum: **general** · batch: batch-0016.json · rank 758
- facts: pos `adjective` · gender `null` · IPA `[ˈuˌmiðˀəlˌbɑˀ]`
- pronunciation: **у́ми́дэлба**

1. **непосредственный, немедленный** _(adjective)_
   - Der er ingen umiddelbar fare.
   - Непосредственной опасности нет.

_verdict:_ `umiddelbar`

### 175. kritisk

- stratum: **general** · batch: batch-0022.json · rank 1065
- facts: pos `adjective` · gender `null` · IPA `[ˈkʁidisg]`
- pronunciation: **кри́диск**

1. **критический** _(adjective)_
   - Han er meget kritisk over for planen.
   - Он очень критически относится к плану.
2. **опасный, решающий** _(adjective)_
   - Situationen er kritisk.
   - Ситуация критическая.

_verdict:_ `kritisk`

### 176. test

- stratum: **general** · batch: batch-0037.json · rank 1827
- facts: pos `noun` · gender `en` · definite `testen` · IPA `[ˈtεsd]`
- pronunciation: **тэст**

1. **тест** _(noun, en)_
   - Vi skal have en test i matematik.
   - У нас будет тест по математике.

_verdict:_ `test`

### 177. skylde

- stratum: **general** · batch: batch-0010.json · rank 478
- facts: pos `verb` · gender `null` · IPA `[ˈsgylə]`
- pronunciation: **сгю́лэ**

1. **быть должным** _(verb)_
   - Jeg skylder dig penge.
   - Я должен тебе денег.

_verdict:_ `skylde`

### 178. undervejs

- stratum: **general** · batch: batch-0024.json · rank 1186
- facts: pos `adverb` · gender `null` · IPA `[ɔnʌˈvɑjˀs]`
- pronunciation: **оновайс**

1. **по пути** _(adverb)_
   - Jeg køber mælk undervejs.
   - Я куплю молоко по пути.

_verdict:_ `undervejs`

### 179. hilse

- stratum: **general** · batch: batch-0040.json · rank 1988
- facts: pos `verb` · gender `null` · IPA `[ˈhilsə]`
- pronunciation: **хи́лсэ**

1. **приветствовать** _(verb)_
   - Vi skal hilse på de nye naboer.
   - Мы должны поприветствовать новых соседей.
2. **передавать привет** _(verb)_
   - Hilse din mor fra mig.
   - Передавай привет своей маме от меня.

_verdict:_ `hilse`

### 180. demokratisk

- stratum: **general** · batch: batch-0020.json · rank 982
- facts: pos `adjective` · gender `null` · IPA `[demoˈkʁɑˀdisg]`
- pronunciation: **дэмокра́диск**

1. **демократический** _(adjective)_
   - Danmark er et demokratisk land.
   - Дания — демократическая страна.

_verdict:_ `demokratisk`

### 181. hjælpe

- stratum: **general** · batch: batch-0007.json · rank 314
- facts: pos `verb` · gender `null` · IPA `[ˈjεlbə]`
- pronunciation: **йэ́лбэ**

1. **помогать** _(verb)_
   - Kan du hjælpe mig?
   - Ты можешь мне помочь?

_verdict:_ `hjælpe`

### 182. vel

- stratum: **general** · batch: batch-0009.json · rank 426
- facts: pos `adverb` · gender `null` · IPA `[ˈvεl]`
- pronunciation: **вэл**

1. **наверное, вероятно** _(adverb)_
   - Du kommer vel i morgen?
   - Ты, наверное, придёшь завтра?
2. **ведь, не так ли** _(adverb)_
   - Det er vel ikke så svært.
   - Это ведь не так сложно.

_verdict:_ `vel`

### 183. ekstraordinær

- stratum: **general** · batch: batch-0047.json · rank 2340
- facts: pos `adjective` · gender `null` · IPA `[ˈɛɡ̊stˢʁ̥ɑɒd̥iˌnɛɐ̯ˀ]`
- pronunciation: **_(null)_**

1. **чрезвычайный** _(adjective)_
   - Det var en ekstraordinær indsats.
   - Это были чрезвычайные усилия.

_verdict:_ `ekstraordinær`

### 184. årevis

- stratum: **general** · batch: batch-0041.json · rank 2020
- facts: pos `adjective` · gender `null` · IPA `[ˈɒːɒˌviˀs]`
- pronunciation: **о́оави́с**

1. **многолетний** _(adjective)_
   - Det har taget årevis at bygge.
   - На строительство ушли годы.

_verdict:_ `årevis`

### 185. sænke

- stratum: **general** · batch: batch-0034.json · rank 1661
- facts: pos `verb` · gender `null` · IPA `[ˈsεŋgə]`
- pronunciation: **сэ́нгэ**

1. **опускать** _(verb)_
   - Han sænkede hovedet.
   - Он опустил голову.
2. **снижать** _(verb)_
   - De vil sænke priserne.
   - Они хотят снизить цены.

_verdict:_ `sænke`

### 186. dans

- stratum: **general** · batch: batch-0036.json · rank 1786
- facts: pos `noun` · gender `en` · definite `dansen` · IPA `[ˈdanˀs]`
- pronunciation: **данс**

1. **танец** _(noun, en)_
   - De danser en flot dans.
   - Они танцуют красивый танец.

_verdict:_ `dans`

### 187. offentlig

- stratum: **general** · batch: batch-0006.json · rank 277
- facts: pos `adjective` · gender `null` · IPA `[ˈʌfəndli]`
- pronunciation: **о́фэнтли**

1. **общественный, публичный** _(adjective)_
   - Det er en offentlig park.
   - Это общественный парк.

_verdict:_ `offentlig`

### 188. først

- stratum: **general** · batch: batch-0004.json · rank 170
- facts: pos `adverb` · gender `null` · IPA `[ˈfɶɐ̯sd]`
- pronunciation: **фё́аст**

1. **сначала** _(adverb)_
   - Spis først, og gå så ud.
   - Сначала поешь, а потом выходи.
2. **только, лишь** _(adverb)_
   - Han kommer først i morgen.
   - Он приедет только завтра.

_verdict:_ `først`

### 189. kombinere

- stratum: **general** · batch: batch-0038.json · rank 1874
- facts: pos `verb` · gender `null` · IPA `[kʌmbiˈneˀʌ]`
- pronunciation: **комбинэ́эа**

1. **сочетать** _(verb)_
   - Man kan kombinere arbejde og fritid.
   - Можно сочетать работу и свободное время.

_verdict:_ `kombinere`

### 190. bold

- stratum: **general** · batch: batch-0026.json · rank 1273
- facts: pos `noun` · gender `en` · definite `bolden` · IPA `[ˈbʌlˀd]`
- pronunciation: **болд**

1. **мяч** _(noun, en)_
   - Drengen sparker til en bold.
   - Мальчик пинает мяч.

_verdict:_ `bold`

### 191. virkelig

- stratum: **general** · batch: batch-0011.json · rank 507
- facts: pos `adverb` · gender `null` · IPA `[ˈviɐ̯gəli]`
- pronunciation: **ви́агэли**

1. **действительно, очень** _(adverb)_
   - Det var virkelig sjovt.
   - Это было действительно весело.
2. **настоящий, реальный** _(adjective)_
   - Er det en virkelig historie?
   - Это настоящая история?

_verdict:_ `virkelig`

### 192. forløbe

- stratum: **general** · batch: batch-0053.json · rank 2628
- facts: pos `verb` · gender `null` · IPA `[fʌˈløˀbə]`
- pronunciation: **фолёбэ**

1. **протекать, проходить** _(verb)_
   - Mødet forløb uden problemer.
   - Встреча прошла без проблем.

_verdict:_ `forløbe`

### 193. alting

- stratum: **general** · batch: batch-0047.json · rank 2320
- facts: pos `pronoun` · gender `null` · IPA `[ˈalˀˌteŋˀ]`
- pronunciation: **а́лти́нг**

1. **всё** _(pronoun)_
   - Alting bliver godt igen.
   - Всё снова будет хорошо.

_verdict:_ `alting`

### 194. beskytte

- stratum: **general** · batch: batch-0024.json · rank 1172
- facts: pos `verb` · gender `null` · IPA `[beˈsgødə]`
- pronunciation: **бэсгё́дэ**

1. **защищать** _(verb)_
   - Vi skal beskytte naturen.
   - Мы должны защищать природу.

_verdict:_ `beskytte`

### 195. genkende

- stratum: **general** · batch: batch-0045.json · rank 2228
- facts: pos `verb` · gender `null` · IPA `[ˈgεnˌkεnˀə]`
- pronunciation: **гэ́нкэ́нэ**

1. **узнавать** _(verb)_
   - Jeg kunne ikke genkende ham med det samme.
   - Я не смог узнать его сразу.
2. **распознавать** _(verb)_
   - Computeren kan genkende ansigter.
   - Компьютер может распознавать лица.

_verdict:_ `genkende`

### 196. fjerne

- stratum: **general** · batch: batch-0016.json · rank 787
- facts: pos `verb` · gender `null` · IPA `[ˈfjæɐ̯nə]`
- pronunciation: **фья́анэ**

1. **убирать, удалять** _(verb)_
   - Kan du fjerne bordet?
   - Можешь убрать стол?

_verdict:_ `fjerne`

### 197. temperatur

- stratum: **general** · batch: batch-0043.json · rank 2145
- facts: pos `noun` · gender `en` · definite `temperaturen` · IPA `[tεmbʁɑˈtuɐ̯ˀ]`
- pronunciation: **тэмбрату́а**

1. **температура** _(noun, en)_
   - Temperaturen stiger i dag.
   - Температура сегодня повышается.
2. **жар, высокая температура тела** _(noun, en)_
   - Barnet har høj temperatur.
   - У ребенка высокая температура.

_verdict:_ `temperatur`

### 198. bag

- stratum: **general** · batch: batch-0006.json · rank 283
- facts: pos `preposition` · gender `null` · IPA `[ˈbæˀ]`
- pronunciation: **бэ**

1. **за, позади** _(preposition)_
   - Bilen står bag huset.
   - Машина стоит за домом.

_verdict:_ `bag`

### 199. inspirere

- stratum: **general** · batch: batch-0025.json · rank 1203
- facts: pos `verb` · gender `null` · IPA `[ensbiˈʁεˀʌ]`
- pronunciation: **энсбирэ́эа**

1. **вдохновлять** _(verb)_
   - Hun inspirerer mig meget.
   - Она меня очень вдохновляет.

_verdict:_ `inspirere`

### 200. alvorlig

- stratum: **general** · batch: batch-0010.json · rank 481
- facts: pos `adjective` · gender `null` · IPA `[alˈvɒˀli]`
- pronunciation: **алво́ли**

1. **серьёзный** _(adjective)_
   - Det er et alvorligt problem.
   - Это серьёзная проблема.

_verdict:_ `alvorlig`

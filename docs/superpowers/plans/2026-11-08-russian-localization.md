# Russian Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Russian (`ru`) as the phone app's second translated language, with correct Russian plurals, the system font for Russian text, and the same generate → safety-check → ship pipeline as Simplified Chinese.

**Architecture:** Generalise the zh-only i18n code into a small per-language table (`Lang = 'en' | 'zh-Hans' | 'ru'`). Russian strings and catalog names live in files mirroring the zh-Hans ones. Russian plurals are stored as `key_one/_few/_many/_other` and chosen by a pure plural rule from a per-key declared count variable. The translation script gains a per-language config; Russian adds a Cyrillic output check, a length allowance and a deny-list scan.

**Tech Stack:** Expo SDK 57 / React Native (Hermes), TypeScript, `node --test` with type stripping (Node 24), expo-localization, DeepSeek API (`deepseek-flash`).

**Spec:** `docs/superpowers/specs/2026-11-08-russian-localization-design.md`, which extends `docs/superpowers/specs/2026-11-05-localization-design.md`. Read both.

## Global Constraints

- English and Simplified Chinese output must not change: every existing test keeps passing unedited (except tests that assert the `Lang` union or zh-only signatures, which may be widened, not weakened), and no zh-Hans key, value or state entry changes.
- Russian only when the first preferred locale's primary language subtag is `ru` (any region or script). Every other language, including uk, be, kk, ky, uz, ka, hy, az, ro, falls back to `en`.
- Stored data never changes: database, backups, CSV/JSON exports, export file names stay English/raw. Custom exercises always show what the user typed.
- Any Russian string without a translation, with mismatched placeholders, or missing a plural form needed for the current count falls back to English for that string.
- Font: when the language is `ru`, text that would use Space Grotesk (`font.displayBold`, `font.titleSemi`, `font.bodyMedium`, `font.bodyRegular`) uses the platform system font at the matching weight (700 / 600 / 500 / 400). JetBrains Mono stays. English and Chinese keep Space Grotesk. No new font file is bundled.
- Watch, Wear OS, widgets, Live Activity and notification chrome stay English; how-to steps stay English.
- Never print, log or commit `DEEPSEEK_API_KEY`. Run the script as `source ~/.zshrc >/dev/null 2>&1; cd frontend && NODE_USE_ENV_PROXY=1 node scripts/i18n/translate.mjs --lang ru …`.
- No Co-Authored-By or any AI attribution in commit messages. Never name competitor apps anywhere.
- Commits reference nothing that closes #136 (no "Closes/Fixes #136").

## Review Focus

1. A count of 0, 11–14, 21, 111, or a fractional count (e.g. 2.5 kg-like values passed as `count`) — Russian must pick `many`/`one`/`other` per the rule, never crash; fractional → `other`. Pinned in Task 1.
2. A plural key where the Russian file has only some forms (e.g. `_one` and `_other` but no `_few`) — count 3 must render English, not the wrong Russian form. Pinned in Task 1.
3. A phone whose first locale is `uk-UA` but second is `ru-RU` — must be English (first tag decides). Pinned in Task 1.
4. Module evaluation order: a style module evaluated before `src/i18n/index.ts` sets the language would bake in Space Grotesk for Russian. Pinned in Task 4 (test that `app/_layout.tsx` imports `../src/i18n` before any theme/screen import, and that `themed()` styles built after `setLang('ru')` carry the system font).
5. A Russian translation that adds a country/nationality/political word absent from the English (e.g. an exercise name rendered with «русский»/«украинский»/«советский») — must be flagged by the deny-list scan and not ship unless cleared. Pinned in Task 5.

---

### Task 1: Multi-language i18n core and Russian plural rule

**Files:**
- Modify: `frontend/src/i18n/locale.ts`, `translate.ts`, `t.ts`, `catalogNames.ts`, `frontend/src/data/labels.ts`
- Create: `frontend/src/i18n/plural.ts`, `frontend/src/i18n/strings/ru.json` (`{}`), `frontend/src/i18n/catalog/ru.json` (`{"exercises":{},"muscles":{},"categories":{},"groups":{},"equipment":{}}`), `frontend/src/i18n/ru.state.json` (`{}`)
- Test: `frontend/src/i18n/plural.test.ts`, extend `locale.test.ts`, `translate.test.ts`, `catalogNames.test.ts`, `frontend/src/data/labels.test.ts` (create if absent)

**Interfaces:**
- Produces:
  - `type Lang = 'en' | 'zh-Hans' | 'ru'` (locale.ts)
  - `resolveLang(tags: readonly string[]): Lang` — adds: primary subtag `ru` → `'ru'`.
  - `type PluralCategory = 'one' | 'few' | 'many' | 'other'`; `ruPlural(n: number): PluralCategory` (plural.ts). Rule: non-integer → `other`; `n%10===1 && n%100!==11` → `one`; `n%10 in 2..4 && n%100 not in 12..14` → `few`; otherwise `many`. Negative numbers use `Math.abs`.
  - `type StringDef = { en: string; note: string; plural?: string }` — `plural` names the count variable for keys that have no `_one/_other` pair (filled in Task 2).
  - `createTranslator(lang: Lang, tables: Partial<Record<Exclude<Lang,'en'>, Record<string,string>>>, en: Record<string, StringDef>): (key, vars?) => string` — replaces the zh-only second parameter. zh-Hans behaviour identical to today. For `ru`: if the key is a plural key (an `en[key+'_one']`/`en[key+'_other']` pair exists, or `en[key].plural` is set) and `vars[countVar]` is a number (countVar = `en[key].plural ?? 'count'`), look up `${key}_${ruPlural(n)}` in the ru table; if absent or placeholders differ from the English it was translated from (`en[key+'_one']` for `_one`, else `en[key+'_other'] ?? en[key]`), fall back to English. Non-plural keys: ru table by key, same placeholder check, else English.
  - `t(key, vars?)` binds `{ 'zh-Hans': zh, ru }`.
  - catalogNames: `exerciseLabel`, `muscleLabel`, `categoryLabel`, `groupLabel`, `equipmentLabel`, `muscleNameLabel` keep their signatures and pick the table for `lang` (zh-Hans or ru); `en` returns stored.
  - labels.ts: `compareLabels('ru')` uses `new Intl.Collator('ru')`; `indexLetter(label, 'ru')` returns the uppercased first character (Cyrillic or Latin).
- Consumes: nothing new.

- [ ] **Step 1: Write failing tests**
  - `plural.test.ts`: `ruPlural` → 1,21,101 `one`; 2,3,4,22,24,102 `few`; 0,5,11,12,14,25,111,112 `many`; 1.5, 2.5 `other`; -1 `one`.
  - `locale.test.ts`: `['ru-RU']`,`['ru']`,`['ru-UA']`,`['ru-KZ']`,`['ru-Cyrl-RU']` → `ru`; `['uk-UA']`,`['uk-UA','ru-RU']`,`['be-BY']`,`['kk-KZ']`,`['ky']`,`['uz']`,`['ka']`,`['hy']`,`['az']`,`['ro-MD']`,`['sr-Cyrl']` → `en`; all existing zh cases unchanged.
  - `translate.test.ts` (ru): with en `{ 'x_one': '{count} set', 'x_other': '{count} sets', 'y': '{count} workouts' (plural:'count'), 'z': '{n} left' (plural:'n'), 'w': 'Hello {name}' }` and ru `{ x_one:'{count} подход', x_few:'{count} подхода', x_many:'{count} подходов', x_other:'{count} подхода', y_one…, z_few:'Осталось {n}', w:'Привет, {name}' }`: count 1/3/5/2.5 pick one/few/many/other; `z` with n=3 → Russian, n=5 (no `_many`) → `'5 left'`; `w` interpolates; ru string with wrong placeholder → English; key missing in ru → English; `t('y')` without vars → English bare string. Existing zh tests unchanged.
  - `catalogNames.test.ts`: with a ru catalog fixture, `exerciseLabel` returns Russian for a catalog exercise, stored name for a renamed one and for `isCustom`; `matchesSearch('ёлочка', ['Елочка'])` and `matchesSearch('ЖИМ', ['Жим лёжа'])` true.
  - `labels.test.ts`: `sortByName` in ru orders `['Жим','Армейский жим','Бёрпи']` as Армейский, Бёрпи, Жим; `indexLetter('жим','ru') === 'Ж'`.
- [ ] **Step 2:** `cd frontend && node --test src/i18n/*.test.ts src/data/labels.test.ts` → new tests FAIL.
- [ ] **Step 3:** Implement the interfaces above. Keep `t.ts`, `catalogNames.ts` pure (JSON imports only).
- [ ] **Step 4:** `npm test` and `npx tsc --noEmit` → all pass (existing zh/en tests untouched).
- [ ] **Step 5:** Commit `feat(i18n): multi-language core with Russian plurals`.

### Task 2: Declare count variables on single-form count strings

**Files:**
- Modify: `frontend/src/i18n/strings/en.ts`
- Test: `frontend/src/i18n/strings.test.ts`

**Interfaces:**
- Consumes: `StringDef.plural` (Task 1).
- Produces: every en.ts entry whose English counts things through a placeholder, and that has no `_one/_other` pair, carries `plural: '<varName>'`. Call sites unchanged. English text and notes unchanged except appending nothing. zh-Hans untouched.

- [ ] **Step 1: Write failing tests** in `strings.test.ts`:
  - `plural` names a placeholder present in that entry's `en` text.
  - No key has both a `_one/_other` pair and `plural`.
  - A fixed list of known count keys has `plural`: `home.exerciseCount` → `count`, `history.count` → `count`, and the `{n} REPS LEFT`-style key (find its exact key) → `n`. Add the others you tag in Step 3 to this list.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Go through every en.ts entry with a placeholder (~113). Tag `plural` only where the number counts things the Russian noun must agree with (sets, reps, workouts, exercises, routines, days, weeks, minutes, changes, profiles…). Do not tag weights, percentages, dates, versions, ordinal positions ("Set {n}" as a label), or strings where the number is not followed/preceded by a counted noun. Check the call site passes a number for that variable; if a call site passes a preformatted string, do not tag it and list it in your report.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit` → pass.
- [ ] **Step 5:** Commit `feat(i18n): declare count variables for Russian plurals`.

### Task 3: Russian dates

**Files:**
- Modify: `frontend/src/lib/format.ts`
- Test: `frontend/src/lib/format.test.ts`

**Interfaces:**
- Consumes: `Lang` incl. `'ru'` (Task 1).
- Produces: every `fmt*` function that takes `lang` returns Russian for `'ru'`; English and zh output unchanged. Hand-written tables (like the zh ones), not `Intl.DateTimeFormat`: month names in genitive for day+month («8 ноября»), nominative for month+year («Ноябрь 2026»); weekday short forms Пн Вт Ср Чт Пт Сб Вс; full weekdays lowercase mid-sentence. Relative phrases («сегодня», «вчера», «5 дней назад») that today come from hand-written zh literals in `format.ts` are hand-written the same way for ru, using `ruPlural` for counted units; phrases that already come from `t()` keys are left to the pipeline. No new `t()` keys in this task (a new key would show English to Chinese users). Week initials (7 separate keys today) get ru translations via the pipeline, not code.

- [ ] **Step 1: Write failing tests** for `'ru'` on 2026-11-08 (Sunday) and 2026-05-01: `fmtHeaderDate`, `fmtShortDayUpper`, `fmtWorkoutDate`, `fmtDateOnly`, `fmtMonthYear`, `fmtShortDay`, `fmtLongDay`, `fmtDayMonthOf`, `fmtHistoryGroupTitle`, `fmtAgo` — exact expected strings, e.g. `fmtDayMonthOf(2026-11-08,'ru') === '8 ноября'`, `fmtMonthYear('2026-05-01','ru') === 'Май 2026'`. Pick the exact format of each by mirroring what the English version shows (same fields, Russian order and case); write those expectations first.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement Russian tables in `format.ts` beside the zh ones.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit` → pass; zh and en date tests unchanged.
- [ ] **Step 5:** Commit `feat(i18n): Russian dates`.

### Task 4: System font for Russian

**Files:**
- Modify: `frontend/src/theme/tokens.ts`, `frontend/src/theme/live.ts`
- Create: `frontend/src/theme/fontForLang.ts`
- Test: `frontend/src/theme/fontForLang.test.ts`, `frontend/src/theme/live.test.ts` (extend), a layout-order test (e.g. `frontend/src/i18n/importOrder.test.ts`)

**Interfaces:**
- Consumes: `getLang()` (current.ts).
- Produces:
  - `systemFontFor(family: string, platform: 'ios' | 'android'): { fontFamily: string | undefined; fontWeight: '400'|'500'|'600'|'700' } | null` — for the four Space Grotesk families returns the system family (`'System'` on iOS, `'sans-serif'` on Android) and weight 700/600/500/400; `null` for any other family (JetBrains Mono, undefined).
  - `localizeFontStyles<T>(styles: T, lang: Lang, platform): T` — for `lang === 'ru'`, returns a copy where each style object with a Space Grotesk `fontFamily` gets the system family and weight (an explicit `fontWeight` already on the style wins); for other langs returns `styles` unchanged (same reference).
  - `themed(factory)` applies `localizeFontStyles` to the factory output (cache key unchanged; language is fixed for the app session).
  - `font.*` interface tokens stay the same strings (direct inline uses outside `themed` are listed in the report and converted to go through a style that `themed` builds, or wrapped with `localizeFontStyles`).

- [ ] **Step 1: Write failing tests**
  - `fontForLang.test.ts`: `systemFontFor('SpaceGrotesk_600SemiBold','ios')` → `{fontFamily:'System',fontWeight:'600'}`; android → `'sans-serif'`; `systemFontFor('JetBrainsMono_500Medium','ios')` → `null`; `localizeFontStyles({a:{fontFamily:'SpaceGrotesk_700Bold',fontSize:20}}, 'ru','ios')` → `{a:{fontFamily:'System',fontWeight:'700',fontSize:20}}`; same input with `'en'` and `'zh-Hans'` → identical reference; a style with explicit `fontWeight:'400'` keeps 400.
  - `live.test.ts`: after `setLang('ru')`, a `themed(() => ({t:{fontFamily:'SpaceGrotesk_400Regular'}}))` style reads `fontFamily === 'System'` (platform injectable or defaulting to ios under node); after resetting to `'en'` a freshly created themed style is unchanged.
  - Import-order test: read `app/_layout.tsx` source; the first import after `react-native-get-random-values` is `'../src/i18n'`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Get the platform from `react-native`'s `Platform.OS` only in a non-test entry (keep `live.ts` free of RN imports; inject platform or read it lazily from a setter called by `src/i18n/index.ts`).
- [ ] **Step 4:** `git grep -n "font\.\(displayBold\|titleSemi\|bodyMedium\|bodyRegular\)"` outside `themed(` factories: convert or wrap each so Russian gets the system font. `npm test`, `npx tsc --noEmit` → pass.
- [ ] **Step 5:** Commit `feat(i18n): system font for Russian text`.

### Task 5: Translation pipeline for Russian

**Files:**
- Modify: `frontend/scripts/i18n/core.mjs`, `translate.mjs`, `sources.mjs` (only if needed), `frontend/src/i18n/shipped.test.ts`, `frontend/app.json`
- Create: `frontend/scripts/i18n/langs.mjs`, `frontend/scripts/i18n/glossary.ru.json`, `frontend/scripts/i18n/denylist.ru.json`, `frontend/locales/ru.json` (copy of `locales/en.json`, the iOS fallback, same as zh started)
- Test: `frontend/scripts/i18n/core.test.js` (extend)

**Interfaces:**
- Consumes: en.ts `plural` (Task 2), ru file paths (Task 1).
- Produces:
  - `LANGS` (langs.mjs): per language `{ code, files: {ui, catalog, plist, state, glossary, review, denylist?}, promptLanguage, scriptRegex, lengthFactor, plural: 'none'|'ru' }`. zh-Hans entry reproduces today's values exactly (`/[㐀-鿿豈-﫿]/`, lengthFactor 1, plural `none`). ru: `promptLanguage: 'Russian'`, `scriptRegex: /[Ѐ-ӿ]/`, `lengthFactor: 1.35` (multiplies the note's "Max N characters" budget), plural `'ru'`.
  - `expandPlurals(items, lang)` (core.mjs): for `ru`, each plural key (pair or `plural`) becomes four items `key_one|_few|_many|_other`, English source = `_one` text for `_one`, `_other` text (or the single form) for the rest, note appended with `Russian plural form "<cat>": used for counts like <1, 21, 101 | 2, 3, 4, 22 | 0, 5, 11, 25 | 1.5>`. Non-plural items unchanged. zh: identity.
  - `checkOne`/`parseResponse` take the lang config: script check uses `scriptRegex` and reason `no <promptLanguage> characters in output`; overlong uses `Math.floor(max * lengthFactor)`.
  - `buildPrompt(batch, glossary, lang)`: language-specific header; ru rules: neutral polite UI register with «вы» (lowercase), no «ты»; standard Russian gym terminology; glossary terms mandatory; no country, nationality, region, flag, political or military words unless the English has them.
  - `denyHits(ru: string, en: string, denylist): string[]` — lowercase-stem matches from the list in the Russian string whose English counterpart (from the denylist entry's `en` stems) is absent. `denylist.ru.json`: stems for countries/nationalities (росси, русск, украин, белорус, казах, советск, ссср, америк, европ, …), politics/military (политик, войн, армейск is NOT included — «армейский жим» is a standard gym term; instead list: войн, военн, солдат, флаг, гимн, патриот, президент, партия, фашист, нацист, санкци, оккупац, …). Keep `армейский` explicitly allowed with a comment.
  - translate.mjs: `--lang zh-Hans|ru`; paths and checks from `LANGS`; review file entries carry `denyHits` when non-empty, and an entry with `denyHits` can only be applied as `ok` if the verdict entry has `"denyCleared": true` (otherwise refused).
  - shipped.test.ts: runs the same guard for every language in `LANGS` (state ok/manual, enHash matches current English source of that form, value hash matches).
  - app.json: `locales.ru = "./locales/ru.json"`, `CFBundleLocalizations` + `"ru"`, expo-localization `supportedLocales.ios` + `"ru"`, `.android` + `"ru"`.

- [ ] **Step 1: Write failing tests** in `core.test.js`: `expandPlurals` for a pair key and a `plural:'n'` key (4 items each, correct English source and note), zh identity; ru `checkOne` rejects Latin-only output for translatable English and accepts «Жим лёжа»; overlong budget 20 → 27 for ru, 20 for zh; `buildPrompt(…, ru)` contains `Russian` and `вы`; `denyHits('Русские скручивания','Russian Twist', list)` → `[]` (English has Russian) but `denyHits('Советский жим','Arnold Press', list)` → `['советск']`, `denyHits('Армейский жим','Military Press', list)` → `[]`; applyReview refuses a `denyHits` entry without `denyCleared`. Existing zh tests unchanged.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `glossary.ru.json` starts with the spec's terms (подход, повторение/повторения (short повт.), упражнение, тренировка, программа, разминочный подход, дроп-сет, подход до отказа, суперсет, личный рекорд; PR/RPE/1RM stay Latin; Ischys untranslated) plus extensions marked `extension: true` mirroring the zh glossary's extended terms (rest = отдых, rest timer = таймер отдыха, volume = объём, bodyweight = собственный вес, muscle group = группа мышц, plate calculator = калькулятор блинов, history = история).
- [ ] **Step 4:** `node scripts/i18n/translate.mjs --lang ru --dry-run` prints the item count and a sample prompt without network; `npm test`, `npx tsc --noEmit` → pass.
- [ ] **Step 5:** Commit `feat(i18n): Russian translation pipeline`.

### Task 6: Generate and safety-check Russian (controller-run)

Run by the coordinator, not an implementer subagent (it spends API credit and dispatches reviewers).

- [ ] **Step 1:** `--lang ru` real run. Record cost, counts, script rejections.
- [ ] **Step 2:** Split the review file into batches; dispatch back-translation reviewers (opus) with the Chinese review brief adapted to Russian: back-translate, mark `ok`/`flagged` with reason; flag offensive, political, nationalist, slang, crude, wrong meaning, wrong plural form for its category, «ты», or suspiciously long. Deny-list hits get an explicit decision (`denyCleared: true` only if the word is in the English or is a standard gym term).
- [ ] **Step 3:** Apply verdicts; `--retry-flagged` once; review the retries; apply. Anything still flagged stays English.
- [ ] **Step 4:** `npm test` (shipped guard) → pass. Commit `feat(i18n): Russian translations`. Write the safety report (flagged lines and outcome) to `frontend/.i18n-review/report.ru.md` (gitignored) for the owner.

### Task 7: Russian layout pass

**Files:** whatever the fixes touch (string shortening via the pipeline preferred; layout only where shortening cannot work).

- [ ] **Step 1:** In the iOS simulator (see the owner's memory `simulator-testing-setup.md`: Metro on 8082, `RCT_jsLocation`), set the app to Russian (`defaults write app.ischys.mobile AppleLanguages -array ru`), and screenshot every screen, sheet and dialog reachable in the app, light and dark for Home and the workout screen. Check: no clipped/overflowing/ellipsised text that matters, system font in use for interface text, plurals read right (0, 1, 2, 5, 21 where visible), dates.
- [ ] **Step 2:** For each clipped string: add a tighter "Max N characters" to its en.ts note (note change re-queues only that key), re-run the script for those keys, review, apply. Layout change only if no acceptable shorter Russian exists.
- [ ] **Step 3:** Android emulator spot-check: Home, workout, exercise library, settings, history in Russian.
- [ ] **Step 4:** English and Chinese smoke check on iOS: Home and the workout screen unchanged (Space Grotesk, same text).
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit` → pass. Commit `fix(i18n): Russian layout fixes`.

Release (4.6 on iOS and Android) is outside this plan; it follows the owner's release steps after merge.

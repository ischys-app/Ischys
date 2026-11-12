# Greek and Spanish Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Greek (`el`) and Spanish (`es`) as app languages, offered both through the phone's first language and through the in-app Language setting. They use the same generate, safety-check and ship pipeline as Russian.

**Architecture:**
- Widen `Lang` to `'en' | 'zh-Hans' | 'ru' | 'el' | 'es'`.
- Turn the remaining ru-only branches into per-language data: a plural rule per language, a set of languages that use the system font, a set that uses comma decimals, and the collator locales.
- Greek and Spanish use a one/other plural rule.
- A text-keyed `upperDisplay()` helper produces accent-free Greek capitals wherever the app shows text in capitals.
- The translation script gains el and es configurations.

**Tech Stack:** Expo SDK 57 / React Native (Hermes), TypeScript, `node --test` with type stripping (Node 24), DeepSeek API (`deepseek-flash`).

**Spec:** `docs/superpowers/specs/2026-11-10-greek-spanish-localization-design.md`, which extends `2026-11-08-russian-localization-design.md` and `2026-11-05-localization-design.md`. Read all three. The Russian plan (`docs/superpowers/plans/2026-11-08-russian-localization.md`) shows how each piece was built for ru.

## Global Constraints

- English, Simplified Chinese and Russian output must stay byte-identical. Every existing test keeps passing unedited, except tests that assert the `Lang` union, `APP_LANGS` or the iOS/Android locale lists; those may be widened, never weakened. No zh-Hans or ru key, value or state entry changes.
- `el` or `es` applies only when the first preferred locale's primary subtag is `el` or `es` (any region), or when the Language setting picks it. Catalan (`ca`), Galician (`gl`), Basque (`eu`), Portuguese (`pt`) and every other language map to `en`.
- iOS is JS-only: `el` and `es` never go into `CFBundleLocalizations`, `expo.locales` or expo-localization `supportedLocales.ios`. Android `supportedLocales.android` adds `el` and `es`. No `locales/el.json` or `locales/es.json`.
- Stored data never changes. The database, backups, CSV/JSON exports, input pre-fills and Watch/widget/Live Activity payload formats stay as they are.
- Any el/es string that is missing, has mismatched placeholders, or lacks the plural form a count needs falls back to English for that string.
- Font: in `el`, text that would use Space Grotesk uses the platform system font at the matching weight, exactly as in `ru`. `es` keeps Space Grotesk. JetBrains Mono stays everywhere.
- Greek all-caps display text carries no tonos. `upperDisplay(text)` maps ά έ ή ί ό ύ ώ → Α Ε Η Ι Ο Υ Ω, ΐ → Ϊ, ΰ → Ϋ, keeps ϊ ϋ → Ϊ Ϋ, and turns ς into Σ. Text with no Greek letters gives exactly `text.toUpperCase()`.
- Numbers display with a decimal comma and U+00A0 thousands grouping in `ru`, `el` and `es`: "1 199", "82,5".
- Language list order: System, English, Español, Ελληνικά, Русский, 简体中文.
- Never print, log or commit `DEEPSEEK_API_KEY`. Run the script as `source ~/.zshrc >/dev/null 2>&1; cd frontend && NODE_USE_ENV_PROXY=1 node scripts/i18n/translate.mjs --lang el|es …`.
- No Co-Authored-By or AI attribution in commits. Never name competitor apps. Never write "Closes/Fixes #136". Use "Refs #136".

## Review Focus

1. **A Greek label shown in capitals through `textTransform: 'uppercase'`** (a section title such as «Προπόνηση») must read ΠΡΟΠΟΝΗΣΗ, never ΠΡΟΠΌΝΗΣΗ. Pinned in Task 2 by a test that no `textTransform: 'uppercase'` remains in `src/` or `app/`, together with the `upperDisplay` table.
2. **A Greek translation of an all-caps English string** (for example "THIS WEEK") that DeepSeek returns with accents (ΑΥΤΉ ΤΗΝ ΕΒΔΟΜΆΔΑ) must not ship that way. Pinned in Task 6: the script normalises it with `upperDisplay`, and the shipped guard rejects all-caps words containing Ά Έ Ή Ί Ό Ύ Ώ.
3. **Count 1.5, 0 or 21 in Spanish or Greek** must pick `other`, `other` and `other` (only exactly 1 is `one`) and never crash. Pinned in Task 1.
4. **A Spanish search for "press banca"** must find «Press de banca», and a search for "pesa" must find «Pésa…». Greek «ασκηση» must find «Άσκηση», and «σ» must match final «ς». Pinned in Task 4.
5. **Español in the Language list while the app is in Greek or Russian** must draw in Space Grotesk, not the system font: only Greek, Cyrillic and Han names take the system font. Pinned in Task 3.

---

### Task 1: Core: languages, plural rule, tables, collators, native-locale guards

**Files:**
- Modify:
  - `frontend/src/i18n/locale.ts`, `plural.ts`, `translate.ts`, `t.ts`, `catalogNames.ts`
  - `frontend/src/lib/format.ts` (translator binding only)
  - `frontend/src/data/labels.ts`
  - `frontend/app.json`
- Create:
  - `frontend/src/i18n/strings/el.json` and `es.json` (`{}`)
  - `frontend/src/i18n/catalog/el.json` and `es.json` (same empty shape as `catalog/ru.json` started with)
  - `frontend/src/i18n/el.state.json` and `es.state.json` (`{}`)
- Test: extend `locale.test.ts`, `plural.test.ts`, `translate.test.ts`, `catalogNames.test.ts`, `nativeLocales.test.ts`, `src/data/labels.test.ts`

**Interfaces:**
- Produces:
  - `type Lang = 'en' | 'zh-Hans' | 'ru' | 'el' | 'es'`
  - `resolveLang(tags)` adds primary subtag `el` → `'el'` and `es` → `'es'`.
  - `APP_LANGS = ['en', 'es', 'el', 'ru', 'zh-Hans']`
  - `NATIVE_LANG_NAME` adds `es: 'Español'` and `el: 'Ελληνικά'`.
  - `oneOtherPlural(n: number): 'one' | 'other'` (plural.ts): `'one'` only when `n === 1`.
  - `pluralFor(lang: Lang): ((n: number) => PluralCategory) | null` returns `ruPlural` for ru, `oneOtherPlural` for el and es, and null for en and zh-Hans.
  - `createTranslator` takes the el and es tables. For el/es it uses the generalized form of today's `translateRu`: same pair/`plural` detection, same placeholder check, same English fallback, and `pluralFor(lang)` picks the form. ru behaviour is unchanged.
  - `t.ts`, the `catalogNames.ts` label functions and the `format.ts` translator binding all include el and es.
  - `compareLabels('el' | 'es')` uses `new Intl.Collator('el' | 'es')`.
  - `nativeLocales.test.ts`: none of ru, el or es appears in the three iOS lists. `supportedLocales.android` includes ru, el and es.

- [ ] **Step 1: Write failing tests**
  - `locale.test.ts`:
    - These map to `es`: `['es-ES']`, `['es-MX']`, `['es-AR']`, `['es-CO']`, `['es-419']`, `['es']`, `['es-US']`.
    - These map to `el`: `['el-GR']`, `['el-CY']`, `['el']`.
    - These map to `en`: `['ca-ES']`, `['gl-ES']`, `['eu-ES']`, `['pt-BR']`, `['en-US','es-ES']`.
    - `APP_LANGS` deep-equals `['en','es','el','ru','zh-Hans']`.
    - `parseLangPref('el') === 'el'` and `parseLangPref('es') === 'es'`.
  - `plural.test.ts`: `oneOtherPlural` gives 1 → one; 0, 2, 5, 21, 1.5 and -1 → other.
  - `translate.test.ts` (es), with the Russian test's fixture shape:
    - `x_one` / `x_other` pick by count 1 and 3.
    - A `plural: 'n'` key with es `z_one` / `z_other` picks the right form.
    - A missing `_one` with count 1 renders English.
    - A wrong placeholder renders English.
    - `pluralFor('en') === null`.
    - The existing ru and zh tests stay unchanged.
  - `catalogNames.test.ts`: with an el fixture, `exerciseLabel` returns the Greek name, while a custom exercise keeps its stored name.
  - `labels.test.ts`: `sortByName` in es orders `['Ñandú','Nadar','Oblicuos']` as Nadar, Ñandú, Oblicuos.
  - `nativeLocales.test.ts`: as in the Interfaces above.
- [ ] **Step 2:** Run `cd frontend && node --test src/i18n/*.test.ts src/data/labels.test.ts`. The new tests must FAIL.
- [ ] **Step 3:** Implement the interfaces above. Add `el` and `es` to `app.json` `supportedLocales.android` only.
- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit`. Both must pass.
- [ ] **Step 5:** Commit `feat(i18n): Greek and Spanish language core`.

### Task 2: Greek capitals

**Files:**
- Create: `frontend/src/i18n/upper.ts`, `frontend/src/i18n/upper.test.ts`, and a guard test `frontend/src/i18n/uppercase.test.ts`
- Modify:
  - every display `.toUpperCase()` / `.toLocaleUpperCase()` in `frontend/src` and `frontend/app`, about 22 today, excluding tests and data/ID code
  - every `textTransform: 'uppercase'`, about 19 today
  - `frontend/src/data/labels.ts` `indexLetter`
  - `frontend/src/domain/profiles.ts` initials

**Interfaces:**
- Produces: `upperDisplay(text: string): string`, as defined in Global Constraints. It is pure and takes no lang argument.

- [ ] **Step 1: Write failing tests**
  - `upper.test.ts`:
    - `upperDisplay('Προπόνηση') === 'ΠΡΟΠΟΝΗΣΗ'`
    - `'άέήίόύώ'` → `'ΑΕΗΙΟΥΩ'`
    - `'ΐ ΰ ϊ ϋ'` → `'Ϊ Ϋ Ϊ Ϋ'`
    - `'σετ ς'` → `'ΣΕΤ Σ'`
    - `'Άσκηση'` → `'ΑΣΚΗΣΗ'`
    - mixed `'Bench Πρέσα'` → `'BENCH ΠΡΕΣΑ'`
    - for `'Жим лёжа'`, `'deadlift ß'` and `'简体'`, the output equals `.toUpperCase()`
  - `uppercase.test.ts`: walk `src/**/*.{ts,tsx}` and `app/**/*.tsx`, excluding tests, and assert that no file contains `textTransform: 'uppercase'`. Also assert that `.toUpperCase(` appears only on an allowlist of non-display uses; list each allowed file:line reason in the test.
- [ ] **Step 2:** Run the tests. They must FAIL.
- [ ] **Step 3:** Implement `upperDisplay`.
  - Replace each display `.toUpperCase()` with `upperDisplay(...)`.
  - For each `textTransform: 'uppercase'`, remove the style and apply `upperDisplay()` to the text it styled. The rendered English/zh/ru output stays identical.
  - Route `indexLetter` and profile initials through `upperDisplay`.
- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit`. Both must pass, and the en/ru/zh tests must stay unchanged.
- [ ] **Step 5:** Commit `feat(i18n): accent-free Greek capitals`.

### Task 3: Greek font, long names, Language list

**Files:**
- Modify:
  - `frontend/src/theme/fontForLang.ts` and `frontend/src/theme/live.ts`
  - `frontend/app/settings.tsx` (`needsSystemFont`)
  - `frontend/src/components/workout/ExerciseCard.tsx`
  - `frontend/app/exercise-library.tsx`
  - `frontend/app/exercise/[id].tsx`
- Test: extend `fontForLang.test.ts` and `live.test.ts`, and create `frontend/src/i18n/scripts.test.ts`

**Interfaces:**
- Produces, in a new pure module `frontend/src/i18n/scripts.ts`:
  - `usesSystemFont(lang: Lang): boolean` is true for ru and el.
  - `allowsTwoLineNames(lang: Lang): boolean` is true for ru, el and es.
  - `nameNeedsSystemFont(id: Lang, uiLang: Lang): boolean` is true when `id` is el, ru or zh-Hans and `id !== uiLang`.
- Wiring:
  - `localizeFontStyles` switches when `usesSystemFont(lang)`.
  - The `themed()` cache key in `live.ts` becomes `${key}:sys` when `usesSystemFont(lang)`.
  - The three `getLang() === 'ru'` line-count checks call `allowsTwoLineNames(getLang())`.
  - `settings.tsx` `needsSystemFont` calls `nameNeedsSystemFont`.

- [ ] **Step 1: Write failing tests**
  - `scripts.test.ts` covers all three functions for every `Lang`. In particular, `nameNeedsSystemFont('es','el') === false` and `nameNeedsSystemFont('el','en') === true`.
  - `fontForLang.test.ts`: `localizeFontStyles(…,'el','ios')` gives the system font, and with `'es'` it returns the same reference.
  - `live.test.ts`: after `setLang('el')`, a themed Space Grotesk style reads `'System'`. After `setLang('es')`, it reads Space Grotesk.
- [ ] **Step 2:** Run the tests. They must FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit`. Both must pass.
- [ ] **Step 5:** Commit `feat(i18n): system font for Greek, two-line names`.

### Task 4: Numbers, dates and search for Greek and Spanish

**Files:**
- Modify: `frontend/src/domain/units.ts`, `frontend/src/lib/format.ts`, `frontend/src/i18n/catalogNames.ts` (`fold`)
- Test: `units.test.ts`, `format.test.ts`, `catalogNames.test.ts`

**Interfaces:**
- `localizeNumber` applies the comma/NBSP rule for ru, el and es.
- Every `fmt*` function that takes `lang` returns Greek for `el` and Spanish for `es`, using hand-written tables beside the Russian ones:
  - **Greek:**
    - genitive months after a day ("10 Νοεμβρίου") and nominative in month headings ("Νοέμβριος 2026")
    - short weekdays Δευ Τρι Τετ Πεμ Παρ Σαβ Κυρ
    - capitalised forms through `upperDisplay` (Task 2)
  - **Spanish:**
    - lower-case months and weekdays inside text ("mar, 10 nov")
    - month headings capitalised with "de" ("Noviembre de 2026")
    - short weekdays lun mar mié jue vie sáb dom
    - upper-case forms through `upperDisplay`
  - Relative phrases that today are hand-written per language in `format.ts` get el and es versions. Phrases that come from `t()` are left to the pipeline. This task adds no new `t()` keys.
- `fold` in catalogNames removes combining marks after NFD and maps ς → σ. The existing ё/е behaviour stays (ё must still fold to е).

- [ ] **Step 1: Write failing tests**
  - Numbers: es/el `localizeNumber('1199') === '1 199'` and `'82.5'` → `'82,5'`; en/zh output unchanged.
  - Dates: exact el and es strings for every `fmt*` that takes `lang`, on 2026-11-10 (Tuesday) and 2026-05-01. Write the expectations first by mirroring each English output's fields. For example:
    - `fmtDayMonthOf(…,'el') === '10 Νοεμβρίου'`
    - `fmtMonthYear('2026-05-01','es') === 'Mayo de 2026'`
    - `fmtHeaderDate(…,'el')` carries no tonos
  - Search:
    - `matchesSearch('press banca', ['Press de banca'])` is false, because word order matters with substring matching. `matchesSearch('press de banca', ['Press de Banca'])` is true.
    - `matchesSearch('pesa', ['Pésa'])`, `matchesSearch('ασκηση', ['Άσκηση'])` and `matchesSearch('σ', ['ς'])` are true.
    - The existing ё test stays unchanged.
- [ ] **Step 2:** Run the tests. They must FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit`. Both must pass, with the ru/zh/en date and number tests unchanged.
- [ ] **Step 5:** Commit `feat(i18n): Greek and Spanish numbers, dates and search`.

### Task 5: Translation pipeline for Greek and Spanish

**Files:**
- Modify:
  - `frontend/scripts/i18n/langs.mjs`, `core.mjs`, `translate.mjs`
  - `frontend/src/i18n/shipped.test.ts`
- Create: `frontend/scripts/i18n/glossary.el.json`, `glossary.es.json`, `denylist.el.json`, `denylist.es.json`
- Test: extend `frontend/scripts/i18n/core.test.js`

**Interfaces:**
- `LANGS.el` and `LANGS.es`:
  - `field`: `'el'` and `'es'`
  - files mirroring ru, with **no `plist`** (the script must skip plist work when `files.plist` is absent)
  - `promptLanguage`: `'Greek'` and `'Spanish'`
  - `scriptRegex`: el `/[Ͱ-Ͽἀ-῿]/`; es `/[a-zA-ZáéíóúñüÁÉÍÓÚÑÜ¿¡]/`. The es regex only requires letters; the check exists for el.
  - `lengthFactor`: 1.35 for both
  - `plural: 'one-other'`
  - `keepEdgeSpace`: true, as for ru
  - `denylist` path
- `expandPlurals(items, lang)` for `'one-other'`: each plural key becomes `key_one` and `key_other`. The English source is the `_one` text for `_one`, and the `_other` text (or the single form) for `_other`. The note is appended with the counts each form serves ("1" and "0, 2, 5, 1.5"). The zh and ru behaviour is unchanged.
- `buildPrompt` for el and es, with the rules from the spec:
  - es: neutral Spanish, *tú*, vocabulary shared by Spain and Latin America, standard gym terms, glossary mandatory.
  - el: informal singular *εσύ*, standard Greek gym terms. **ALL-CAPS English must be translated into all-caps Greek with no tonos.**
  - Both: no country, nationality, region, flag, political or military words unless the English has them.
- el post-processing: when the English source has no lowercase letters and the output contains Greek, store `upperDisplay(output)`. Import the pure helper from `src/i18n/upper.ts` (Task 2) via its relative path.
- `denylist.el.json` / `denylist.es.json` hold stems for countries, nationalities, politics, military and crude words. Gym terms such as Spanish "militar" in "press militar" are explicitly allowed, with a comment, as «армейский» is for ru.
- `shipped.test.ts` runs for el and es, and gains: no el value contains a word of two or more letters that is entirely uppercase and contains any of Ά Έ Ή Ί Ό Ύ Ώ.

- [ ] **Step 1: Write failing tests** in `core.test.js`:
  - `expandPlurals` for el: a pair key and a `plural: 'n'` key give two items each, with the right sources.
  - The zh and ru expansions are unchanged.
  - The el `checkOne` rejects Latin-only output for translatable English and accepts «Άσκηση».
  - `buildPrompt(…, el)` contains `Greek` and the all-caps rule. `buildPrompt(…, es)` contains `Spanish` and `tú`.
  - The el all-caps normalisation turns `'ΑΥΤΉ ΤΗΝ ΕΒΔΟΜΆΔΑ'` with source `'THIS WEEK'` into `'ΑΥΤΗ ΤΗΝ ΕΒΔΟΜΑΔΑ'`.
  - es `denyHits('Press militar','Military Press', list)` → `[]`.
- [ ] **Step 2:** Run the tests. They must FAIL.
- [ ] **Step 3:** Implement. The glossaries start from the spec's lists.
- [ ] **Step 4:** `node scripts/i18n/translate.mjs --lang el --dry-run` and `--lang es --dry-run` print the counts and a sample prompt without network access. `npm test` and `npx tsc --noEmit` must pass.
- [ ] **Step 5:** Commit `feat(i18n): Greek and Spanish translation pipeline`.

### Task 6: Generate and safety-check (controller-run)

The coordinator runs this, not an implementer subagent: it spends API credit and dispatches reviewers.

- [ ] **Step 1:** Do the real `--lang es` and `--lang el` runs. Record counts and script rejections.
- [ ] **Step 2:** Split each review file into batches and dispatch back-translation reviewers with the Russian brief adapted to each language. They back-translate and mark each line `ok` or `flagged` with a reason. Flag anything that is:
  - offensive, political, nationalist, slang or crude
  - wrong in meaning, or the wrong plural form
  - regional Spanish (es)
  - in the formal register (el)
  - accented all-caps Greek
  - suspiciously long

  Deny-list hits get an explicit decision.
- [ ] **Step 3:** Apply the verdicts. Run `--retry-flagged` once, review the retries and apply them. Anything still flagged stays English.
- [ ] **Step 4:** `npm test` (shipped guard) must pass. Commit `feat(i18n): Greek and Spanish translations`. Write `frontend/.i18n-review/report.el.md` and `report.es.md` (gitignored).

### Task 7: Layout pass (controller-run, simulator)

- [ ] **Step 1:** In the iOS simulator (memory `simulator-testing-setup.md`), switch the app to Ελληνικά and then to Español through Settings → Language. Screenshot every screen, sheet and dialog. Check:
  - text that is clipped or overflows in a way that matters
  - Greek capitals without tonos
  - the system font for Greek, and Space Grotesk for Spanish (including ñ, ¿ and accents)
  - plurals at 0, 1, 2 and 5
  - dates and numbers
- [ ] **Step 2:** For each clipped string, tighten the "Max N characters" note, re-run only those keys, then review and apply. Change layout only where no acceptable shorter text exists.
- [ ] **Step 3:** Spot-check on Android (Home, workout, library, settings, history), plus an English/Chinese/Russian smoke check on iOS.
- [ ] **Step 4:** `npm test` and `npx tsc --noEmit` must pass. Commit `fix(i18n): Greek and Spanish layout fixes`.

The following are outside this plan and follow the spec's Afterwards section:
- the release (4.7)
- the App Store listings (es-ES, es-MX, el)
- the site and README updates
- the #136 post

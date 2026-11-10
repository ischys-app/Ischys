# Localization: Greek and Spanish — design

Date: 2026-11-10 · Refs #136

This adds to `2026-11-05-localization-design.md` (Simplified Chinese) and `2026-11-08-russian-localization-design.md` (Russian). Everything in those two documents applies to Greek and Spanish unless this one says otherwise, so read them first. Russian is the closest model: a second script, a system-font fallback, JS-only on iOS.

## Intent

The owner wants more people to be able to use Ischys in their own language. The in-app Language setting (PR #153) now lets anyone pick a language, so each new language is one more row in that list. Greek is the owner's own language; Spanish has the largest audience of the candidates. The top priority is unchanged: **nothing offensive, political or embarrassing ships.** Clumsy but harmless wording is acceptable and gets fixed later.

## Goals

- Both languages get the same coverage as Russian: all phone UI text, the names of the built-in exercises, muscles, categories, groups and equipment, dates and numbers. They are chosen either by the phone's first language or by the in-app Language setting.
- Greek capitals follow Greek rules: **all-caps text carries no accent marks (tonos)**, for example ΠΡΟΠΟΝΗΣΗ and not ΠΡΟΠΌΝΗΣΗ. This applies to every label the app shows in capitals, whether the capitals come from the string itself, `toUpperCase()` or `textTransform: 'uppercase'`.
- No clipped or overflowing text on any screen in either language.
- Adding a language stays mostly configuration, a glossary and date tables.

## Non-goals

Same as Russian:
- The Watch, Wear OS, widgets, Live Activity and notification chrome stay English.
- How-to steps stay English.
- No RTL.
- No iOS-native localization.

App Store listings are not part of this build. They go out with the release (see Afterwards).

## Anti-goals

- Everything in the Chinese and Russian anti-goals: flagged strings shipping, translated data written to storage, exports or backups, contributor translation files, and political, nationalist, slang or crude text.
- Greek all-caps text with accent marks. It reads as a beginner's mistake to every Greek reader.
- Spanish that reads as one country's slang. Use neutral vocabulary that Spain and Latin America both read naturally.

## Decisions

### Owner's
- **Ship after the automated checks.** No human review before release. The owner fixes Greek afterwards, and Spanish corrections come from users in #136 comments.
- **Same process as Russian.** DeepSeek generates. Claude back-translates every string and flags anything offensive, political, slang, wrong in meaning or suspiciously long. Flagged lines are regenerated or left in English. No translation PRs.

### Claude's calls (said in chat 2026-11-10, owner did not object; owner may override)
- **JS-only on iOS, like Russian.** `el` and `es` are not added to `CFBundleLocalizations`, `expo.locales` or expo-localization `supportedLocales.ios`. Extend the guard in `src/i18n/nativeLocales.test.ts`. Android adds `el` and `es` to its per-app language list, as it did for `ru`. No `locales/el.json` or `locales/es.json` InfoPlist translations.
- **Greek font:** Space Grotesk has no Greek, so Greek uses the platform system font wherever Space Grotesk would be used, exactly as Russian does. JetBrains Mono has Greek and stays. Spanish keeps Space Grotesk, which covers á é í ó ú ñ ü ¿ ¡. Verify that once on screen.
- **One release** with both languages, as the next version (4.7) on iOS and Android.

### Claude's calls (made while writing this document)
- **Locale mapping, first preferred language only:**
  - `el` in any region (el-GR, el-CY) → `el`.
  - `es` in any region (es-ES, es-MX, es-AR, es-419, es-US…) → `es`.
  - Catalan, Galician, Basque, Portuguese and everything else → `en`.
  - Existing zh and ru behaviour is unchanged.
- **Spanish variant:** one neutral Spanish, written with *tú*, the usual choice for fitness apps in both regions.
  - Prefer vocabulary shared across regions: *entrenamiento*, *serie*, *repeticiones*, *rutina*, *press de banca*, *sentadilla*, *peso muerto*.
  - Avoid Spain-only or Latin-America-only words. The glossary pins the core terms.
- **Greek register:** informal singular (*εσύ*, e.g. «Ξεκίνα»). Most Greek fitness apps use it.
- **Glossaries, starting sets** (the builder may extend them):
  - es:
    - set = serie
    - rep / reps = repetición / repeticiones (short: rep.)
    - exercise = ejercicio
    - workout = entrenamiento
    - routine = rutina
    - warm-up set = serie de calentamiento
    - drop set = drop set
    - failure set = serie al fallo
    - superset = superserie
    - personal record = récord personal (PR stays Latin)
    - rest timer = temporizador de descanso
    - RPE / 1RM stay Latin; Ischys is never translated
  - el:
    - set = σετ
    - rep / reps = επανάληψη / επαναλήψεις (short: επαν.)
    - exercise = άσκηση
    - workout = προπόνηση
    - routine = πρόγραμμα
    - warm-up set = σετ προθέρμανσης
    - drop set = drop set
    - failure set = σετ μέχρι αποτυχίας
    - superset = superset
    - personal record = ατομικό ρεκόρ (PR stays Latin)
    - rest timer = χρονόμετρο ξεκούρασης
    - RPE / 1RM stay Latin; Ischys is never translated
- **Plurals:** both languages have `one` and `other`. A count key gets both forms, chosen as English chooses them (`1` → one), with the same fallback rules as Russian: a missing form falls back to English for that string. Count strings that have only one English form get their own forms in el and es, without touching English, Chinese or Russian text or review state.
- **Numbers:** both use the Russian display rule, with a decimal comma and a no-break-space thousands separator ("1 199", "82,5"). It is correct in Greece and Spain and unambiguous in Latin America, unlike a dot that means thousands in one country and decimals in the next. Inputs and data paths stay dot-formatted, as in PR #150.
- **Dates:** hand-written tables in `format.ts`, like Russian, in the correct grammatical forms:
  - Greek genitive months in "10 Νοεμβρίου", nominative in month headings ("Νοέμβριος 2026").
  - Spanish lower-case months and weekdays inside text ("mar, 10 nov"), capitalised in headings ("Noviembre de 2026").
  - Capitalised Greek forms follow the no-accent rule.
- **Greek capitals:** one helper (e.g. `upperDisplay(text)`) does the uppercasing. It is keyed on the text, not the app language: it strips the tonos from any Greek letters, whatever language the app is in. That also covers a Greek exercise, workout or profile name typed while the app is in English, and profile initials. Text with no Greek letters comes out exactly as `toUpperCase()` gives it today, so the byte-identical rule for en/zh/ru output holds for every non-Greek string. For `el` it removes the tonos (ά έ ή ί ό ύ ώ → Α Ε Η Ι Ο Υ Ω) and keeps the dialytika (ϊ ϋ, and ΐ ΰ → Ϊ Ϋ). It replaces `.toUpperCase()` on display text. `textTransform: 'uppercase'` does not strip the tonos on either platform, so Greek strings shown that way must already be uppercased by the helper, or have the transform turned off in Greek. The builder finds every all-caps path: section titles, mono labels, the header date and the Settings scope labels.
- **Sorting and index letters:** sort with the `es` and `el` collators. Spanish sorts ñ after n. The exercise library's index letter is the first letter of the displayed name, uppercased with the Greek rule.
- **Search:** case-insensitive and accent-insensitive in both languages (á = a, ά = α, ς = σ), and it still matches English names.
- **Long names:** wherever Russian allows two lines for exercise names (`ExerciseCard`, the exercise library, exercise detail), Greek and Spanish do too. Turn the `getLang() === 'ru'` checks into one helper.
- **Safety scan:** each language gets a deny-list (countries, nationalities, regions, politics, military, crude words) beside its glossary, run before the back-translation review exactly as for Russian.
- **Greek typed into a non-Greek app** (for example, an exercise name in an English app) keeps glyph fallback. Space Grotesk draws the Latin letters and the system font draws the Greek, the same as Cyrillic in an English app today. A per-string font check is out of scope.
- **Language setting:** the order is System, English, Español, Ελληνικά, Русский, 简体中文 (grouped by script: Latin, Greek, Cyrillic, Han). Each name is written in its own language. Ελληνικά draws in the system font wherever the app language is not Greek, and the same goes for Русский and 简体中文 today.
- **Default stored names** ('Workout', 'Empty Workout', 'Athlete') are displayed translated, as in the other languages. The stored values don't change.

## What's left to the builder

- How to generalise the remaining per-language branches so that adding a language means configuration plus tables:
  - `translate.ts` (one/other plural handling)
  - `t.ts` and `catalogNames.ts` tables
  - `labels.ts` collators
  - `units.ts` `localizeNumber`
  - `format.ts`
  - the `themed()` font key in `live.ts` (today `:ru`)
  - `fontForLang.ts`
  - `langs.mjs`
  - the shipped and native-locale guards

  English, Chinese and Russian output must stay byte-identical; pin that with tests.
- The file layout, mirroring ru: `strings/el.json`, `strings/es.json`, `catalog/el.json`, `catalog/es.json`, state files, glossaries and deny-lists.
- Tests:
  - locale mapping, including Catalan, Galician and Portuguese → en
  - one/other plural selection
  - Greek uppercasing (each tonos vowel, the dialytika forms, final ς → Σ, and mixed Latin/Greek text)
  - accent-insensitive search
  - number and date output for both languages
  - Greek font switching
  - the shipped guard for both languages
- After the run, check every screen in the iOS simulator in Greek and in Spanish (Android spot check). Clipping is fixed by asking DeepSeek for a shorter variant before touching layout.

## Afterwards

- With the release:
  - App Store listings for es-ES, es-MX and el (name, subtitle, keywords, description, What's New), made the same way as the ru and zh-Hans ones in 4.6.1.
  - The site FAQ, `inLanguage`, featureList, `llms.txt` and the README languages bullet.
- Post on #136 that Greek and Spanish are out and corrections are welcome.

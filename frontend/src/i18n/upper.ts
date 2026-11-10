/**
 * Display capitals. Greek all-caps text carries no tonos (ΠΡΟΠΟΝΗΣΗ, not
 * ΠΡΟΠΌΝΗΣΗ), which the built-in uppercase does not do. Keyed on the text, not the
 * language: text with no accented Greek letter comes out exactly as
 * the built-in uppercase gives it, so en / zh-Hans / ru are unchanged.
 */
const GREEK_ACCENTED = /[άέήίόύώΐΰΆΈΉΊΌΎΏ]/u;
const GREEK_ACCENTED_G = new RegExp(GREEK_ACCENTED.source, 'gu');
const DEACCENT: Record<string, string> = {
  'ά': 'Α', 'έ': 'Ε', 'ή': 'Η', 'ί': 'Ι', 'ό': 'Ο', 'ύ': 'Υ', 'ώ': 'Ω',
  'Ά': 'Α', 'Έ': 'Ε', 'Ή': 'Η', 'Ί': 'Ι', 'Ό': 'Ο', 'Ύ': 'Υ', 'Ώ': 'Ω',
  'ΐ': 'Ϊ', 'ΰ': 'Ϋ',
};

// An accented vowel followed by ι / υ loses its tonos in capitals, so the pair would read as a
// diphthong: the ι / υ takes a dialytika instead (Μάιος -> ΜΑΪΟΣ).
const DIALYTIKA = /([άέόύΆΈΌΎ])([ιυ])/gu;

export function upperDisplay(input: string): string {
  const text = /[\u0300-\u036f]/.test(input) ? input.normalize('NFC') : input;
  if (!GREEK_ACCENTED.test(text)) return text.toUpperCase();
  // Swap accented letters first: the built-in uppercase would keep the tonos (ά -> Ά) and
  // split ΐ / ΰ into a letter plus combining marks.
  return text
    .replace(DIALYTIKA, (_m, v: string, n: string) => DEACCENT[v] + (n === 'ι' ? 'Ϊ' : 'Ϋ'))
    .replace(GREEK_ACCENTED_G, (c) => DEACCENT[c])
    .toUpperCase();
}

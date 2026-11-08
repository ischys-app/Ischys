/** Russian plural categories. Pure: no native imports. */
export type PluralCategory = 'one' | 'few' | 'many' | 'other';

export function ruPlural(n: number): PluralCategory {
  if (!Number.isInteger(n)) return 'other';
  const a = Math.abs(n);
  const m10 = a % 10;
  const m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return 'one';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
  return 'many';
}

/** Lowercase and strip accents, for case- and accent-insensitive matching. */
export function fold(s: string): string {
  return s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

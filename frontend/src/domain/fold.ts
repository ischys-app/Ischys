/** Lowercase, strip accents and fold final sigma (ς) to σ, for case- and accent-insensitive matching. */
export function fold(s: string): string {
  return s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ');
}

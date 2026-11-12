import { upperDisplay } from '../i18n/upper.ts';

/** 'Incline Bench Press' -> 'IB' (port of serializers.initials_of). */
export function initialsOf(name: string): string {
  const words = name.replace(/\(/g, ' ').split(/\s+/).filter((w) => /^[a-z0-9]/i.test(w));
  const letters = upperDisplay(words.slice(0, 2).map((w) => w[0]).join(''));
  return letters || upperDisplay(name.slice(0, 2));
}

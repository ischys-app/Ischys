/**
 * Helpers for the tests that read the app's source (atomicCallSites.test.ts,
 * lib/profileKeys.test.ts). Pure: no expo-* or react-native imports.
 */

/**
 * Comments out, so the files that explain the trap may name it. Strings and
 * template literals are walked, not skipped over blindly: a `//` or `/*`
 * inside one (a URL, a glob) is text, and must not hide the code after it.
 * Regex literals are not recognised; one holding a quote can hide the rest of
 * its line, which is what the type on `db.transaction` (db/client.ts) is for.
 */
export function withoutComments(source: string): string {
  let out = '';
  /** What we are inside: a quote character, or '}' for a `${…}` in a template. */
  const inside: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const top = inside[inside.length - 1];
    if (top === "'" || top === '"' || top === '`') {
      if (c === '\\') {
        out += c + (source[i + 1] ?? '');
        i++;
        continue;
      }
      if (c === top || (top !== '`' && c === '\n')) inside.pop();
      else if (top === '`' && c === '$' && source[i + 1] === '{') {
        inside.push('}');
        out += '${';
        i++;
        continue;
      }
      out += c;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      i--;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop - 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') inside.push(c);
    else if (c === '{' && top === '}') inside.push('{');
    else if (c === '}' && (top === '}' || top === '{')) inside.pop();
    out += c;
  }
  return out;
}

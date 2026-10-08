/**
 * One action as the Watch sent it: the JSON text of a `WatchAction`. Null when
 * it is not a JSON object with an `action`, so a malformed payload is dropped
 * rather than handed to the workout screen.
 *
 * In a file of its own, with no native import, so `node --test` can load it.
 */
export function parseAction(json: unknown): Record<string, unknown> | null {
  if (typeof json !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const action = parsed as Record<string, unknown>;
    return typeof action.action === 'string' ? action : null;
  } catch {
    return null;
  }
}

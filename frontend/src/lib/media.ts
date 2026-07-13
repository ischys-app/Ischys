/**
 * Resolve an exercise image/demo reference to a displayable URL.
 *
 * The app runs entirely on-device with no server, so only an absolute URL
 * (http(s), or a bundled `asset:`/`file:` URI) is displayable; a bare relative
 * path has nothing to resolve against and yields undefined. Kept as a thin
 * resolver so locally-bundled exercise media can be wired in later without
 * touching callers.
 *
 * Pure, so `node --test` can run it. See media.test.ts.
 */

/** A displayable URL for `path`, or `undefined` when it can't be resolved. */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path; // already absolute — any URI scheme (http(s), asset, file…)
  return undefined; // a bare relative path has no server to resolve against
}

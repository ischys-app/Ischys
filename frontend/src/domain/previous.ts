/**
 * Previous-set reference resolver.
 *
 * For progressive overload, the autofill reference (`pw`/`pr` in the design) is the
 * athlete's last session of that exercise — not the all-time best (that lives in PRs).
 * Ported from the original server implementation; timestamps are epoch ms integers here.
 */

export type PrevSession = { id: string; startedAt: number };

/** Return the most recent session strictly before `before` (epoch ms), or null. */
export function latestBefore(sessions: PrevSession[], before: number): PrevSession | null {
  let best: PrevSession | null = null;
  for (const s of sessions) {
    if (s.startedAt < before && (best === null || s.startedAt > best.startedAt)) {
      best = s;
    }
  }
  return best;
}

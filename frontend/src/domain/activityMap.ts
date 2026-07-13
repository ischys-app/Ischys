/**
 * Per-day session-intensity heatmap for the History screen. Covers the last N
 * weeks up to today, intensity capped at 3. Local time authoritative. Pure;
 * node --test runs it.
 */
export type ActivityDayResult = { date: string; intensity: number };
export type ActivityMapResult = { weeks: number; sessions: number; days: ActivityDayResult[] };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** `startedAts` = epoch ms of completed workouts (any range; filtered here). */
export function activityMap(startedAts: number[], weeks: number, today: Date): ActivityMapResult {
  const start = addDays(startOfDay(today), -weeks * 7);
  const span = weeks * 7; // start = today - weeks*7 days, so (today - start) is exactly this

  const perDay = new Map<string, number>();
  let sessions = 0;
  for (const ms of startedAts) {
    const d = startOfDay(new Date(ms));
    if (d.getTime() >= start.getTime()) {
      sessions += 1;
      const k = ymd(d);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
  }

  const days: ActivityDayResult[] = [];
  for (let i = 0; i <= span; i++) {
    const d = addDays(start, i);
    days.push({ date: ymd(d), intensity: Math.min(3, perDay.get(ymd(d)) ?? 0) });
  }
  return { weeks, sessions, days };
}

// Pure profile helpers (issue #117). No expo-* / react-native imports.

export type ProfileRow = {
  id: string;
  name: string;
  initials: string;
  sort: number;
  isOwner: boolean;
  createdAt: number;
  workoutCount: number;
  firstWorkoutAt: number | null;
  lastWorkoutAt: number | null;
};

export const OWNER_ID = 'owner';
export const MAX_NAME = 40;

export const PROFILE_SCOPED_KEYS: readonly string[] = [
  'ischys.weeklyWorkoutTarget',
  'ischys.bodyweightKg',
  'ischys.countWarmupsInVolume',
  'ischys.deloadState',
  'ischys.plateSetup',
  'ischys.plateSetup.lb',
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

type SegmenterLike = { segment(s: string): Iterable<{ segment: string }> };

let cachedSegmenter: SegmenterLike | null | undefined;

// Hermes may not implement Intl.Segmenter; detect once and fall back.
function defaultSegmenter(): SegmenterLike | null {
  if (cachedSegmenter === undefined) {
    const I = typeof Intl !== 'undefined' ? (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => SegmenterLike }) : undefined;
    cachedSegmenter = I && typeof I.Segmenter === 'function' ? new I.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  }
  return cachedSegmenter;
}

const EXTEND = /^(?:\p{M}|[\uFE00-\uFE0F]|[\u{1F3FB}-\u{1F3FF}])$/u;

function fallbackGraphemes(s: string): string[] {
  const out: string[] = [];
  let joinNext = false;
  for (const ch of Array.from(s)) {
    if (out.length > 0 && (joinNext || ch === '\u200D' || EXTEND.test(ch))) {
      out[out.length - 1] += ch;
    } else {
      out.push(ch);
    }
    joinNext = ch === '\u200D';
  }
  return out;
}

/** Exported for tests: pass null to force the code-point fallback. */
export function graphemesWith(s: string, segmenter: SegmenterLike | null): string[] {
  if (!segmenter) return fallbackGraphemes(s);
  return Array.from(segmenter.segment(s), (x) => x.segment);
}

function graphemes(s: string): string[] {
  return graphemesWith(s, defaultSegmenter());
}

function words(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

export function deriveInitials(name: string): string {
  const w = words(name);
  if (w.length === 0) return '';
  const first = graphemes(w[0])[0] ?? '';
  if (w.length === 1) return first.toLocaleUpperCase();
  const last = graphemes(w[w.length - 1])[0] ?? '';
  return (first + last).toLocaleUpperCase();
}

export function firstName(name: string): string {
  return words(name)[0] ?? '';
}

const GREEK: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k',
  λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't',
  υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

export function profileSlug(name: string): string {
  const stripped = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const ch of stripped) out += GREEK[ch] ?? ch;
  const slug = out
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'profile';
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function exportFileStem(profileCount: number, name: string, now: Date): string {
  if (profileCount <= 1) return 'ischys-export';
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return `ischys-${profileSlug(name)}-${date}`;
}

export function scopedKey(profileId: string, key: string): string {
  if (profileId === OWNER_ID) return key;
  return `ischys.p.${profileId}.${key.replace(/^ischys\./, '')}`;
}

/**
 * Why a switch to `targetId` can't happen now, or null when it can. A running
 * workout blocks every switch except the one into its own profile: that is the
 * way back to it (Ruling R8).
 */
export function switchBlock(a: {
  targetId: string;
  currentId: string;
  activeWorkoutProfileId: string | null;
  transactionOpen: boolean;
}): 'same' | 'workout' | 'busy' | null {
  if (a.targetId === a.currentId) return 'same';
  if (a.activeWorkoutProfileId !== null && a.activeWorkoutProfileId !== a.targetId) return 'workout';
  if (a.transactionOpen) return 'busy';
  return null;
}

export function deleteBlock(a: {
  profile: ProfileRow;
  activeWorkoutProfileId: string | null;
}): 'owner' | 'workout' | null {
  if (a.profile.isOwner) return 'owner';
  if (a.activeWorkoutProfileId === a.profile.id) return 'workout';
  return null;
}

export function resolveLaunchProfile(a: {
  registryIds: readonly string[];
  lastUsedId: string | null;
  activeWorkoutProfileId: string | null;
}): string {
  if (a.activeWorkoutProfileId !== null && a.registryIds.includes(a.activeWorkoutProfileId)) {
    return a.activeWorkoutProfileId;
  }
  if (a.lastUsedId !== null && a.registryIds.includes(a.lastUsedId)) return a.lastUsedId;
  return OWNER_ID;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

export function switcherSubline(p: ProfileRow, now: Date, inWorkoutSince: number | null): string {
  if (inWorkoutSince !== null) return `IN WORKOUT · ${clock(now.getTime() - inWorkoutSince)}`;
  if (p.lastWorkoutAt === null) return 'NO WORKOUTS YET';
  const d = new Date(p.lastWorkoutAt);
  if (sameLocalDay(d, now)) return 'LAST · TODAY';
  return `LAST · ${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function manageSubline(p: ProfileRow): string {
  if (p.isOwner) return 'OWNER · HEALTH · WATCH';
  if (p.workoutCount <= 0 || p.firstWorkoutAt === null) return 'NO WORKOUTS YET';
  const d = new Date(p.firstWorkoutAt);
  const n = p.workoutCount === 1 ? '1 WORKOUT' : `${p.workoutCount} WORKOUTS`;
  return `${n} · SINCE ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function ownerLabel(ownerName: string, defaultName: string): string {
  return ownerName === defaultName ? "the phone's owner" : ownerName;
}

export function parseActiveWorkout(raw: string | null): { profileId: string; workoutId: string } | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      const v = JSON.parse(trimmed) as { profileId?: unknown; workoutId?: unknown };
      if (typeof v.profileId === 'string' && typeof v.workoutId === 'string' && v.profileId && v.workoutId) {
        return { profileId: v.profileId, workoutId: v.workoutId };
      }
    } catch {
      /* fall through */
    }
    return null;
  }
  return { profileId: OWNER_ID, workoutId: trimmed };
}

export function referencedCustomExerciseIds(
  routineExerciseIds: readonly string[],
  customIds: ReadonlySet<string>,
): string[] {
  return Array.from(new Set(routineExerciseIds.filter((id) => customIds.has(id))));
}

/** The switcher (P2) shows a search field from this many profiles. */
export const SWITCHER_SEARCH_FROM = 9;

/** Profiles whose name contains `query`, ignoring case and accents; all of them for a blank query. */
export function filterProfiles<T extends { name: string }>(rows: readonly T[], query: string): T[] {
  const fold = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = fold(query.trim());
  if (!q) return [...rows];
  return rows.filter((r) => fold(r.name).includes(q));
}

/**
 * The switcher's fixed parts, in points (P2): padding 10 + 34, grabber 5 + 12,
 * header 34 + 10, the Add row 60. The search field adds 46.
 */
const SWITCHER_CHROME = 10 + 5 + 12 + 34 + 10 + 60 + 34;
const SWITCHER_SEARCH = 46;
export const SWITCHER_ROW = 60;
export const SWITCHER_MAX_FRACTION = 0.78;

/** Whether `rows` 60pt rows overflow a sheet capped at 78% of `windowHeight`, so the list scrolls. */
export function switcherListScrolls(rows: number, windowHeight: number): boolean {
  const chrome = SWITCHER_CHROME + (rows >= SWITCHER_SEARCH_FROM ? SWITCHER_SEARCH : 0);
  return chrome + rows * SWITCHER_ROW > windowHeight * SWITCHER_MAX_FRACTION;
}

// --- Add profile (P4) ---

/** What the INITIALS field keeps: no spaces, uppercased, at most 2 characters (graphemes). */
export function normalizeInitials(raw: string): string {
  return graphemes(raw.replace(/\s+/g, ''))
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase();
}

/** The existing profile with this name (ignoring case and outer spaces), or null. */
export function duplicateProfileName(name: string, rows: readonly { name: string }[]): string | null {
  const key = name.trim().toLocaleLowerCase();
  if (!key) return null;
  return rows.find((r) => r.name.trim().toLocaleLowerCase() === key)?.name ?? null;
}

/** The START WITH row's sub line. */
export function copyRoutinesSub(count: number): string {
  return `${count} ${count === 1 ? 'ROUTINE' : 'ROUTINES'} · COPIES, NOT LINKED`;
}

/**
 * The toggle's label: "Copy ‹First›'s routines", or "Copy your routines" for
 * an owner still called `defaultName` (Ruling R16).
 */
export function copyRoutinesLabel(current: { name: string; isOwner: boolean }, defaultName: string): string {
  if (current.isOwner && current.name === defaultName) return 'Copy your routines';
  return `Copy ${firstName(current.name)}'s routines`;
}

/** The HEALTH & WATCH footer. `owner` comes from `ownerLabel`. */
export function newProfileHealthFooter(name: string, owner: string, healthName: string): string {
  const first = firstName(name);
  const whose = first ? `${first}'s workouts` : "This profile's workouts";
  return `${whose} stay in Ischys. ${healthName} and the Watch belong to ${owner}.`;
}

/**
 * The exercise rows a routine copy must bring along: every one the routines
 * use that is custom (not a catalog row) or that the new file doesn't have,
 * each once.
 */
export function exercisesToCopy(
  routineExerciseIds: readonly string[],
  source: readonly { id: string; userId: string | null; isCustom: number }[],
  presentInTarget: ReadonlySet<string>,
): string[] {
  const need = new Set(
    source.filter((e) => e.userId !== null || e.isCustom !== 0 || !presentInTarget.has(e.id)).map((e) => e.id),
  );
  return referencedCustomExerciseIds(routineExerciseIds, need);
}

// --- Manage and delete (P8, P8b) ---

/** "‹First›'s", or "this profile's" when the name has no words. */
export function possessive(name: string): string {
  const first = firstName(name);
  return first ? `${first}'s` : "this profile's";
}

export type ProfileCounts = { workouts: number; routines: number; records: number };

/** A run of the delete sheet's body; `count` runs are drawn in mono `text1`. */
export type BodyPart = { text: string; count?: boolean };

const plural = (n: number, one: string) => `${one}${n === 1 ? '' : 's'}`;

/** The P8b body, split so the counts can be styled. */
export function deleteSheetBody(name: string, c: ProfileCounts): BodyPart[] {
  return [
    { text: `This erases ${possessive(name)} ` },
    { text: String(c.workouts), count: true },
    { text: ` ${plural(c.workouts, 'workout')}, ` },
    { text: String(c.routines), count: true },
    { text: ` ${plural(c.routines, 'routine')}, ` },
    { text: String(c.records), count: true },
    {
      text: ` ${plural(c.records, 'record')} and every measurement from this phone. Other profiles aren't affected. This can't be undone.`,
    },
  ];
}

/** Where a row dragged `dy` points from `from` lands, in a list of `n` rows `slot` points apart. */
export function dropIndex(from: number, dy: number, slot: number, n: number): number {
  return Math.max(0, Math.min(n - 1, from + Math.round(dy / slot)));
}

/** A copy of `items` with the item at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

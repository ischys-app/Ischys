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

function graphemes(s: string): string[] {
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(seg.segment(s), (x) => x.segment);
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

export function switchBlock(a: {
  targetId: string;
  currentId: string;
  activeWorkoutProfileId: string | null;
  transactionOpen: boolean;
}): 'same' | 'workout' | 'busy' | null {
  if (a.targetId === a.currentId) return 'same';
  if (a.activeWorkoutProfileId !== null) return 'workout';
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
  if (!raw) return null;
  if (raw.trimStart().startsWith('{')) {
    try {
      const v = JSON.parse(raw) as { profileId?: unknown; workoutId?: unknown };
      if (typeof v.profileId === 'string' && typeof v.workoutId === 'string' && v.profileId && v.workoutId) {
        return { profileId: v.profileId, workoutId: v.workoutId };
      }
    } catch {
      /* fall through */
    }
    return null;
  }
  return { profileId: OWNER_ID, workoutId: raw };
}

export function referencedCustomExerciseIds(
  routineExerciseIds: readonly string[],
  customIds: ReadonlySet<string>,
): string[] {
  return Array.from(new Set(routineExerciseIds.filter((id) => customIds.has(id))));
}

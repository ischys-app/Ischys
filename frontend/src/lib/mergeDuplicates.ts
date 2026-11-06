/**
 * Duplicate-exercise detection, as pure decisions.
 *
 * The same lift gets saved twice — a casing/spacing variant ("Incline Bench
 * Press" vs "incline bench press"), an abbreviation from an import ("RDL" vs
 * "Romanian Deadlift" that share an import id), or a near-name a human has to
 * judge ("Cable Fly" vs "Cable Crossover"). A split like that silently halves a
 * PR, so we surface candidates and let a human confirm each merge — we never
 * auto-merge.
 *
 * This module is pure — no imports of DB/native code — so `node --test` can run
 * it. The repo layer (exercisesRepo) loads the rows + stats, calls in here, and
 * performs the write. See mergeDuplicates.test.ts.
 */
import type { RecordMetric } from '../api/types.ts';
import { t } from '../i18n/t.ts';

/** A flat, DB-free view of one exercise + the stats the flow needs to show. */
export type MergeCandidate = {
  id: string;
  name: string;
  equipment: string;
  primaryMuscleId: string | null;
  source: string | null;
  externalId: string | null;
  /** A shared catalog row: `user_id` null AND `is_custom` 0. */
  isCatalog: boolean;
  initials: string;
  /** Working-set count across completed history (for "N sets"). */
  setCount: number;
  /** Distinct completed-workout count (for "N workouts"). */
  workoutCount: number;
  /** Epoch-ms of the earliest completed session, or null if never logged. */
  firstWorkoutMs: number | null;
};

/**
 * Why a group was flagged. Order is significance, strongest first, so the safe
 * merges are offered before the judgement calls (README §3; board decision B).
 * `same_name` (name + equipment both exact) and `same_import` (a shared import
 * id) are near-certain; `similar_name` is the amber judgement call and is always
 * last. The mock (M2) lists them SAME NAME · SAME IMPORT · SIMILAR NAME — this
 * matches that.
 */
export type MergeReason = 'same_name' | 'same_import' | 'similar_name';

const REASON_RANK: Record<MergeReason, number> = {
  same_name: 0,
  same_import: 1,
  similar_name: 2,
};

export type DuplicateGroup = {
  reason: MergeReason;
  /** Members, survivor first, then losers in descending-history order. */
  members: MergeCandidate[];
  survivorId: string;
  /** One-line reason the survivor was preselected, shown on the card. */
  survivorReason: string;
};

/** 'Incline Bench Press' / 'incline  bench press' -> 'incline bench press'. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Significant tokens (normalized words), for the subset similarity test. */
function tokens(name: string): string[] {
  const n = normalizeName(name);
  return n ? n.split(' ') : [];
}

/** Classic Levenshtein edit distance between two strings. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** 1 - dist/maxLen, in [0,1]. 1 = identical. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na && !nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - editDistance(na, nb) / maxLen;
}

/** One name's significant tokens are wholly contained in the other's. */
function tokenSubset(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const set = new Set(big);
  return small.every((t) => set.has(t));
}

const SIMILARITY_THRESHOLD = 0.7;

/** Do two candidates share an import identity (same source AND external_id)? */
function sharesImportId(a: MergeCandidate, b: MergeCandidate): boolean {
  return (
    !!a.source &&
    !!a.externalId &&
    a.source === b.source &&
    a.externalId === b.externalId
  );
}

/** Same primary muscle, or unknown on at least one side (never contradicts). */
function muscleCompatible(a: MergeCandidate, b: MergeCandidate): boolean {
  if (!a.primaryMuscleId || !b.primaryMuscleId) return true;
  return a.primaryMuscleId === b.primaryMuscleId;
}

/**
 * The single strongest reason a pair is a duplicate, or null. Guards live here:
 * two catalog rows never pair (a collision there is a catalog bug), and
 * equipment must match for a name-based reason — barbell and dumbbell bench are
 * different lifts with different PRs, so a mismatch never reaches similar_name.
 */
export function pairReason(a: MergeCandidate, b: MergeCandidate): MergeReason | null {
  if (a.id === b.id) return null;
  // Never merge two catalog rows.
  if (a.isCatalog && b.isCatalog) return null;

  const sameName = normalizeName(a.name) === normalizeName(b.name);
  const sameEquip = a.equipment === b.equipment;

  if (sameName && sameEquip) return 'same_name';
  if (sharesImportId(a, b)) return 'same_import';
  if (
    !sameName &&
    sameEquip &&
    muscleCompatible(a, b) &&
    (tokenSubset(a.name, b.name) || nameSimilarity(a.name, b.name) >= SIMILARITY_THRESHOLD)
  ) {
    return 'similar_name';
  }
  return null;
}

/** Union-find over candidate indices. */
class DisjointSet {
  private parent: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

/**
 * Choose the survivor of a group and the one-line reason it was preselected.
 * Catalog beats custom (it carries images, how-to and muscle data); otherwise
 * the row with more history wins, since fewer records move and it is usually the
 * better-formed name.
 */
export function pickSurvivor(members: MergeCandidate[]): {
  survivorId: string;
  survivorReason: string;
} {
  const catalog = members.filter((m) => m.isCatalog);
  if (catalog.length === 1) {
    return { survivorId: catalog[0].id, survivorReason: t('mergeDup.reasonCatalog') };
  }
  const byHistory = [...members].sort(compareHistoryDesc);
  return { survivorId: byHistory[0].id, survivorReason: t('mergeDup.reasonHistory') };
}

/** More history first: workouts, then sets, then earliest start, then id. */
function compareHistoryDesc(a: MergeCandidate, b: MergeCandidate): number {
  if (b.workoutCount !== a.workoutCount) return b.workoutCount - a.workoutCount;
  if (b.setCount !== a.setCount) return b.setCount - a.setCount;
  const af = a.firstWorkoutMs ?? Number.POSITIVE_INFINITY;
  const bf = b.firstWorkoutMs ?? Number.POSITIVE_INFINITY;
  if (af !== bf) return af - bf;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Group candidates into duplicate sets. Three-or-more that chain together merge
 * into one survivor in a single pass. Groups with more than one catalog row are
 * dropped — that is a catalog bug, not user mess, and picking one catalog row to
 * delete another is never right.
 */
export function groupDuplicates(candidates: MergeCandidate[]): DuplicateGroup[] {
  const n = candidates.length;
  const ds = new DisjointSet(n);
  // Strongest reason seen on any edge inside each component.
  const bestReason = new Map<number, MergeReason>();

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const reason = pairReason(candidates[i], candidates[j]);
      if (!reason) continue;
      ds.union(i, j);
    }
  }

  // Second pass: now that components are settled, tag each with its strongest
  // constituent reason (recomputing the winning edge deterministically).
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const reason = pairReason(candidates[i], candidates[j]);
      if (!reason) continue;
      const root = ds.find(i);
      const prior = bestReason.get(root);
      if (prior === undefined || REASON_RANK[reason] < REASON_RANK[prior]) {
        bestReason.set(root, reason);
      }
    }
  }

  const byRoot = new Map<number, MergeCandidate[]>();
  for (let i = 0; i < n; i += 1) {
    const root = ds.find(i);
    const list = byRoot.get(root) ?? [];
    list.push(candidates[i]);
    byRoot.set(root, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, members] of byRoot) {
    if (members.length < 2) continue;
    if (members.filter((m) => m.isCatalog).length > 1) continue;
    const reason = bestReason.get(root);
    if (!reason) continue;
    const { survivorId, survivorReason } = pickSurvivor(members);
    const ordered = [
      ...members.filter((m) => m.id === survivorId),
      ...members.filter((m) => m.id !== survivorId).sort(compareHistoryDesc),
    ];
    groups.push({ reason, members: ordered, survivorId, survivorReason });
  }

  // Strongest reason first; within a reason, the bigger merge (more sets) first.
  groups.sort((a, b) => {
    if (REASON_RANK[a.reason] !== REASON_RANK[b.reason]) {
      return REASON_RANK[a.reason] - REASON_RANK[b.reason];
    }
    const sa = a.members.reduce((s, m) => s + m.setCount, 0);
    const sb = b.members.reduce((s, m) => s + m.setCount, 0);
    return sb - sa;
  });
  return groups;
}

// --- Personal-record reconciliation ---------------------------------------

/** One materialized PR: the value that decides the winner + how to show it. */
export type PrCell = { metric: RecordMetric; value: number; display: string };

/** One row of the M3 "BEST OF EACH KEPT" table / the M5 receipt's gained PR. */
export type ReconciledPr = {
  metric: RecordMetric;
  value: number;
  display: string;
  /** True when the winning value came from a discarded row, not the survivor. */
  fromDup: boolean;
};

/** Label + display order for the PR table (mock M3: 1RM, Best set, Most reps). */
const PR_ORDER: RecordMetric[] = ['est_1rm', 'best_set', 'max_reps', 'best_volume'];

/**
 * Keep the higher value per metric across the survivor and every discarded row.
 * A PR from a discarded row can win (`fromDup`) — the mock states exactly that
 * ("Most reps · from dup"), the single most reassuring thing the flow can say.
 * The survivor wins ties, so an equal record is never relabelled "from dup".
 */
export function reconcilePrs(survivor: PrCell[], losers: PrCell[][]): ReconciledPr[] {
  const survivorByMetric = new Map<RecordMetric, PrCell>();
  for (const c of survivor) survivorByMetric.set(c.metric, c);

  const loserBest = new Map<RecordMetric, PrCell>();
  for (const list of losers) {
    for (const c of list) {
      const cur = loserBest.get(c.metric);
      if (!cur || c.value > cur.value) loserBest.set(c.metric, c);
    }
  }

  const metrics = new Set<RecordMetric>([...survivorByMetric.keys(), ...loserBest.keys()]);
  const rows: ReconciledPr[] = [];
  for (const metric of metrics) {
    const s = survivorByMetric.get(metric);
    const l = loserBest.get(metric);
    // Survivor wins ties (>, not >=), so equal values stay "kept".
    if (l && (!s || l.value > s.value)) {
      rows.push({ metric, value: l.value, display: l.display, fromDup: true });
    } else if (s) {
      rows.push({ metric, value: s.value, display: s.display, fromDup: false });
    } else if (l) {
      rows.push({ metric, value: l.value, display: l.display, fromDup: true });
    }
  }

  rows.sort((a, b) => {
    const ia = PR_ORDER.indexOf(a.metric);
    const ib = PR_ORDER.indexOf(b.metric);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return rows;
}

/** Human label for a PR metric (board M3 table + M5 receipt). */
export function prMetricLabel(metric: RecordMetric): string {
  switch (metric) {
    case 'est_1rm':
      return t('mergeDup.metric.1rm');
    case 'best_set':
      return t('mergeDup.metric.bestSet');
    case 'max_reps':
      return t('mergeDup.metric.maxReps');
    case 'best_volume':
      return t('mergeDup.metric.bestVolume');
    default:
      return metric;
  }
}

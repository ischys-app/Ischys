/**
 * Exercise catalog + custom exercises + Exercise-Detail compute, on-device.
 * Ported from the original server implementation. Touches the DB — not node-tested.
 */
import { and, eq, inArray, like } from 'drizzle-orm';

import { db } from '../db/client';
import * as schema from '../db/schema';
import type {
  CategoryOut,
  ChartOut,
  ExerciseOut,
  HistorySessionOut,
  MuscleOut,
  RecordMetric,
  RecordOut,
  SetType,
} from '../api/types';
import { sessionMetric, type SetLike } from '../domain/stats';
import { LOCAL_USER_ID, newId, nowMs } from './ids';
import { toHistorySession, type ExerciseRow } from './map';
import { completedSessionsFor, hydrateExercises, loadExercise } from './queries';

/** 'Incline Bench Press' -> 'IB' (port of serializers.initials_of). */
export function initialsOf(name: string): string {
  const words = name.replace(/\(/g, ' ').split(/\s+/).filter((w) => /^[a-z0-9]/i.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return letters || name.slice(0, 2).toUpperCase();
}

const localDay = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function listCategories(): Promise<CategoryOut[]> {
  const rows = await db.select().from(schema.categories);
  return rows.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listMuscles(): Promise<MuscleOut[]> {
  const rows = await db.select().from(schema.muscles);
  return rows.map((m) => ({ id: m.id, name: m.name, group: m.group }));
}

export async function listExercises(
  params: { search?: string; category?: string } = {},
): Promise<ExerciseOut[]> {
  const filters = [] as ReturnType<typeof like>[];
  if (params.search) filters.push(like(schema.exercises.name, `%${params.search}%`));
  if (params.category) {
    const cat = (await db.select().from(schema.categories).where(eq(schema.categories.name, params.category)))[0];
    filters.push(eq(schema.exercises.categoryId, cat ? cat.id : '__none__'));
  }
  const rows = await db
    .select()
    .from(schema.exercises)
    .where(filters.length ? and(...filters) : undefined);
  const byId = await hydrateExercises(rows as ExerciseRow[]);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getExercise(id: string): Promise<ExerciseOut> {
  const ex = await loadExercise(id);
  if (!ex) throw new Error('exercise not found');
  return ex;
}

export async function createExercise(body: {
  name: string;
  kind: string;
  equipment: string;
  category_id?: string | null;
  primary_muscle_id?: string | null;
  secondary_muscle_ids?: string[];
  how_to_steps?: string[] | null;
}): Promise<ExerciseOut> {
  const id = newId();
  await db.insert(schema.exercises).values({
    id,
    userId: LOCAL_USER_ID,
    name: body.name,
    initials: initialsOf(body.name),
    kind: body.kind,
    equipment: body.equipment,
    categoryId: body.category_id ?? null,
    primaryMuscleId: body.primary_muscle_id ?? null,
    howToSteps: body.how_to_steps ?? null,
    isCustom: 1,
    updatedAt: nowMs(),
  });
  const secondary = body.secondary_muscle_ids ?? [];
  if (secondary.length) {
    await db
      .insert(schema.exerciseSecondaryMuscles)
      .values(secondary.map((muscleId) => ({ exerciseId: id, muscleId })));
  }
  return getExercise(id);
}

export async function patchExercise(
  id: string,
  body: Partial<{ name: string; how_to_steps: string[] | null; demo_url: string | null }>,
): Promise<ExerciseOut> {
  const patch: Record<string, unknown> = { updatedAt: nowMs() };
  if (body.name !== undefined) {
    patch.name = body.name;
    patch.initials = initialsOf(body.name);
  }
  if (body.how_to_steps !== undefined) patch.howToSteps = body.how_to_steps;
  if (body.demo_url !== undefined) patch.demoUrl = body.demo_url;
  await db.update(schema.exercises).set(patch).where(eq(schema.exercises.id, id));
  return getExercise(id);
}

export async function getExerciseHistory(id: string): Promise<HistorySessionOut[]> {
  const sessions = await completedSessionsFor(id);
  return sessions.map((s) =>
    toHistorySession(
      s.workoutId,
      s.startedAt,
      [...s.sets].sort((a, b) => a.position - b.position),
    ),
  );
}

export async function getExerciseRecords(id: string): Promise<RecordOut[]> {
  const rows = await db
    .select()
    .from(schema.personalRecords)
    .where(eq(schema.personalRecords.exerciseId, id));
  return rows.map((r) => ({
    metric: r.metric as RecordMetric,
    value: r.value,
    display: r.display,
    achieved_at: r.achievedAt === null ? null : new Date(r.achievedAt).toISOString(),
  }));
}

export async function getExerciseChart(
  id: string,
  metric: RecordMetric = 'est_1rm',
  sessions = 6,
): Promise<ChartOut> {
  const done = (await completedSessionsFor(id)).slice().reverse(); // oldest first
  // Group by local day; sets that are done only (session_metric excludes undone).
  const byDay = new Map<string, SetLike[]>();
  for (const s of done) {
    const key = localDay(s.startedAt);
    const list = byDay.get(key) ?? [];
    for (const set of s.sets) {
      list.push({ type: set.type as SetType, weight: set.weight, reps: set.reps, done: set.done !== 0 });
    }
    byDay.set(key, list);
  }
  const points: { label: string; value: number }[] = [];
  for (const [label, sets] of byDay) {
    const v = sessionMetric(sets, metric);
    if (v !== null) points.push({ label, value: v });
  }
  const last = points.slice(-sessions);
  return { metric, labels: last.map((p) => p.label), values: last.map((p) => p.value) };
}

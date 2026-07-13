/**
 * Profile, Home dashboard, and recent-records — local equivalents of /profile,
 * /dashboard, /records/recent. Single on-device user; name defaults to "Athlete"
 * and "training since" is derived from the first workout (no account exists).
 */
import { and, desc, eq, gte, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import * as schema from '../db/schema';
import type {
  Dashboard,
  ProfileOut,
  RecordMetric,
  RecordOut,
  WeekBar,
} from '../api/types';
import { profileStats } from '../domain/profileStats';
import { dayStreak } from '../domain/streak';
import { getProfileName } from '../lib/profileName';
import { LOCAL_USER_ID } from './ids';
import { toWorkoutListItem, type WorkoutRow } from './map';
import { muscleTagsByWorkout } from './queries';

const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isoMonday = (d: Date) => {
  const diff = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
};
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function completedWorkouts(): Promise<WorkoutRow[]> {
  return (await db.select().from(schema.workouts).where(eq(schema.workouts.status, 'completed'))) as WorkoutRow[];
}

export async function getProfile(): Promise<ProfileOut> {
  const completed = await completedWorkouts();
  const stats = profileStats(
    completed.map((w) => ({ startedAt: w.startedAt, totalVolume: w.totalVolume })),
    new Date(),
  );
  const first = completed.reduce<number | null>((min, w) => (min === null || w.startedAt < min ? w.startedAt : min), null);
  return {
    id: LOCAL_USER_ID,
    name: await getProfileName(),
    email: null,
    location: null,
    training_since: first === null ? null : ymd(new Date(first)),
    stats: {
      workouts: stats.workouts,
      this_year: stats.thisYear,
      volume_lifted: stats.volumeLifted,
      current_streak: stats.currentStreak,
    },
  };
}

export async function getDashboard(): Promise<Dashboard> {
  const today = startOfDay(new Date());
  const monday = isoMonday(today);
  const mondayMs = monday.getTime();

  const weekRows = (await db
    .select()
    .from(schema.workouts)
    .where(and(eq(schema.workouts.status, 'completed'), gte(schema.workouts.startedAt, mondayMs)))) as WorkoutRow[];

  const weekVol = [0, 0, 0, 0, 0, 0, 0];
  let sets = 0;
  let timeS = 0;
  for (const w of weekRows) {
    const idx = Math.round((startOfDay(new Date(w.startedAt)).getTime() - mondayMs) / 86_400_000);
    if (idx >= 0 && idx <= 6) weekVol[idx] += w.totalVolume;
    sets += w.totalSets;
    timeS += w.durationSeconds;
  }
  const week: WeekBar[] = WEEK_LABELS.map((label, i) => ({
    label,
    volume: weekVol[i],
    today: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i).getTime() === today.getTime(),
  }));

  const routineRows = await db.select().from(schema.routines).orderBy(schema.routines.position);
  const routines = await Promise.all(
    routineRows.map(async (r) => {
      const res = await db.select().from(schema.routineExercises).where(eq(schema.routineExercises.routineId, r.id));
      const reIds = res.map((re) => re.id);
      const setCount = reIds.length
        ? (await db.select().from(schema.routineSets).where(inArray(schema.routineSets.routineExerciseId, reIds))).length
        : 0;
      const exRows = res.length
        ? await db.select().from(schema.exercises).where(inArray(schema.exercises.id, res.map((re) => re.exerciseId)))
        : [];
      const nameById = new Map(exRows.map((e) => [e.id, e.name]));
      const names = res.map((re) => nameById.get(re.exerciseId) ?? '');
      const detail = names.slice(0, 6).join(', ') + (names.length > 6 ? ` +${names.length - 6}` : '');
      return {
        id: r.id,
        name: r.name,
        initials: r.initials,
        position: r.position,
        exercise_count: res.length,
        set_count: setCount,
        detail,
      };
    }),
  );

  const recentRows = (await db
    .select()
    .from(schema.workouts)
    .where(eq(schema.workouts.status, 'completed'))
    .orderBy(desc(schema.workouts.startedAt))
    .limit(5)) as WorkoutRow[];
  const tags = await muscleTagsByWorkout(recentRows.map((w) => w.id));
  const recent = recentRows.map((w) => toWorkoutListItem(w, tags.get(w.id) ?? []));

  const allDates = (await completedWorkouts()).map((w) => new Date(w.startedAt));
  return {
    date: ymd(today),
    stats: {
      workouts_done: weekRows.length,
      workouts_target: 4,
      volume: Math.round(weekVol.reduce((a, b) => a + b, 0) * 10) / 10,
      sets,
      time_seconds: timeS,
      streak_days: dayStreak(allDates, today),
    },
    week,
    routines,
    recent,
  };
}

export async function listRecentRecords(limit = 10): Promise<RecordOut[]> {
  const rows = await db.select().from(schema.personalRecords);
  // Most-recent PR per exercise across all metrics, newest first.
  const bestPerExercise = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = bestPerExercise.get(r.exerciseId);
    if (!cur || (r.achievedAt ?? 0) > (cur.achievedAt ?? 0)) bestPerExercise.set(r.exerciseId, r);
  }
  const picked = [...bestPerExercise.values()].sort((a, b) => (b.achievedAt ?? 0) - (a.achievedAt ?? 0)).slice(0, limit);
  const exRows = picked.length
    ? await db.select().from(schema.exercises).where(inArray(schema.exercises.id, picked.map((r) => r.exerciseId)))
    : [];
  const nameById = new Map(exRows.map((e) => [e.id, e.name]));
  return picked.map((r) => ({
    metric: r.metric as RecordMetric,
    value: r.value,
    display: r.display,
    achieved_at: r.achievedAt === null ? null : new Date(r.achievedAt).toISOString(),
    exercise_name: nameById.get(r.exerciseId) ?? null,
  }));
}

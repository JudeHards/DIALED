import type { SupabaseClient } from '@supabase/supabase-js';
import { catalogSchema, routineSchema, workoutSchema, type CatalogExercise, type Routine, type Workout } from '@dialed/shared';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function dbError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === '40001') throw new HttpError(409, error.message);
  if (error.code === '42501' || error.code === 'PGRST116') throw new HttpError(404, 'Record not found');
  if (error.code?.startsWith('22') || error.code?.startsWith('23')) throw new HttpError(400, 'Invalid workout or routine data');
  throw new HttpError(503, 'Storage is temporarily unavailable. Your draft is kept on this device.');
}
export interface Repository {
  catalog(): Promise<CatalogExercise[]>;
  routines(): Promise<Routine[]>;
  routine(id: string): Promise<Routine>;
  saveRoutine(doc: Routine, version: number, mutationId: string): Promise<Routine>;
  deleteRoutine(id: string, version: number): Promise<void>;
  workouts(): Promise<Workout[]>;
  workout(id: string): Promise<Workout>;
  saveWorkout(doc: Workout, version: number, mutationId: string): Promise<Workout>;
  profile(): Promise<{ timezone: string } | null>;
  saveProfile(timezone: string): Promise<{ timezone: string }>;
}
export class SupabaseRepository implements Repository {
  constructor(private db: SupabaseClient, private userId: string) {}
  async catalog() {
    const { data, error } = await this.db.from('exercises').select('data').order('id'); dbError(error);
    return (data ?? []).map(row => catalogSchema.parse(row.data));
  }
  async routines() {
    const { data, error } = await this.db.from('routines').select('*, routine_exercises(*)').order('updated_at', { ascending: false }); dbError(error);
    return (data ?? []).map(row => routineSchema.parse({ id: row.id, name: row.name, version: row.version, exercises: row.routine_exercises.sort((a: { position: number }, b: { position: number }) => a.position - b.position).map((e: { id: string; exercise_id: string; prescription: unknown }) => ({ id: e.id, exerciseId: e.exercise_id, prescription: e.prescription })) }));
  }
  async routine(id: string) {
    const { data, error } = await this.db.rpc('routine_document', { p_id: id }); dbError(error);
    if (!data) throw new HttpError(404, 'Routine not found');
    return routineSchema.parse(data);
  }
  async saveRoutine(doc: Routine, version: number, mutationId: string) {
    const { data, error } = await this.db.rpc('save_routine', { p_document: doc, p_expected_version: version, p_mutation_id: mutationId }); dbError(error);
    return routineSchema.parse(data);
  }
  async deleteRoutine(id: string, version: number) {
    const { error } = await this.db.rpc('delete_routine', { p_id: id, p_expected_version: version }); dbError(error);
  }
  async workouts() {
    // Page through parents rather than silently truncating at PostgREST's row limit.
    const result: Workout[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await this.db.from('workouts').select('*, session_exercises(*, exercise_sets(*))').order('started_at', { ascending: false }).order('id').range(offset, offset + 99); dbError(error);
      for (const row of data ?? []) {
        result.push(workoutSchema.parse({ id: row.id, name: row.name, version: row.version, routineId: row.routine_id, status: row.status,
          startedAt: new Date(row.started_at).toISOString(), completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
          exercises: row.session_exercises.sort((a: { position: number }, b: { position: number }) => a.position - b.position).map((e: { id: string; exercise_id: string; snapshot: unknown; prescription: unknown; exercise_sets: { id: string; position: number; weight: number | null; reps: number | null; rir: number | null; completed: boolean; warmup: boolean }[] }) => ({
            id: e.id, exerciseId: e.exercise_id, snapshot: e.snapshot, prescription: e.prescription,
            sets: e.exercise_sets.sort((a, b) => a.position - b.position).map(({ id, weight, reps, rir, completed, warmup }) => ({ id, weight, reps, rir, completed, warmup })),
          })),
        }));
      }
      if (!data || data.length < 100) return result;
    }
  }
  async workout(id: string) {
    const { data, error } = await this.db.rpc('workout_document', { p_id: id }); dbError(error);
    if (!data) throw new HttpError(404, 'Workout not found');
    return workoutSchema.parse(data);
  }
  async saveWorkout(doc: Workout, version: number, mutationId: string) {
    const { data, error } = await this.db.rpc('save_workout', { p_document: doc, p_expected_version: version, p_mutation_id: mutationId }); dbError(error);
    return workoutSchema.parse(data);
  }
  async profile() {
    const { data, error } = await this.db.from('profiles').select('timezone').eq('user_id', this.userId).maybeSingle(); dbError(error); return data;
  }
  async saveProfile(timezone: string) {
    const { error } = await this.db.from('profiles').upsert({ user_id: this.userId, timezone }); dbError(error); return { timezone };
  }
}

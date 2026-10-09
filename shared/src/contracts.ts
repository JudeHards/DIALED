import { z } from 'zod';
import { muscles, musclePartIds, musclePartDetails, normalizeMuscleGroup } from './muscles';

export { muscles } from './muscles';
// The old label remains valid for saved snapshots and queued offline mutations.
export const muscleSchema = z.enum([...muscles, 'anterior delt']);
export const muscleTargetSchema = z.object({
  part: z.enum(musclePartIds),
  role: z.enum(['primary', 'secondary']),
  // Biased means expected emphasis from exercise selection, never isolation or
  // a measured percentage. Shared targets are involved without a head bias.
  emphasis: z.enum(['biased', 'shared']),
}).strict();
export type MuscleTarget = z.infer<typeof muscleTargetSchema>;
export const catalogSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1).max(160),
  primaryMuscle: muscleSchema, secondaryMuscles: z.array(muscleSchema),
  equipment: z.string(), movement: z.string(), laterality: z.enum(['unilateral', 'bilateral', 'either']),
  // Omission identifies a legacy snapshot. Do not default or backfill it from
  // today's catalogue: historical training detail would otherwise change.
  muscleTargets: z.array(muscleTargetSchema).min(1).max(musclePartIds.length).optional(),
  biasNotes: z.string().trim().min(1).max(1000).optional(),
}).strict().superRefine((exercise, ctx) => {
  const primary = normalizeMuscleGroup(exercise.primaryMuscle);
  const secondary = exercise.secondaryMuscles.map(normalizeMuscleGroup);
  if (secondary.includes(primary) || new Set(secondary).size !== secondary.length) {
    ctx.addIssue({ code: 'custom', message: 'Muscle groups must be distinct', path: ['secondaryMuscles'] });
  }
  if (!exercise.muscleTargets) return;
  const parts = new Set<string>();
  for (const [index, target] of exercise.muscleTargets.entries()) {
    if (parts.has(target.part)) ctx.addIssue({ code: 'custom', message: 'Muscle parts must be unique', path: ['muscleTargets', index, 'part'] });
    parts.add(target.part);
    const group = musclePartDetails[target.part].group;
    if (target.role === 'primary' ? group !== primary : !secondary.includes(group)) {
      ctx.addIssue({ code: 'custom', message: 'Muscle part role must match its broad muscle group', path: ['muscleTargets', index, 'role'] });
    }
    if (target.emphasis === 'biased' && target.role !== 'primary') {
      ctx.addIssue({ code: 'custom', message: 'Bias must describe a primary target', path: ['muscleTargets', index, 'emphasis'] });
    }
  }
  if (!exercise.muscleTargets.some(target => target.role === 'primary')) {
    ctx.addIssue({ code: 'custom', message: 'Include at least one primary muscle part', path: ['muscleTargets'] });
  }
  for (const group of secondary) {
    if (!exercise.muscleTargets.some(target => musclePartDetails[target.part].group === group)) {
      ctx.addIssue({ code: 'custom', message: `Include a muscle part for secondary group ${group}`, path: ['muscleTargets'] });
    }
  }
});
export type CatalogExercise = z.infer<typeof catalogSchema>;
export const prescriptionSchema = z.object({
  workingSets: z.number().int().min(1).max(20).default(3),
  repMin: z.number().int().min(1).max(100).default(8),
  repMax: z.number().int().min(1).max(100).default(12),
  incrementKg: z.number().finite().positive().max(100).default(2.5),
}).strict().refine(v => v.repMin <= v.repMax, { message: 'Minimum reps must not exceed maximum reps', path: ['repMax'] });
export const setSchema = z.object({
  id: z.string().uuid(), weight: z.number().finite().min(0).max(2000).nullable(),
  reps: z.number().int().min(1).max(1000).nullable(),
  rir: z.number().int().min(0).max(10).nullable().default(null),
  completed: z.boolean(), warmup: z.boolean().default(false),
}).strict().refine(v => !v.completed || (v.weight !== null && v.reps !== null), { message: 'Completed sets need a weight and reps' });
export const routineExerciseSchema = z.object({
  id: z.string().uuid(), exerciseId: z.string().min(1), prescription: prescriptionSchema,
}).strict();
export const sessionExerciseSchema = routineExerciseSchema.extend({
  snapshot: catalogSchema, sets: z.array(setSchema).max(50),
}).strict().refine(v => v.exerciseId === v.snapshot.id, { message: 'Exercise and snapshot IDs must match' });
const metadata = {
  id: z.string().uuid(), name: z.string().trim().min(1).max(120), version: z.number().int().min(0),
};
export const routineSchema = z.object({ ...metadata, exercises: z.array(routineExerciseSchema).min(1).max(50) }).strict();
export const workoutSchema = z.object({
  ...metadata, routineId: z.string().uuid().nullable().default(null),
  status: z.enum(['in_progress', 'completed']), startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(), exercises: z.array(sessionExerciseSchema).max(50),
}).strict().superRefine((v, ctx) => {
  if ((v.status === 'completed') !== (v.completedAt !== null)) ctx.addIssue({ code: 'custom', message: 'Completion date must match session status' });
  if (v.completedAt && new Date(v.completedAt) < new Date(v.startedAt)) ctx.addIssue({ code: 'custom', message: 'Completion cannot precede start' });
  if (v.status === 'completed' && !v.exercises.some(e => e.sets.some(s => s.completed))) ctx.addIssue({ code: 'custom', message: 'Complete at least one set before finishing' });
  const ids = v.exercises.flatMap(e => [e.id, ...e.sets.map(s => s.id)]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Exercise and set IDs must be unique' });
});
export const mutationSchema = z.object({ mutationId: z.string().uuid(), expectedVersion: z.number().int().min(0) });
export const saveWorkoutSchema = mutationSchema.extend({ workout: workoutSchema }).strict();
export const saveRoutineSchema = mutationSchema.extend({ routine: routineSchema }).strict();
export const profileSchema = z.object({ timezone: z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }, 'Invalid timezone') }).strict();
export type Prescription = z.infer<typeof prescriptionSchema>;
export type ExerciseSet = z.infer<typeof setSchema>;
export type SessionExercise = z.infer<typeof sessionExerciseSchema>;
export type Routine = z.infer<typeof routineSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type Recommendation = {
  action: 'increase' | 'decrease' | 'hold' | 'baseline' | 'unsupported';
  proposedKg: number | null; previousKg: number | null; sourceSessionIds: string[]; reason: string;
  evidence: { sessionId: string; completedAt: string; sets: { weight: number | null; reps: number | null; rir: number | null }[] }[];
};
export function defaultPrescription(equipment: string): Prescription {
  return { workingSets: 3, repMin: 8, repMax: 12, incrementKg: equipment === 'dumbbell' ? 1 : 2.5 };
}

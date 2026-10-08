import express, { type Request, type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { saveWorkoutSchema, saveRoutineSchema, profileSchema, recommend, weeklySummary } from '@dialed/shared';
import { HttpError, SupabaseRepository, type Repository } from './services/repository';
import { configuredExplanations, type Explanations } from './services/explanations';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
export type Context = { userId: string; repo: Repository };
type Authenticate = (token: string) => Promise<Context>;
async function authenticate(token: string): Promise<Context> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError(503, 'Configure Supabase before signing in.');
  const db = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.getClaims(token);
  if (error || !data?.claims.sub) throw new HttpError(401, 'Please sign in again. Your draft is saved on this device.');
  return { userId: data.claims.sub, repo: new SupabaseRepository(db, data.claims.sub) };
}
const idSchema = z.string().uuid();
// Shared contracts can be loaded through either the ESM or CommonJS Zod export.
// Validate the error shape rather than relying on cross-module instanceof checks.
const validationErrorSchema = z.object({ name: z.literal('ZodError'), issues: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })) });
export function createApp(options: { authenticate?: Authenticate; explanations?: Explanations; frontendDirectory?: string } = {}) {
  const app = express();
  const explanations = options.explanations ?? configuredExplanations();
  app.disable('x-powered-by');
  app.use(cors({ origin: (process.env.APP_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',') }));
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) }));
  app.use('/api', async (req, res, next) => {
    const match = req.headers.authorization?.match(/^Bearer (.+)$/);
    if (!match) throw new HttpError(401, 'Sign in to access your training.');
    res.locals.context = await (options.authenticate ?? authenticate)(match[1]);
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/exercises', async (_req, res) => res.json(await (res.locals.context as Context).repo.catalog()));
  app.get('/api/exercises/:id', async (req, res) => {
    const exercise = (await (res.locals.context as Context).repo.catalog()).find(e => e.id === req.params.id);
    if (!exercise) throw new HttpError(404, 'Exercise not found'); res.json(exercise);
  });
  app.get('/api/profile', async (_req, res) => res.json(await (res.locals.context as Context).repo.profile()));
  app.put('/api/profile', async (req, res) => res.json(await (res.locals.context as Context).repo.saveProfile(profileSchema.parse(req.body).timezone)));
  app.get('/api/routines', async (_req, res) => res.json(await (res.locals.context as Context).repo.routines()));
  app.get('/api/routines/:id', async (req, res) => res.json(await (res.locals.context as Context).repo.routine(idSchema.parse(req.params.id))));
  app.put('/api/routines/:id', async (req, res) => {
    const { routine, expectedVersion, mutationId } = saveRoutineSchema.parse(req.body);
    if (routine.id !== req.params.id || routine.version !== expectedVersion) throw new HttpError(400, 'Routine ID/version mismatch');
    res.json(await (res.locals.context as Context).repo.saveRoutine(routine, expectedVersion, mutationId));
  });
  app.delete('/api/routines/:id', async (req, res) => {
    const version = z.object({ expectedVersion: z.number().int().positive() }).strict().parse(req.body).expectedVersion;
    await (res.locals.context as Context).repo.deleteRoutine(idSchema.parse(req.params.id), version); res.status(204).end();
  });
  app.post('/api/routines/:id/start', async (req, res) => {
    const { sessionId, mutationId, startedAt, workout } = z.object({ sessionId: idSchema, mutationId: idSchema, startedAt: z.string().datetime(), workout: saveWorkoutSchema.shape.workout }).strict().parse(req.body);
    const repo = (res.locals.context as Context).repo;
    // A client-created session is the same document on every retry, including child IDs.
    const routine = await repo.routine(idSchema.parse(req.params.id));
    if (workout.id !== sessionId || workout.routineId !== routine.id || workout.startedAt !== startedAt || workout.version !== 0 || workout.status !== 'in_progress') throw new HttpError(400, 'Invalid routine session');
    res.status(201).json(await repo.saveWorkout(workout, 0, mutationId));
  });
  app.get('/api/workouts', async (_req, res) => res.json(await (res.locals.context as Context).repo.workouts()));
  app.get('/api/workouts/:id', async (req, res) => res.json(await (res.locals.context as Context).repo.workout(idSchema.parse(req.params.id))));
  const save = async (req: Request, context: Context, complete = false) => {
    const { workout, expectedVersion, mutationId } = saveWorkoutSchema.parse(req.body);
    if (workout.id !== req.params.id || workout.version !== expectedVersion || (complete && workout.status !== 'completed')) throw new HttpError(400, 'Workout ID, version or status mismatch');
    return context.repo.saveWorkout(workout, expectedVersion, mutationId);
  };
  app.put('/api/workouts/:id', async (req, res) => res.json(await save(req, res.locals.context)));
  app.post('/api/workouts/:id/complete', async (req, res) => res.json(await save(req, res.locals.context, true)));
  async function decision(req: Request, context: Context) {
    const workout = await context.repo.workout(idSchema.parse(req.params.id));
    const exercise = workout.exercises.find(e => e.id === req.params.exerciseId);
    if (!exercise) throw new HttpError(404, 'Exercise not found');
    const history = (await context.repo.workouts()).filter(w => w.id !== workout.id);
    return { exercise, recommendation: recommend(exercise, history) };
  }
  app.get('/api/workouts/:id/exercises/:exerciseId/recommendation', async (req, res) => res.json((await decision(req, res.locals.context)).recommendation));
  app.post('/api/workouts/:id/exercises/:exerciseId/explanation', async (req, res) => {
    const ctx = res.locals.context as Context; const { exercise, recommendation } = await decision(req, ctx);
    res.json(await explanations.explain(ctx.userId, exercise, recommendation));
  });
  app.get('/api/summary/weekly', async (_req, res) => {
    const repo = (res.locals.context as Context).repo;
    res.json(weeklySummary(await repo.workouts(), (await repo.profile())?.timezone ?? 'UTC'));
  });
  if (options.frontendDirectory) {
    const index = join(options.frontendDirectory, 'index.html');
    if (!existsSync(index)) throw new Error('Build the frontend before starting the production server.');
    app.use(express.static(options.frontendDirectory, {
      setHeaders: (res, file) => res.setHeader('Cache-Control', file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'),
    }));
    app.get(/.*/, (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/') || extname(req.path) || !req.accepts('html')) { next(); return; }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(index);
    });
  }
  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    const validationError = validationErrorSchema.safeParse(err);
    if (validationError.success) { res.status(400).json({ error: validationError.data.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }); return; }
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
    if (err instanceof SyntaxError) { res.status(400).json({ error: 'Invalid JSON' }); return; }
    console.error(JSON.stringify({ event: 'api_error', requestId: randomUUID() }));
    res.status(500).json({ error: 'Unexpected server error. Your local draft is retained.' });
  };
  app.use(errors);
  return app;
}

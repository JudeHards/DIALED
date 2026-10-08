import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app';
import { HttpError, type Repository } from '../src/services/repository';
import { Explanations } from '../src/services/explanations';
import { bench, routine, userA, userB, workout } from './fixtures';
import type { Workout } from '@dialed/shared';

function repository(): Repository {
  return {
    catalog: vi.fn(async () => [bench]), routines: vi.fn(async () => []), routine: vi.fn(async () => routine()),
    saveRoutine: vi.fn(async doc => ({ ...doc, version: doc.version + 1 })), deleteRoutine: vi.fn(async () => undefined),
    workouts: vi.fn(async () => []), workout: vi.fn(async () => workout()),
    saveWorkout: vi.fn(async doc => ({ ...doc, version: doc.version + 1 })),
    profile: vi.fn(async () => ({ timezone: 'Europe/Dublin' })), saveProfile: vi.fn(async timezone => ({ timezone })),
  };
}
describe('HTTP authentication, validation and route wiring', () => {
  let repo: Repository;
  let otherRepo: Repository;
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    repo = repository(); otherRepo = repository();
    app = createApp({ authenticate: async token => {
      if (token === 'alice') return { userId: userA, repo };
      if (token === 'bob') return { userId: userB, repo: otherRepo };
      throw new HttpError(401, 'Please sign in again. Your draft is saved on this device.');
    }, explanations: new Explanations() });
  });
  const auth = { Authorization: 'Bearer alice' };
  const payload = (doc = workout()) => ({ workout: doc, expectedVersion: doc.version, mutationId: randomUUID() });

  it('health is public while catalogue, sessions, profiles and summaries require a valid token', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
    for (const path of ['/api/exercises', '/api/workouts', '/api/routines', '/api/profile', '/api/summary/weekly']) {
      expect((await request(app).get(path)).status).toBe(401);
      expect((await request(app).get(path).set('Authorization', 'Bearer expired')).status).toBe(401);
    }
    expect(repo.workouts).not.toHaveBeenCalled();
  });

  it('routes use the verified account context and prevent caching private responses', async () => {
    vi.mocked(repo.workouts).mockResolvedValue([workout()]);
    const own = await request(app).get('/api/workouts').set(auth);
    const other = await request(app).get('/api/workouts').set('Authorization', 'Bearer bob');
    expect(own.body).toHaveLength(1);
    expect(other.body).toEqual([]);
    expect(own.headers['cache-control']).toBe('no-store');
    expect(repo.workouts).toHaveBeenCalledOnce();
    expect(otherRepo.workouts).toHaveBeenCalledOnce();
  });

  it('round trips zero weight, reps, RIR, muscle metadata and stable mutation IDs', async () => {
    const draft = workout(); draft.exercises[0].sets[0].weight = 0;
    const body = payload(draft);
    const res = await request(app).put(`/api/workouts/${draft.id}`).set(auth).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...draft, version: 1 });
    expect(repo.saveWorkout).toHaveBeenCalledWith(draft, 0, body.mutationId);
  });

  it.each([
    ['negative weight', (w: Workout) => { w.exercises[0].sets[0].weight = -1; }],
    ['fractional reps', (w: Workout) => { w.exercises[0].sets[0].reps = 2.5; }],
    ['invalid effort', (w: Workout) => { w.exercises[0].sets[0].rir = 11; }],
    ['completed blank set', (w: Workout) => { w.exercises[0].sets[0].reps = null; }],
    ['invalid rep range', (w: Workout) => { w.exercises[0].prescription.repMin = 15; }],
    ['duplicate IDs', (w: Workout) => { w.exercises[0].sets[1].id = w.exercises[0].sets[0].id; }],
    ['mismatched snapshot', (w: Workout) => { w.exercises[0].snapshot.id = 'different'; }],
  ])('rejects %s before storage', async (_label, change) => {
    const draft = workout(); change(draft);
    expect((await request(app).put(`/api/workouts/${draft.id}`).set(auth).send(payload(draft))).status).toBe(400);
    expect(repo.saveWorkout).not.toHaveBeenCalled();
  });

  it('rejects forged account fields, URL IDs, invalid JSON and mismatched versions', async () => {
    const draft = workout(); const body = payload(draft);
    for (const bad of [{ ...body, userId: userB }, { ...body, expectedVersion: 3 }]) {
      expect((await request(app).put(`/api/workouts/${draft.id}`).set(auth).send(bad)).status).toBe(400);
    }
    expect((await request(app).put(`/api/workouts/${randomUUID()}`).set(auth).send(body)).status).toBe(400);
    expect((await request(app).put(`/api/workouts/${draft.id}`).set(auth).set('Content-Type', 'application/json').send('{ broken')).status).toBe(400);
    expect(repo.saveWorkout).not.toHaveBeenCalled();
  });

  it('completes the existing session and returns version conflicts for local recovery', async () => {
    const draft = workout({ version: 1, status: 'completed', completedAt: '2026-10-07T11:00:00.000Z' });
    const result = await request(app).post(`/api/workouts/${draft.id}/complete`).set(auth).send(payload(draft));
    expect(result.status).toBe(200); expect(result.body.id).toBe(draft.id); expect(result.body.version).toBe(2);
    vi.mocked(repo.saveWorkout).mockRejectedValueOnce(new HttpError(409, 'Workout changed on another device'));
    const conflict = await request(app).put(`/api/workouts/${draft.id}`).set(auth).send(payload(draft));
    expect(conflict.status).toBe(409); expect(conflict.body.error).toContain('another device');
  });

  it('wires routine create, edit, start and delete using stable session IDs', async () => {
    const template = routine();
    const saved = await request(app).put(`/api/routines/${template.id}`).set(auth).send({ routine: template, expectedVersion: 0, mutationId: randomUUID() });
    expect(saved.status).toBe(200); expect(saved.body.version).toBe(1);
    vi.mocked(repo.routine).mockResolvedValue(saved.body);
    const draft = workout({ routineId: template.id }); const mutationId = randomUUID();
    const started = await request(app).post(`/api/routines/${template.id}/start`).set(auth).send({ sessionId: draft.id, mutationId, startedAt: draft.startedAt, workout: draft });
    expect(started.status).toBe(201); expect(repo.saveWorkout).toHaveBeenCalledWith(draft, 0, mutationId);
    const deleted = await request(app).delete(`/api/routines/${template.id}`).set(auth).send({ expectedVersion: 1 });
    expect(deleted.status).toBe(204); expect(repo.deleteRoutine).toHaveBeenCalledWith(template.id, 1);
  });

  it('returns numeric recommendations independently of AI and supplies a rules fallback', async () => {
    const current = workout();
    vi.mocked(repo.workout).mockResolvedValue(current);
    vi.mocked(repo.workouts).mockResolvedValue([
      workout({ status: 'completed', completedAt: '2026-10-06T11:00:00.000Z' }),
      workout({ status: 'completed', completedAt: '2026-10-04T11:00:00.000Z' }),
    ]);
    const path = `/api/workouts/${current.id}/exercises/${current.exercises[0].id}`;
    const recommendation = await request(app).get(`${path}/recommendation`).set(auth);
    expect(recommendation.status).toBe(200); expect(recommendation.body.proposedKg).toBe(52.5);
    const explanation = await request(app).post(`${path}/explanation`).set(auth);
    expect(explanation.body).toEqual({ source: 'rules', explanation: recommendation.body.reason });
    expect((await request(app).get(`/api/workouts/${current.id}/exercises/${randomUUID()}/recommendation`).set(auth)).status).toBe(404);
  });

  it('validates saved timezone and wires weekly summaries to account history', async () => {
    expect((await request(app).put('/api/profile').set(auth).send({ timezone: 'Atlantis/Unknown' })).status).toBe(400);
    expect((await request(app).put('/api/profile').set(auth).send({ timezone: 'Europe/Dublin' })).status).toBe(200);
    const result = await request(app).get('/api/summary/weekly').set(auth);
    expect(result.status).toBe(200); expect(result.body.timezone).toBe('Europe/Dublin'); expect(result.body.counts).toHaveLength(10);
  });
});

// Opt-in live smoke test. Uses a private .env.test.local admin key ONLY to manage
// disposable test users. App requests always use ordinary user access tokens.
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
config({ path: '.env.test.local', quiet: true });
config({ path: 'dialed-api/.env', quiet: true });
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !secret || !key) throw new Error('Configure .env.test.local and dialed-api/.env before live verification.');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const users = [];
let server;
const base = process.env.LIVE_API_BASE || 'http://127.0.0.1:3100/api';
const remote = Boolean(process.env.LIVE_API_BASE);
async function start() {
  if (remote) return;
  server = spawn(process.execPath, ['dialed-api/dist/index.js'], { env: { ...process.env, PORT: '3100' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`API exited: ${code}`))); });
}
async function stop() { if (server && server.exitCode === null) { const closed = once(server, 'exit'); server.kill('SIGTERM'); await closed; } }
async function request(user, path, method = 'GET', body, status = 200) {
  console.log(`Checking ${method} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')}`);
  const response = await fetch(base + path, { signal: AbortSignal.timeout(15000), method, headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = response.status === 204 ? null : await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `dialed-smoke-${randomUUID()}@example.com`, password = randomUUID() + 'aA!';
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const user = { id: data.user.id, email, password }; users.push(user);
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    user.token = signed.data.session.access_token;
    user.client = client;
  }
  const [a, b] = users;
  await start();
  const catalogue = await request(a, '/exercises'); assert.equal(catalogue.length, 33);
  const bench = catalogue.find(e => e.id === 'ex_bench_barbell');
  const prescription = { workingSets: 3, repMin: 8, repMax: 12, incrementKg: 2.5 };
  const routine = { id: randomUUID(), name: 'Live verification routine', version: 0, exercises: [{ id: randomUUID(), exerciseId: bench.id, prescription }] };
  const savedRoutine = await request(a, `/routines/${routine.id}`, 'PUT', { routine, expectedVersion: 0, mutationId: randomUUID() });
  assert.equal(savedRoutine.version, 1);
  const makeWorkout = () => ({ id: randomUUID(), name: 'Live verification session', version: 0, routineId: routine.id, status: 'in_progress', startedAt: new Date().toISOString(), completedAt: null,
    exercises: [{ id: randomUUID(), exerciseId: bench.id, snapshot: bench, prescription, sets: Array.from({ length: 3 }, () => ({ id: randomUUID(), weight: 50, reps: 12, rir: 2, completed: true, warmup: false })) }] });
  const original = makeWorkout();
  const save = { workout: original, expectedVersion: 0, mutationId: randomUUID() };
  let saved = await request(a, `/workouts/${original.id}`, 'PUT', save);
  assert.deepEqual(await request(a, `/workouts/${original.id}`, 'PUT', save), saved);
  await request(a, `/workouts/${original.id}`, 'PUT', { ...save, mutationId: randomUUID() }, 409);
  assert.equal((await request(a, '/workouts')).length, 1);
  assert.equal((await request(b, '/workouts')).length, 0);
  assert.equal((await request(b, '/routines')).length, 0);
  await request(b, `/workouts/${original.id}`, 'GET', undefined, 404);
  await request(b, `/workouts/${original.id}/exercises/${original.exercises[0].id}/recommendation`, 'GET', undefined, 404);
  const direct = await b.client.from('exercise_sets').select('*'); assert.ifError(direct.error); assert.equal(direct.data.length, 0);
  saved = await request(a, `/workouts/${saved.id}/complete`, 'POST', { workout: { ...saved, status: 'completed', completedAt: new Date().toISOString() }, expectedVersion: saved.version, mutationId: randomUUID() });
  assert.equal(saved.id, original.id); assert.equal(saved.status, 'completed');
  const second = makeWorkout(); second.status = 'completed'; second.completedAt = new Date().toISOString();
  await request(a, `/workouts/${second.id}`, 'PUT', { workout: second, expectedVersion: 0, mutationId: randomUUID() });
  const next = makeWorkout(); next.exercises[0].sets.forEach(s => { s.weight = 0; s.completed = false; });
  const pending = await request(a, `/workouts/${next.id}`, 'PUT', { workout: next, expectedVersion: 0, mutationId: randomUUID() });
  assert.equal(pending.exercises[0].sets[0].weight, 0);
  const decision = await request(a, `/workouts/${next.id}/exercises/${next.exercises[0].id}/recommendation`);
  assert.equal(decision.action, 'increase'); assert.equal(decision.proposedKg, 52.5);
  const explanation = await request(a, `/workouts/${next.id}/exercises/${next.exercises[0].id}/explanation`, 'POST'); assert.equal(typeof explanation.explanation, 'string');
  await request(a, '/profile', 'PUT', { timezone: 'Europe/Dublin' });
  const summary = await request(a, '/summary/weekly');
  const otherSummary = await request(b, '/summary/weekly');
  assert.equal(summary.counts.find(c => c.muscle === 'chest').primarySets, 6);
  assert.equal(summary.counts.find(c => c.muscle === 'triceps').secondarySets, 6);
  assert.ok(otherSummary.counts.every(c => c.primarySets === 0 && c.secondarySets === 0));
  await request(a, `/routines/${routine.id}`, 'DELETE', { expectedVersion: 1 }, 204);
  assert.equal((await request(a, `/workouts/${saved.id}`)).exercises[0].snapshot.primaryMuscle, 'chest');
  await stop(); await start();
  assert.equal((await request(a, '/workouts')).length, 3);
  assert.equal((await request(a, `/workouts/${saved.id}`)).status, 'completed');
  console.log('PASS live Supabase: auth, catalogue, atomic saves, retry/conflict, zero weights, completion, RLS isolation, routines, progression, explanation and summary.' + (remote ? ' Verified hosted API.' : ' Verified API restart persistence.'));
  if (process.env.KEEP_BROWSER_TEST_USER === '1') {
    await writeFile('.tmp/browser-test-user.json', JSON.stringify({ id: a.id, email: a.email, password: a.password }), { mode: 0o600 });
    a.keep = true;
    console.log('A temporary account is retained for browser verification; clean it up after that check.');
  }
} finally {
  await stop();
  for (const user of users) if (!user.keep) { const { error } = await admin.auth.admin.deleteUser(user.id); if (error) console.error('Test account cleanup failed for', user.id); }
}

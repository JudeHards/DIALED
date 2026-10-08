import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { auth } = vi.hoisted(() => ({ auth: { getSession: vi.fn(), refreshSession: vi.fn() } }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth } }));
import { apiFor, request } from '../src/lib/api';
import { database, cached } from '../src/lib/offline';

const session = (id = 'alice', token = 'original-token') => ({ data: { session: { user: { id }, access_token: token } }, error: null });
const response = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const routine = () => ({ id: crypto.randomUUID(), version: 0, name: 'Push day', exercises: [] });
beforeEach(async () => {
  const db = await database(); await db.clear('cache');
  auth.getSession.mockReset().mockResolvedValue(session());
  auth.refreshSession.mockReset().mockResolvedValue(session('alice', 'fresh-token'));
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('authenticated API requests', () => {
  it('rejects a queued request when a different account is signed in', async () => {
    auth.getSession.mockResolvedValue(session('bob'));
    await expect(request('alice', '/workouts')).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('refreshes an expired access token once and retries the identical payload', async () => {
    fetch.mockResolvedValueOnce(response({ error: 'Expired' }, 401)).mockResolvedValueOnce(response({ saved: true }));
    const body = JSON.stringify({ mutationId: 'stable-mutation' });
    expect(await request('alice', '/workouts/id', { method: 'PUT', body })).toEqual({ saved: true });
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer original-token');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
    expect(fetch.mock.calls[1][1].body).toBe(body);
  });
  it('does not retry an old account’s payload using a new account after refresh', async () => {
    fetch.mockResolvedValueOnce(response({ error: 'Expired' }, 401));
    auth.refreshSession.mockResolvedValue(session('bob'));
    await expect(request('alice', '/workouts', { method: 'PUT', body: '{}' })).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('returns readable errors for a failed auth refresh and preserves caller data', async () => {
    fetch.mockResolvedValueOnce(response({ error: 'Expired' }, 401));
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('Expired refresh token') });
    await expect(request('alice', '/workouts')).rejects.toThrow('drafts are saved');
  });
  it('surfaces a non-JSON server error and treats empty delete responses as success', async () => {
    fetch.mockResolvedValueOnce(new Response('Unavailable', { status: 503 })).mockResolvedValueOnce(response(null, 204));
    await expect(request('alice', '/workouts')).rejects.toMatchObject({ status: 503, message: 'Request failed (503)' });
    expect(await request('alice', '/routines/id', { method: 'DELETE' })).toBeNull();
  });
});

describe('routine mutation durability', () => {
  it('keeps the same request and mutation ID after a timeout, even through a new API instance', async () => {
    const value = routine();
    fetch.mockRejectedValueOnce(new TypeError('Network connection lost')).mockImplementationOnce(async (_url, options) => {
      const payload = JSON.parse(options.body); return response({ ...payload.routine, version: 1 });
    });
    await expect(apiFor('alice').saveRoutine(value)).rejects.toThrow('Network');
    const pending = await cached('alice', `routineMutation:${value.id}`);
    expect(pending.pending.routine).toEqual(value);
    const saved = await apiFor('alice').saveRoutine(value);
    expect(saved.version).toBe(1);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect((await cached('alice', `routineMutation:${value.id}`)).pending).toBeUndefined();
  });
  it('replays an uncertain request before sending subsequent edits at the confirmed version', async () => {
    const value = routine();
    fetch.mockRejectedValueOnce(new TypeError('Lost response')).mockImplementation(async (_url, options) => {
      const payload = JSON.parse(options.body); return response({ ...payload.routine, version: payload.expectedVersion + 1 });
    });
    await expect(apiFor('alice').saveRoutine(value)).rejects.toThrow('Lost');
    const edited = { ...value, name: 'Edited while retrying' };
    const saved = await apiFor('alice').saveRoutine(edited);
    expect(saved.name).toBe(edited.name); expect(saved.version).toBe(2);
    const payloads = fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(payloads[0]).toEqual(payloads[1]);
    expect(payloads[2].expectedVersion).toBe(1); expect(payloads[2].routine.version).toBe(1);
    expect(payloads[2].mutationId).not.toBe(payloads[1].mutationId);
    expect(edited.version).toBe(0);
  });
  it('serializes duplicate saves without producing duplicate routine updates', async () => {
    const value = routine();
    fetch.mockImplementation(async (_url, options) => response({ ...JSON.parse(options.body).routine, version: 1 }));
    const api = apiFor('alice');
    const [first, second] = await Promise.all([api.saveRoutine(value), api.saveRoutine(value)]);
    expect(first).toEqual(second); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not reuse another account’s pending mutation', async () => {
    const value = routine(); fetch.mockRejectedValueOnce(new Error('Offline'));
    await expect(apiFor('alice').saveRoutine(value)).rejects.toThrow('Offline');
    const alice = await cached('alice', `routineMutation:${value.id}`);
    auth.getSession.mockResolvedValue(session('bob'));
    fetch.mockImplementation(async (_url, options) => response({ ...JSON.parse(options.body).routine, version: 1 }));
    await apiFor('bob').saveRoutine(value);
    const bobPayload = JSON.parse(fetch.mock.calls[1][1].body);
    expect(bobPayload.mutationId).not.toBe(alice.pending.mutationId);
    expect((await cached('alice', `routineMutation:${value.id}`)).pending).toEqual(alice.pending);
  });
  it('clears a definitively rejected mutation so corrected input can be submitted', async () => {
    const value = routine(); fetch.mockResolvedValueOnce(response({ error: 'Invalid name' }, 400));
    await expect(apiFor('alice').saveRoutine(value)).rejects.toMatchObject({ status: 400 });
    expect(await cached('alice', `routineMutation:${value.id}`)).toBeNull();
    fetch.mockImplementation(async (_url, options) => response({ ...JSON.parse(options.body).routine, version: 1 }));
    await apiFor('alice').saveRoutine({ ...value, name: 'Fixed' });
    const payloads = fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(payloads[0].mutationId).not.toBe(payloads[1].mutationId);
  });
});

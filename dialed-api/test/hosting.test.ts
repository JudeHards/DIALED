import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createApp } from '../src/app';

describe('same-origin production hosting', () => {
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dialed-hosting-'));
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>Dialed</title>');
    await writeFile(join(directory, 'sw.js'), '// service worker');
    await writeFile(join(directory, 'assets/app-123.js'), '// application');
  });
  afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
  it('serves the app for direct navigation and authentication callback paths', async () => {
    const app = createApp({ frontendDirectory: directory });
    for (const path of ['/', '/routines', '/workout/example', '/reset-password']) {
      const response = await request(app).get(path).set('Accept', 'text/html');
      expect(response.status).toBe(200);
      expect(response.text).toContain('<title>Dialed</title>');
      expect(response.headers['cache-control']).toBe('no-cache');
    }
  });
  it('keeps auth and missing assets out of the HTML fallback', async () => {
    const app = createApp({ frontendDirectory: directory });
    expect((await request(app).get('/api/workouts')).status).toBe(401);
    expect((await request(app).get('/missing.js')).status).toBe(404);
    expect((await request(app).post('/routines')).status).toBe(404);
    expect((await request(app).get('/health')).body.status).toBe('ok');
  });
  it('revalidates the service worker but allows immutable hashed assets', async () => {
    const app = createApp({ frontendDirectory: directory });
    expect((await request(app).get('/sw.js')).headers['cache-control']).toBe('no-cache');
    expect((await request(app).get('/assets/app-123.js')).headers['cache-control']).toContain('immutable');
  });
  it('fails clearly if production assets have not been built', () => {
    expect(() => createApp({ frontendDirectory: join(directory, 'missing') })).toThrow('Build the frontend');
  });
});

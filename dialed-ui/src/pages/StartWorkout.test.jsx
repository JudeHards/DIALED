// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { exercises } from '@dialed/shared';

const mocks = vi.hoisted(() => ({ params: {}, navigate: vi.fn(), training: {}, draft: vi.fn(), saveDraft: vi.fn(), syncDrafts: vi.fn(), adoptCloudVersion: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => mocks.params, useNavigate: () => mocks.navigate, Link: ({ children, to }) => <a href={to}>{children}</a> }));
vi.mock('../lib/Training', () => ({ useTraining: () => mocks.training }));
vi.mock('../lib/offline', () => ({ draft: mocks.draft, saveDraft: mocks.saveDraft, syncDrafts: mocks.syncDrafts, adoptCloudVersion: mocks.adoptCloudVersion, separateCopy: value => value }));
vi.mock('../components/Recommendation', () => ({ default: ({ onApply }) => <button onClick={() => onApply(45)}>Apply test load</button> }));
import StartWorkout from './StartWorkout';

const id = '11111111-1111-4111-8111-111111111111';
function fixture() {
  return { id, name: 'Upper A', routineId: null, version: 1, status: 'in_progress', startedAt: '2026-10-07T10:00:00.000Z', completedAt: null,
    exercises: [{ id: '22222222-2222-4222-8222-222222222222', exerciseId: exercises[0].id, snapshot: exercises[0], prescription: { workingSets: 1, repMin: 8, repMax: 12, incrementKg: 2.5 }, sets: [{ id: '33333333-3333-4333-8333-333333333333', weight: 40, reps: 10, rir: null, warmup: false, completed: true }] }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { id };
  mocks.training = { userId: 'user-1', rows: [], catalog: exercises, api: {}, ready: true };
  mocks.draft.mockResolvedValue({ workout: fixture() });
  mocks.saveDraft.mockResolvedValue({});
  mocks.syncDrafts.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('workout editor persistence', () => {
  it('creates one session under React StrictMode', async () => {
    mocks.params = {};
    render(<StrictMode><StartWorkout/></StrictMode>);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1);
    expect(mocks.navigate.mock.calls[0][0]).toMatch(/^\/start-workout\/[a-f0-9-]+$/);
  });

  it('continues saving after an earlier device write fails', async () => {
    mocks.saveDraft.mockRejectedValueOnce(new Error('quota exceeded'));
    render(<StartWorkout/>);
    const name = await screen.findByLabelText('Session name');
    fireEvent.change(name, { target: { value: 'First edit' } });
    await screen.findByText(/Device storage failed/);
    fireEvent.change(name, { target: { value: 'Second edit' } });
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(2));
    expect(mocks.saveDraft.mock.calls[1][1].name).toBe('Second edit');
    await waitFor(() => expect(screen.queryByText(/Device storage failed/)).toBeNull());
  });

  it('does not overwrite a pending local edit with a synced older snapshot', async () => {
    let finishWrite;
    mocks.saveDraft.mockImplementationOnce(() => new Promise(resolve => { finishWrite = resolve; }));
    const view = render(<StartWorkout/>);
    const name = await screen.findByLabelText('Session name');
    fireEvent.change(name, { target: { value: 'My latest edit' } });
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(1));
    mocks.training = { ...mocks.training, rows: [{ id, state: 'synced', serverVersion: 2, workout: { ...fixture(), version: 2, name: 'Older server snapshot' } }] };
    view.rerender(<StartWorkout/>);
    expect(screen.getByLabelText('Session name').value).toBe('My latest edit');
    await act(async () => { finishWrite({}); });
    expect(screen.getByLabelText('Session name').value).toBe('My latest edit');
  });

  it('writes the complete latest session before navigating, even after a failed draft save', async () => {
    mocks.saveDraft.mockRejectedValueOnce(new Error('temporary storage failure'));
    render(<StartWorkout/>);
    fireEvent.change(await screen.findByLabelText('Session name'), { target: { value: 'Recovered latest name' } });
    await screen.findByText(/Device storage failed/);
    fireEvent.click(screen.getByRole('button', { name: /Complete workout/ }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(`/workout/${id}`));
    const saved = mocks.saveDraft.mock.calls.at(-1)[1];
    expect(saved).toMatchObject({ id, name: 'Recovered latest name', status: 'completed' });
    expect(saved.completedAt).toBeTruthy();
  });

  it('applies suggestions only to empty, unfinished working sets', async () => {
    const workout = fixture();
    const template = workout.exercises[0].sets[0];
    workout.exercises[0].sets = [
      { ...template, id: crypto.randomUUID(), weight: null, completed: false },
      { ...template, id: crypto.randomUUID(), weight: 32, completed: false },
      { ...template, id: crypto.randomUUID(), weight: null, completed: false, warmup: true },
      template,
    ];
    mocks.draft.mockResolvedValue({ workout });
    render(<StartWorkout/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply test load' }));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(1));
    expect(mocks.saveDraft.mock.calls[0][1].exercises[0].sets.map(set => set.weight)).toEqual([45, 32, null, 40]);
  });
});

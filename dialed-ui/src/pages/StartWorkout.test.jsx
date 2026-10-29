// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { exercises } from '@dialed/shared';

const mocks = vi.hoisted(() => ({ params: {}, navigate: vi.fn(), training: {}, draft: vi.fn(), drafts: vi.fn(), discardDraft: vi.fn(), saveDraft: vi.fn(), syncDrafts: vi.fn(), adoptCloudVersion: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => mocks.params, useNavigate: () => mocks.navigate, Link: ({ children, to }) => <a href={to}>{children}</a> }));
vi.mock('../lib/Training', () => ({ useTraining: () => mocks.training }));
vi.mock('../lib/offline', () => ({ draft: mocks.draft, drafts: mocks.drafts, discardDraft: mocks.discardDraft, saveDraft: mocks.saveDraft, syncDrafts: mocks.syncDrafts, adoptCloudVersion: mocks.adoptCloudVersion, separateCopy: value => value }));
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
  mocks.drafts.mockResolvedValue([]);
  mocks.discardDraft.mockResolvedValue(undefined);
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

  it('resumes the session in progress instead of starting another', async () => {
    mocks.params = {};
    mocks.drafts.mockResolvedValue([{ id, state: 'synced', workout: fixture() }]);
    render(<StrictMode><StartWorkout/></StrictMode>);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(`/start-workout/${id}`, { replace: true }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it('discards the session only after confirmation, then returns to the overview', async () => {
    render(<StartWorkout/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Discard workout' }));
    expect(screen.getByText(/The sets you’ve entered will be deleted/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep workout' }));
    expect(mocks.discardDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard workout' }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(mocks.discardDraft).toHaveBeenCalledWith('user-1', id);
    expect(mocks.syncDrafts).toHaveBeenCalled();
  });

  it('continues saving after an earlier device write fails', async () => {
    mocks.saveDraft.mockRejectedValueOnce(new Error('quota exceeded'));
    render(<StartWorkout/>);
    const name = await screen.findByLabelText('Workout name');
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
    const name = await screen.findByLabelText('Workout name');
    fireEvent.change(name, { target: { value: 'My latest edit' } });
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(1));
    mocks.training = { ...mocks.training, rows: [{ id, state: 'synced', serverVersion: 2, workout: { ...fixture(), version: 2, name: 'Older server snapshot' } }] };
    view.rerender(<StartWorkout/>);
    expect(screen.getByLabelText('Workout name').value).toBe('My latest edit');
    await act(async () => { finishWrite({}); });
    expect(screen.getByLabelText('Workout name').value).toBe('My latest edit');
  });

  it('writes the complete latest session before navigating, even after a failed draft save', async () => {
    mocks.saveDraft.mockRejectedValueOnce(new Error('temporary storage failure'));
    render(<StartWorkout/>);
    fireEvent.change(await screen.findByLabelText('Workout name'), { target: { value: 'Recovered latest name' } });
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


describe('repeating previous working sets', () => {
  it('saves only the set confirmed by reps focus and blur, retaining that status when reopened', async () => {
    const workout = fixture();
    const template = workout.exercises[0].sets[0];
    workout.exercises[0].sets = [
      { ...template, weight: null, reps: null, completed: false },
      { ...template, id: crypto.randomUUID(), weight: null, reps: null, completed: false },
      { ...template, id: crypto.randomUUID(), weight: 35, reps: 9, completed: false },
    ];
    const previous = { ...fixture(), id: crypto.randomUUID(), status: 'completed', completedAt: '2026-10-06T10:00:00.000Z' };
    previous.exercises[0].sets = workout.exercises[0].sets.map((set, index) => ({ ...set, weight: 40 + index, reps: 10, completed: true }));
    mocks.training.rows = [{ state: 'synced', workout: previous }];
    mocks.draft.mockResolvedValue({ workout });
    const view = render(<StartWorkout/>);
    const reps = await screen.findByLabelText('Set 1 reps');
    expect(reps.value).toBe('');
    expect(reps.placeholder).toBe('10');
    expect(screen.getByLabelText('Set 2 weight in kg').value).toBe('');
    expect(screen.getByLabelText('Set 2 weight in kg').placeholder).toBe('41');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByRole('button', { name: /Complete workout/ }).disabled).toBe(true);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
    fireEvent.focus(reps);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    fireEvent.blur(reps);
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    const savedDraft = structuredClone(mocks.saveDraft.mock.calls[0][1]);
    view.unmount();
    mocks.draft.mockResolvedValue({ workout: savedDraft });
    render(<StartWorkout/>);
    await screen.findByLabelText('Set 1 reps');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    expect(screen.getByLabelText('Set 1 reps').className).not.toContain('previous-value');
    expect(screen.getByLabelText('Set 2 reps').className).toContain('previous-value');
    fireEvent.click(screen.getByRole('button', { name: /Complete workout/ }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(`/workout/${id}`));
    const completed = mocks.saveDraft.mock.calls.at(-1)[1];
    expect(completed.status).toBe('completed');
    expect(completed.exercises[0].sets.map(set => set.completed)).toEqual([true, false, false]);
    expect(completed.exercises[0].sets[1]).toMatchObject({ weight: null, reps: null });
    expect(completed.exercises[0].sets[2]).toMatchObject({ weight: 35, reps: 9, completed: false });
  });
});

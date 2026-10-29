// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { exercises } from '@dialed/shared';
import { routineExercise, sessionExercise } from '../lib/models';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), training: {}, discardDraft: vi.fn(), saveDraft: vi.fn(), syncDrafts: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate, Link: ({ children, to, className }) => <a className={className} href={to}>{children}</a> }));
vi.mock('../lib/Training', () => ({ useTraining: () => mocks.training }));
vi.mock('../lib/offline', () => ({ cached: vi.fn(), discardDraft: mocks.discardDraft, saveDraft: mocks.saveDraft, syncDrafts: mocks.syncDrafts }));
import Routines from './Routines';

const routine = { id: crypto.randomUUID(), name: 'Push', version: 1, exercises: [routineExercise(exercises[0])] };
function session(weight = null) {
  const exercise = sessionExercise(exercises[0]); exercise.sets[0].weight = weight;
  return { id: 'current', state: 'synced', workout: { id: 'current', name: 'Pull', status: 'in_progress', startedAt: new Date().toISOString(), completedAt: null, exercises: [exercise] } };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveDraft.mockResolvedValue({}); mocks.discardDraft.mockResolvedValue(undefined); mocks.syncDrafts.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('starting a routine with one session in progress', () => {
  it('replaces an untouched session', async () => {
    mocks.training = { catalog: exercises, routines: [routine], rows: [session()], userId: 'user-1', api: {}, online: true, ready: true };
    render(<Routines/>);
    fireEvent.click(screen.getByRole('button', { name: 'Start workout: Push' }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
    expect(mocks.discardDraft).toHaveBeenCalledWith('user-1', 'current');
    const started = mocks.saveDraft.mock.calls[0][1];
    expect(started).toMatchObject({ name: 'Push', routineId: routine.id, status: 'in_progress' });
    expect(mocks.navigate).toHaveBeenCalledWith(`/start-workout/${started.id}`);
  });
  it('asks to finish or discard a session with entered sets first', () => {
    mocks.training = { catalog: exercises, routines: [routine], rows: [session(60)], userId: 'user-1', api: {}, online: true, ready: true };
    render(<Routines/>);
    fireEvent.click(screen.getByRole('button', { name: 'Start workout: Push' }));
    expect(screen.getByText(/Finish or discard “Pull”/)).toBeTruthy();
    expect(screen.getByText('Continue workout').getAttribute('href')).toBe('/start-workout/current');
    expect(mocks.saveDraft).not.toHaveBeenCalled(); expect(mocks.discardDraft).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { exercises } from '@dialed/shared';

const mocks = vi.hoisted(() => ({ training: {} }));
vi.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a> }));
vi.mock('../lib/Training', () => ({ useTraining: () => mocks.training }));
import Welcome from './Welcome';

afterEach(cleanup);

describe('overview working set totals', () => {
  it('counts each set once when saved delt parts split into groups and retains unspecified legacy sets', () => {
    const set = { completed: true, weight: 15, reps: 10, warmup: false };
    mocks.training = { timezone: 'Europe/Dublin', routines: [], rows: [{ id: 'history', workout: {
      status: 'completed', completedAt: new Date().toISOString(), exercises: [
        { snapshot: { primaryMuscle: 'shoulders', secondaryMuscles: [], muscleTargets: [
          { part: 'deltoid_anterior', role: 'primary', emphasis: 'biased' },
          { part: 'deltoid_lateral', role: 'primary', emphasis: 'shared' },
        ] }, sets: [set, set] },
        { snapshot: { primaryMuscle: 'shoulders', secondaryMuscles: [] }, sets: [set] },
      ],
    } }] };
    render(<Welcome/>);
    expect(screen.getByText('working sets this week').parentElement.querySelector('strong').textContent).toBe('3');
    expect(screen.getByLabelText('anterior delt: 2 primary sets, 0 secondary sets; show muscle parts')).toBeTruthy();
    expect(screen.getByLabelText('lateral delt: 2 primary sets, 0 secondary sets; show muscle parts')).toBeTruthy();
    expect(screen.getByText(/Delt head unspecified: 1 primary set and 0 secondary sets/)).toBeTruthy();
    expect(screen.queryByText('shoulders')).toBeNull();
  });
});

describe('continuing a workout', () => {
  const session = (name, hoursAgo, weight) => ({ id: name, state: 'synced', workout: { id: name, name, status: 'in_progress', startedAt: new Date(Date.now() - hoursAgo * 3600000).toISOString(), completedAt: null,
    exercises: [{ snapshot: exercises[0], sets: [{ weight, reps: null, rir: null, completed: false, warmup: false }] }] } });
  it('offers only the current session and hides abandoned empty ones', () => {
    mocks.training = { timezone: 'Europe/Dublin', routines: [], rows: [session('Empty start', 1, null), session('Leg day', 20, 60), session('Old junk', 30, null)] };
    render(<Welcome/>);
    expect(screen.getByText(/Continue workout/).closest('a').getAttribute('href')).toBe('/start-workout/Leg day');
    expect(screen.getByText('Leg day')).toBeTruthy();
    expect(screen.queryByText('Empty start')).toBeNull();
    expect(screen.queryByText('Old junk')).toBeNull();
  });
  it('starts a new workout when nothing is in progress', () => {
    mocks.training = { timezone: 'Europe/Dublin', routines: [], rows: [session('Old junk', 30, null)] };
    render(<Welcome/>);
    expect(screen.getByText(/Start a workout/).closest('a').getAttribute('href')).toBe('/start-workout');
    expect(screen.queryByText('Continue your workout')).toBeNull();
  });
});

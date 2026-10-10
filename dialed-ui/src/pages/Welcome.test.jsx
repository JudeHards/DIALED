// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { weeklySummary } from '@dialed/shared';
import WeeklyMuscles from './WeeklyMuscles';

afterEach(cleanup);
const set = { completed: true, weight: 15, reps: 10, warmup: false };
function fixture() {
  return weeklySummary([{ status: 'completed', completedAt: '2026-10-07T12:00:00Z', exercises: [
    { snapshot: { primaryMuscle: 'chest', secondaryMuscles: ['shoulders'], muscleTargets: [
      { part: 'pectoralis_clavicular', role: 'primary', emphasis: 'biased' },
      { part: 'pectoralis_sternocostal', role: 'primary', emphasis: 'shared' },
      { part: 'deltoid_anterior', role: 'secondary', emphasis: 'shared' },
    ] }, sets: [set, set, { ...set, warmup: true }, { ...set, completed: false }] },
    { snapshot: { primaryMuscle: 'anterior delt', secondaryMuscles: [] }, sets: [set] },
  ] }], 'Europe/Dublin', new Date('2026-10-09T12:00:00Z'));
}

describe('weekly muscle detail', () => {
  it('shows primary, secondary and biased counts without multiplying group totals', () => {
    render(<WeeklyMuscles summary={fixture()} timezone="Europe/Dublin"/>);
    fireEvent.click(screen.getByLabelText('chest: 2 primary sets, 0 secondary sets; show muscle parts'));
    const chestTable = screen.getByRole('table', { name: 'chest muscle parts this week' });
    const upper = within(chestTable).getByRole('row', { name: 'Pectoralis major · clavicular (upper) 2 0 2' });
    expect(within(upper).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['2', '0', '2']);
    expect(within(chestTable).getByRole('row', { name: 'Pectoralis major · sternocostal (mid/lower) 2 0 0' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('anterior delt: 1 primary sets, 2 secondary sets; show muscle parts'));
    expect(screen.getByRole('row', { name: 'Deltoid · anterior (front) 0 2 0' })).toBeTruthy();
    expect(screen.getByText(/part counts overlap/)).toBeTruthy();
  });

  it('shows historical gaps and zero-count parts instead of assuming complete coverage', () => {
    render(<WeeklyMuscles summary={fixture()} timezone="Europe/Dublin"/>);
    expect(screen.getByText(/Part detail unavailable for 1 working set saved without muscle parts/)).toBeTruthy();
    const biceps = screen.getByLabelText('biceps: 0 primary sets, 0 secondary sets; show muscle parts');
    fireEvent.click(biceps);
    expect(screen.getByRole('row', { name: 'Biceps · long head 0 0 0' })).toBeTruthy();
    expect(within(biceps.parentElement).getByText('No completed working sets for this group this week.')).toBeTruthy();
  });

  it('keeps the empty week useful and omits a false legacy warning', () => {
    render(<WeeklyMuscles summary={weeklySummary([], 'Europe/Dublin', new Date('2026-10-09T12:00:00Z'))} timezone="Europe/Dublin"/>);
    expect(screen.getByLabelText('chest: 0 primary sets, 0 secondary sets; show muscle parts')).toBeTruthy();
    expect(screen.queryByText(/Part detail unavailable/)).toBeNull();
    expect(screen.getByText(/Completed working sets only/)).toBeTruthy();
  });

  it('shows all three delt groups and identifies old sets with an unspecified head', () => {
    const summary = weeklySummary([{ status: 'completed', completedAt: '2026-10-07T12:00:00Z', exercises: [
      { snapshot: { primaryMuscle: 'shoulders', secondaryMuscles: [] }, sets: [set, set] },
      { snapshot: { primaryMuscle: 'chest', secondaryMuscles: ['shoulders'] }, sets: [set] },
    ] }], 'Europe/Dublin', new Date('2026-10-09T12:00:00Z'));
    render(<WeeklyMuscles summary={summary} timezone="Europe/Dublin"/>);
    for (const head of ['anterior delt', 'lateral delt', 'posterior delt']) {
      expect(screen.getByLabelText(`${head}: 0 primary sets, 0 secondary sets; show muscle parts`)).toBeTruthy();
    }
    expect(screen.queryByText('shoulders')).toBeNull();
    expect(screen.getByText(/Delt head unspecified: 2 primary sets and 1 secondary set/)).toBeTruthy();
    expect(screen.getByText(/These sets remain in your weekly working set total\.$/)).toBeTruthy();
  });
});

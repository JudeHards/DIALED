// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { exercises } from '@dialed/shared';
import { newWorkout, sessionExercise } from '../lib/models';

const mocks = vi.hoisted(() => ({ training: {} }));
vi.mock('../lib/Training', () => ({ useTraining: () => mocks.training }));
import Recommendation from './Recommendation';

afterEach(cleanup);

describe('collapsible recommendations', () => {
  it('starts collapsed and keeps its suggestion and apply action available when expanded', () => {
    const exercise = sessionExercise(exercises[0]);
    const workout = { ...newWorkout(null, []), exercises: [exercise] };
    const previous = { ...workout, id: crypto.randomUUID(), status: 'completed', completedAt: '2026-10-12T10:00:00.000Z', exercises: [{ ...exercise, sets: exercise.sets.map(set => ({ ...set, weight: 40, reps: 10, completed: true })) }] };
    mocks.training = { rows: [{ state: 'synced', workout: previous }], online: false, api: {} };
    const onApply = vi.fn();
    render(<Recommendation workout={workout} exercise={exercise} onApply={onApply}/>);
    const summary = screen.getByText(/Weight suggestion/, { selector: 'summary' });
    const disclosure = summary.closest('details');
    expect(disclosure.open).toBe(false);
    expect(summary.textContent).toContain('40 kg');
    fireEvent.click(summary);
    expect(disclosure.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Fill empty weights' }));
    expect(onApply).toHaveBeenCalledWith(40);
    fireEvent.click(summary);
    expect(disclosure.open).toBe(false);
  });
});

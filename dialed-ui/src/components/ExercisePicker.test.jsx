// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ExercisePicker, { MuscleLabels } from './ExercisePicker';

const catalog = [
  { id: 'incline', name: 'Incline Press', primaryMuscle: 'chest', secondaryMuscles: ['anterior delt'], equipment: 'dumbbell',
    muscleTargets: [{ part: 'pectoralis_clavicular', role: 'primary', emphasis: 'biased' }, { part: 'pectoralis_sternocostal', role: 'primary', emphasis: 'shared' }, { part: 'deltoid_anterior', role: 'secondary', emphasis: 'shared' }], biasNotes: 'Incline angle changes expected emphasis.' },
  { id: 'front', name: 'Front Raise', primaryMuscle: 'anterior delt', secondaryMuscles: [], equipment: 'cable',
    muscleTargets: [{ part: 'deltoid_anterior', role: 'primary', emphasis: 'biased' }] },
  { id: 'side', name: 'Lateral Raise', primaryMuscle: 'lateral delt', secondaryMuscles: [], equipment: 'dumbbell',
    muscleTargets: [{ part: 'deltoid_lateral', role: 'primary', emphasis: 'biased' }] },
  { id: 'legacy', name: 'Saved Front Raise', primaryMuscle: 'anterior delt', secondaryMuscles: [], equipment: 'cable' },
  { id: 'unknown', name: 'Saved Press', primaryMuscle: 'shoulders', secondaryMuscles: [], equipment: 'dumbbell' },
];

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute('open'); });
});
afterEach(cleanup);

function picker(props = {}) { return render(<ExercisePicker catalog={catalog} onAdd={() => {}} onClose={() => {}} {...props}/>); }

describe('exercise muscle filtering', () => {
  it('filters specific parts in both primary and secondary roles and resets the part when changing group', () => {
    picker();
    fireEvent.change(screen.getByLabelText('Muscle group'), { target: { value: 'anterior delt' } });
    expect(screen.getByRole('checkbox', { name: 'Saved Front Raise' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Muscle part'), { target: { value: 'deltoid_anterior' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Incline Press' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Front Raise' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Saved Front Raise' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Muscle group'), { target: { value: 'chest' } });
    expect(screen.getByLabelText('Muscle part').value).toBe('all');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(within(screen.getByLabelText('Muscle part')).queryByRole('option', { name: /Deltoid/ })).toBeNull();
  });

  it('searches anatomy and group words together even when absent from the exercise name', () => {
    picker();
    fireEvent.change(screen.getByLabelText('Search exercises'), { target: { value: 'upper chest' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Incline Press' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search exercises'), { target: { value: 'clavicular' } });
    expect(screen.getByRole('checkbox', { name: 'Incline Press' })).toBeTruthy();
  });

  it('retains selected exercises across filters and returns their full part data', () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    picker({ onAdd, onClose });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Incline Press' }));
    fireEvent.change(screen.getByLabelText('Muscle part'), { target: { value: 'deltoid_lateral' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lateral Raise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 exercises' }));
    expect(onAdd).toHaveBeenCalledWith([catalog[0], catalog[2]]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clears part filters along with text and group filters', () => {
    picker();
    fireEvent.change(screen.getByLabelText('Muscle group'), { target: { value: 'posterior delt' } });
    fireEvent.change(screen.getByLabelText('Muscle part'), { target: { value: 'deltoid_posterior' } });
    fireEvent.change(screen.getByLabelText('Search exercises'), { target: { value: 'missing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(catalog.length);
    expect(screen.getByLabelText('Muscle group').value).toBe('all');
    expect(screen.getByLabelText('Muscle part').value).toBe('all');
    expect(screen.getByLabelText('Search exercises').value).toBe('');
  });

  it('lets people inspect parts without selecting the exercise', () => {
    picker({ catalog: [catalog[0]] });
    fireEvent.click(screen.getByText('Muscle parts & emphasis'));
    expect(screen.getByRole('checkbox', { name: 'Incline Press' }).checked).toBe(false);
    expect(screen.getByText('Primary parts')).toBeTruthy();
    expect(screen.getByText('Secondary parts')).toBeTruthy();
  });

  it('offers three delt groups and keeps unspecified legacy sets out of each head filter', () => {
    picker();
    const options = within(screen.getByLabelText('Muscle group'));
    expect(options.queryByRole('option', { name: 'shoulders' })).toBeNull();
    for (const head of ['anterior delt', 'lateral delt', 'posterior delt']) {
      expect(options.getByRole('option', { name: head })).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Muscle group'), { target: { value: head } });
      expect(screen.queryByRole('checkbox', { name: 'Saved Press' })).toBeNull();
    }
    fireEvent.change(screen.getByLabelText('Muscle group'), { target: { value: 'lateral delt' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Lateral Raise' })).toBeTruthy();
  });
});

describe('saved exercise muscle labels', () => {
  it('distinguishes biased parts from shared involvement and explains the bias', () => {
    const { container } = render(<MuscleLabels exercise={catalog[0]}/>);
    expect(container.querySelector('.muscle-emphasis').textContent).toBe('Expected bias: Pectoralis major · clavicular (upper)');
    fireEvent.click(screen.getByText('Muscle parts & emphasis'));
    expect(screen.getAllByText('Biased')).toHaveLength(1);
    expect(screen.getByText('Pectoralis major · sternocostal (mid/lower)')).toBeTruthy();
    expect(screen.getByText('Incline angle changes expected emphasis.')).toBeTruthy();
    expect(screen.getByText(/not isolation or measured activation/)).toBeTruthy();
  });

  it('retains an explicitly named legacy delt head without inventing part detail', () => {
    render(<MuscleLabels exercise={catalog[3]}/>);
    expect(screen.getByLabelText('Primary muscle: anterior delt')).toBeTruthy();
    expect(screen.getByText(/Part detail unavailable/)).toBeTruthy();
    expect(screen.queryByText(/Deltoid/)).toBeNull();
    expect(screen.queryByText('Muscle parts & emphasis')).toBeNull();
  });

  it('identifies a missing historical delt head without showing a generic group', () => {
    render(<MuscleLabels exercise={catalog[4]}/>);
    expect(screen.getByLabelText('Primary muscle: Delt head unspecified')).toBeTruthy();
    expect(screen.queryByText('shoulders')).toBeNull();
    expect(screen.queryByLabelText('Primary muscle: anterior delt')).toBeNull();
  });

  it('uses explicit saved parts to split a former generic group into multiple delt chips', () => {
    render(<MuscleLabels exercise={{ ...catalog[4], muscleTargets: [
      { part: 'deltoid_anterior', role: 'primary', emphasis: 'biased' },
      { part: 'deltoid_lateral', role: 'primary', emphasis: 'shared' },
    ] }}/>);
    expect(screen.getByLabelText('Primary muscle: anterior delt')).toBeTruthy();
    expect(screen.getByLabelText('Primary muscle: lateral delt')).toBeTruthy();
    expect(screen.queryByText('Delt head unspecified')).toBeNull();
    expect(screen.queryByText('shoulders')).toBeNull();
  });
});

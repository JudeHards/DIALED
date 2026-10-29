// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SetEditor, { PrescriptionEditor } from './SetEditor';

afterEach(cleanup);
const base = { id: 'set', weight: 0, reps: 12, rir: null, warmup: false, completed: false };

describe('set entry', () => {
  it('considers a set complete when weight and reps are entered', () => {
    const onChange = vi.fn();
    render(<SetEditor set={base} index={0} onChange={onChange} onRemove={() => {}}/>);
    expect(screen.queryByRole('checkbox')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Set 1 reps'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ ...base, reps: null, completed: false });
  });

  it.each([{ weight: -1 }, { weight: 2001 }, { reps: 0 }, { reps: 2.5 }, { reps: 1001 }, { rir: -1 }, { rir: 11 }, { rir: 1.5 }])('blocks invalid numeric values %o', override => {
    render(<SetEditor set={{ ...base, ...override }} index={0} onChange={() => {}} onRemove={() => {}}/>);
    expect(screen.getByRole('status').textContent).toContain('whole reps');
  });

  it('unmarks completion after a logged value changes', () => {
    const onChange = vi.fn();
    render(<SetEditor set={{ ...base, completed: true }} index={0} onChange={onChange} onRemove={() => {}}/>);
    fireEvent.change(screen.getByLabelText('Set 1 reps'), { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith({ ...base, reps: 10, completed: false });
  });

  it('identifies invalid prescription bounds before save', () => {
    render(<PrescriptionEditor value={{ workingSets: 3, repMin: 12, repMax: 8, incrementKg: 2.5 }} onChange={() => {}}/>);
    expect(screen.getByLabelText('Max reps').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('Minimum reps');
  });
});


function EditableSet({ initial, previous, save }) {
  const [set, setValue] = useState(initial);
  return <SetEditor set={set} previous={previous} index={0} onRemove={() => {}} onChange={value => { setValue(value); save(value); }}/>;
}
const empty = { ...base, weight: null, reps: null };
const lastSet = { ...base, weight: 42.5, reps: 8, completed: true };

describe('previous performance and reps confirmation', () => {
  it('shows faint previous values without saving or counting them until reps focus and blur', () => {
    const save = vi.fn();
    render(<EditableSet initial={empty} previous={lastSet} save={save}/>);
    const reps = screen.getByLabelText('Set 1 reps');
    const weight = screen.getByLabelText('Set 1 weight in kg');
    expect(reps.value).toBe('');
    expect(reps.placeholder).toBe('8');
    expect(weight.value).toBe('');
    expect(weight.placeholder).toBe('42.5');
    expect(reps.className).toBe('previous-value');
    expect(weight.className).toBe('previous-value');
    fireEvent.focus(weight); fireEvent.blur(weight);
    fireEvent.blur(reps);
    expect(save).not.toHaveBeenCalled();
    fireEvent.focus(reps);
    expect(save).not.toHaveBeenCalled();
    fireEvent.blur(reps);
    expect(save).toHaveBeenLastCalledWith({ ...empty, weight: 42.5, reps: 8, completed: true });
    expect(reps.className).not.toContain('previous-value');
    expect(weight.className).not.toContain('previous-value');
    expect(screen.getByText('Logged ✓')).toBeTruthy();
  });

  it('uses edited reps and weight, and waits for reps blur before counting', () => {
    const save = vi.fn();
    render(<EditableSet initial={empty} previous={lastSet} save={save}/>);
    fireEvent.change(screen.getByLabelText('Set 1 weight in kg'), { target: { value: '45' } });
    const reps = screen.getByLabelText('Set 1 reps');
    fireEvent.focus(reps);
    fireEvent.change(reps, { target: { value: '10' } });
    expect(save.mock.calls.at(-1)[0]).toMatchObject({ weight: 45, reps: 10, completed: false });
    fireEvent.blur(reps);
    expect(save.mock.calls.at(-1)[0]).toMatchObject({ weight: 45, reps: 10, completed: true });
  });

  it.each(['reps', 'weight in kg'])('replaces only the %s hint when typing and restores it when cleared', label => {
    const save = vi.fn();
    render(<EditableSet initial={empty} previous={lastSet} save={save}/>);
    const input = screen.getByLabelText(`Set 1 ${label}`);
    const other = screen.getByLabelText(label === 'reps' ? 'Set 1 weight in kg' : 'Set 1 reps');
    const hint = input.placeholder;
    fireEvent.change(input, { target: { value: '5' } });
    expect(input.value).toBe('5');
    expect(input.className).not.toContain('previous-value');
    expect(other.value).toBe('');
    expect(other.className).toContain('previous-value');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(input.placeholder).toBe(hint);
    expect(input.className).toBe('previous-value');
    expect(save.mock.calls.at(-1)[0].completed).toBe(false);
    const reps = screen.getByLabelText('Set 1 reps');
    fireEvent.focus(reps); fireEvent.blur(reps);
    expect(save.mock.calls.at(-1)[0]).toMatchObject({ weight: 42.5, reps: 8, completed: true });
  });

  it('requires reps blur for fresh sets too and keeps zero-weight bodyweight sets valid', () => {
    const save = vi.fn();
    render(<EditableSet initial={empty} save={save}/>);
    fireEvent.change(screen.getByLabelText('Set 1 weight in kg'), { target: { value: '0' } });
    const reps = screen.getByLabelText('Set 1 reps');
    fireEvent.focus(reps);
    fireEvent.change(reps, { target: { value: '12' } });
    expect(save.mock.calls.at(-1)[0].completed).toBe(false);
    fireEvent.blur(reps);
    expect(save.mock.calls.at(-1)[0]).toMatchObject({ weight: 0, reps: 12, completed: true });
  });

  it('does not confirm invalid reps or confirm from warm-up and RIR changes', () => {
    const save = vi.fn();
    render(<EditableSet initial={empty} previous={lastSet} save={save}/>);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Set 1 reps in reserve (optional)'), { target: { value: '2' } });
    expect(save.mock.calls.at(-1)[0].completed).toBe(false);
    const reps = screen.getByLabelText('Set 1 reps');
    fireEvent.focus(reps);
    fireEvent.change(reps, { target: { value: '0' } });
    fireEvent.blur(reps);
    expect(save.mock.calls.at(-1)[0].completed).toBe(false);
  });
});

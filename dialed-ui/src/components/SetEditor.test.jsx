// @vitest-environment jsdom
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
    expect(onChange).toHaveBeenCalledWith({ ...base, reps: 10, completed: true });
  });

  it('identifies invalid prescription bounds before save', () => {
    render(<PrescriptionEditor value={{ workingSets: 3, repMin: 12, repMax: 8, incrementKg: 2.5 }} onChange={() => {}}/>);
    expect(screen.getByLabelText('Max reps').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('Minimum reps');
  });
});

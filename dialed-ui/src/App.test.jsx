// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./lib/Auth', () => ({
  AuthProvider: ({ children }) => children,
  AuthScreen: () => <p>Sign in</p>,
  useAuth: () => ({ user: { id: 'test-user' }, loading: false, recovery: false }),
}));
vi.mock('./lib/Training', () => ({
  TrainingProvider: ({ children }) => children,
  useTraining: () => ({ online: true, error: '', rows: [] }),
}));
vi.mock('./pages/Welcome', () => ({
  default: () => <>
    <label>Workout name<input type="text"/></label>
    <label>Warm-up<input type="checkbox"/></label>
  </>,
}));
import App from './App';

let viewport;

beforeEach(() => {
  viewport = Object.assign(new EventTarget(), { height: 800, scale: 1 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', 800);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderApp() {
  const view = render(<MemoryRouter><App/></MemoryRouter>);
  const input = await screen.findByRole('textbox', { name: 'Workout name' });
  const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
  return { ...view, input, shell: navigation.closest('.app-shell') };
}

function resizeViewport(height, scale = 1) {
  act(() => {
    viewport.height = height;
    viewport.scale = scale;
    viewport.dispatchEvent(new Event('resize'));
  });
}

describe('mobile keyboard navigation', () => {
  it('hides the bottom navigation only when a focused text field reduces the viewport substantially', async () => {
    const { input, shell } = await renderApp();
    act(() => input.focus());
    expect(shell.classList.contains('keyboard-open')).toBe(false);

    resizeViewport(700);
    expect(shell.classList.contains('keyboard-open')).toBe(false);

    resizeViewport(450);
    expect(shell.classList.contains('keyboard-open')).toBe(true);

    resizeViewport(800);
    expect(shell.classList.contains('keyboard-open')).toBe(false);
  });

  it('responds to text-field focus when the viewport is already reduced', async () => {
    const { input, shell } = await renderApp();
    resizeViewport(450);
    expect(shell.classList.contains('keyboard-open')).toBe(false);

    act(() => input.focus());
    expect(shell.classList.contains('keyboard-open')).toBe(true);

    act(() => input.blur());
    expect(shell.classList.contains('keyboard-open')).toBe(false);
  });

  it('keeps navigation available when a checkbox is focused', async () => {
    const { input, shell } = await renderApp();
    resizeViewport(450);
    act(() => input.focus());
    expect(shell.classList.contains('keyboard-open')).toBe(true);

    act(() => screen.getByRole('checkbox', { name: 'Warm-up' }).focus());
    expect(shell.classList.contains('keyboard-open')).toBe(false);

    resizeViewport(400);
    expect(shell.classList.contains('keyboard-open')).toBe(false);
  });

  it('does not mistake pinch zoom for the on-screen keyboard', async () => {
    const { input, shell } = await renderApp();
    act(() => input.focus());
    resizeViewport(400, 2);
    expect(shell.classList.contains('keyboard-open')).toBe(false);

    resizeViewport(400, 1);
    expect(shell.classList.contains('keyboard-open')).toBe(true);
  });

  it('removes viewport and focus listeners when the shell unmounts', async () => {
    const addViewportListener = vi.spyOn(viewport, 'addEventListener');
    const removeViewportListener = vi.spyOn(viewport, 'removeEventListener');
    const addFocusListener = vi.spyOn(document, 'addEventListener');
    const removeFocusListener = vi.spyOn(document, 'removeEventListener');
    const { unmount } = await renderApp();
    const resizeHandler = addViewportListener.mock.calls.find(([type]) => type === 'resize')?.[1];
    expect(resizeHandler).toBeTypeOf('function');
    expect(addFocusListener).toHaveBeenCalledWith('focusin', resizeHandler);
    expect(addFocusListener).toHaveBeenCalledWith('focusout', resizeHandler);

    unmount();

    expect(removeViewportListener).toHaveBeenCalledWith('resize', resizeHandler);
    expect(removeFocusListener).toHaveBeenCalledWith('focusin', resizeHandler);
    expect(removeFocusListener).toHaveBeenCalledWith('focusout', resizeHandler);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  loading: false,
  profile: null as null | object,
}));

vi.mock('./data/auth', () => ({ useSession: () => ({ session: state.session, loading: state.loading }) }));
vi.mock('./data/api', () => ({ getProfile: async () => state.profile }));

import App from './App';

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  state.session = null;
  state.loading = false;
  state.profile = null;
});

describe('Workout routes', () => {
  const signedIn = () => {
    state.session = { user: { id: 'u' } };
    state.profile = {};
  };
  it.each([
    ['/workout', 'Workout'],
    ['/workout/history', 'Workout history'],
    ['/workout/history/abc', 'Workout'],
    ['/workout/import', 'Import workouts'],
  ])('renders %s', async (path, title) => {
    signedIn();
    at(path);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(title));
  });
  it('lists nav items in order with Workout active on /workout/history/abc', async () => {
    signedIn();
    at('/workout/history/abc');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links.map((a) => a.textContent)).toEqual(['Today', 'Workout', 'Activity', 'Settings']);
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null, null]);
  });
});

describe('App shell redirects', () => {
  it('shows a spinner while loading', () => {
    state.loading = true;
    at('/');
    expect(screen.getByRole('status')).toBeTruthy();
  });
  it('redirects to /signin without a session', async () => {
    at('/');
    await waitFor(() => expect(screen.getAllByText('Sign in').length).toBeGreaterThan(0));
  });
  it('redirects to /settings when signed in without a profile', async () => {
    state.session = { user: { id: 'u' } };
    at('/');
    await waitFor(() => expect(screen.getAllByText('Settings').length).toBeGreaterThan(1));
  });
  it('shows Today when signed in with a profile', async () => {
    state.session = { user: { id: 'u' } };
    state.profile = {};
    at('/');
    await waitFor(() => expect(screen.getAllByText('Today').length).toBeGreaterThan(1));
  });
});

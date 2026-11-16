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

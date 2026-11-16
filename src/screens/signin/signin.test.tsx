// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({
  sendSignInEmail: vi.fn(async (_e: string) => {}),
  verifyCode: vi.fn(async (_e: string, _c: string) => {}),
}));
vi.mock('../../data/auth', () => auth);

import SignInScreen from './index';

const setup = () => render(<MemoryRouter><SignInScreen /></MemoryRouter>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SignInScreen', () => {
  it('runs the two-step email then code flow', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' me@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await screen.findByText(/We emailed you a 6-digit code/);
    expect(auth.sendSignInEmail).toHaveBeenCalledWith('me@example.com');

    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(auth.verifyCode).toHaveBeenCalledWith('me@example.com', '123456'));
  });

  it('shows an invite-only message and keeps the email', async () => {
    auth.sendSignInEmail.mockRejectedValueOnce(new Error('Signups not allowed for otp'));
    setup();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'x@y.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('invite-only');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('x@y.com');
  });

  it('rejects a malformed code without calling verifyCode, and can go back', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await screen.findByLabelText('6-digit code');
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(auth.verifyCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
});

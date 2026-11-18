// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({ getProfile: vi.fn() }));
const wk = vi.hoisted(() => ({
  loadWorkoutData: vi.fn(),
  getWorkoutSession: vi.fn(),
  importWorkoutSessions: vi.fn(),
}));
vi.mock('../../data/api', () => api);
vi.mock('../../data/workouts', () => wk);

import HistoryScreen from './index';
import SessionScreen from './session';
import ImportScreen from './import';

const app = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/workout/history" element={<HistoryScreen />} />
        <Route path="/workout/history/:id" element={<SessionScreen />} />
        <Route path="/workout/import" element={<ImportScreen />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  Object.values(wk).forEach((f) => f.mockReset());
  api.getProfile.mockResolvedValue({ timezone: 'UTC' });
});
afterEach(cleanup);

describe('history', () => {
  it('renders rows linking to sessions', async () => {
    wk.loadWorkoutData.mockResolvedValue({
      lastByDay: {},
      recent: [
        { id: 'a', day: 1, startedAt: '2026-11-16T10:00:00Z', completedAt: '2026-11-16T11:00:00Z', exerciseCount: 3, setsDone: 9 },
        { id: 'b', day: 2, startedAt: '2026-11-14T10:00:00Z', completedAt: null, exerciseCount: 1, setsDone: 1 },
      ],
    });
    app('/workout/history');
    const row = await screen.findByText(/Day 1 · Chest, Triceps · 9 sets/);
    expect(row.closest('a')?.getAttribute('href')).toBe('/workout/history/a');
    expect(screen.getByText(/Day 2 · .* · 1 set$/)).toBeTruthy();
    expect(screen.getByText('unfinished')).toBeTruthy();
    expect(screen.getByText('Import from FatherWorkout').getAttribute('href')).toBe('/workout/import');
  });

  it('shows the empty state', async () => {
    wk.loadWorkoutData.mockResolvedValue({ recent: [], lastByDay: {} });
    app('/workout/history');
    expect(await screen.findByText(/No workouts yet/)).toBeTruthy();
  });

  it('shows an error with retry', async () => {
    wk.loadWorkoutData.mockRejectedValueOnce(new Error('boom'));
    wk.loadWorkoutData.mockResolvedValue({ recent: [], lastByDay: {} });
    app('/workout/history');
    expect(await screen.findByText('boom')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText(/No workouts yet/)).toBeTruthy();
  });
});

describe('session', () => {
  it('renders sets and notes', async () => {
    wk.getWorkoutSession.mockResolvedValue({
      schemaVersion: 1, id: 'a', day: 1, startedAt: '2026-11-16T10:00:00Z', completedAt: '2026-11-16T11:00:00Z',
      notes: 'felt strong',
      entries: [
        { exerciseId: 'x', name: 'Dumbbell Press', notes: 'slow tempo', sets: [
          { reps: 12, weightLb: 45, timeMin: null, timeSec: null, done: true },
          { reps: 10, weightLb: 45, timeMin: null, timeSec: null, done: false },
        ] },
        { exerciseId: 'y', name: 'Bike', notes: null, sets: [{ reps: null, weightLb: null, timeMin: 10, timeSec: null, done: true }] },
      ],
    });
    app('/workout/history/a');
    expect(await screen.findByText('Dumbbell Press')).toBeTruthy();
    expect(screen.getByText(/12 × 45 lb/)).toBeTruthy();
    expect(screen.getByText(/10 × 45 lb/).className).toBe('wh-set--todo');
    expect(screen.getByText(/10 min/)).toBeTruthy();
    expect(screen.getByText('slow tempo')).toBeTruthy();
    expect(screen.getByText('felt strong')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Day 1 · Chest, Triceps');
  });

  it('shows not found', async () => {
    wk.getWorkoutSession.mockRejectedValue(new Error('Session not found: zz'));
    app('/workout/history/zz');
    expect(await screen.findByText('Session not found: zz')).toBeTruthy();
  });
});

describe('import', () => {
  const file = (name: string, body: string) => new File([body], name, { type: 'application/json' });

  it('flattens files, imports once and reports counts', async () => {
    wk.importWorkoutSessions.mockResolvedValue({
      imported: 2, existing: 1, invalid: [{ index: 3, errors: ['day must be an integer'] }],
    });
    app('/workout/import');
    const input = screen.getByLabelText('Session files') as HTMLInputElement;
    const files = [
      file('one.json', JSON.stringify({ id: '1' })),
      file('many.json', JSON.stringify([{ id: '2' }, { id: '3' }])),
      file('bad.json', '{nope'),
      file('four.json', JSON.stringify({ id: '4' })),
    ];
    fireEvent.change(input, { target: { files } });
    expect(await screen.findByText(/2 imported · 1 already there · 2 invalid/)).toBeTruthy();
    expect(wk.importWorkoutSessions).toHaveBeenCalledTimes(1);
    expect(wk.importWorkoutSessions).toHaveBeenCalledWith([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }]);
    expect(screen.getByText('bad.json')).toBeTruthy();
    expect(screen.getByText(/Not valid JSON/)).toBeTruthy();
    expect(screen.getByText('four.json')).toBeTruthy();
  });

  it('shows an error on failure', async () => {
    wk.importWorkoutSessions.mockRejectedValue(new Error('Set up your profile'));
    app('/workout/import');
    fireEvent.change(screen.getByLabelText('Session files'), { target: { files: [file('a.json', '{}')] } });
    await waitFor(() => expect(screen.getByText('Set up your profile')).toBeTruthy());
  });
});

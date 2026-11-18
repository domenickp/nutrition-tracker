// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DRAFT_KEY } from '../../lib/workoutSession';
import type { WorkoutSession } from '../../lib/workoutSession';

const api = vi.hoisted(() => ({ getProfile: vi.fn() }));
const wk = vi.hoisted(() => ({ loadWorkoutData: vi.fn(), saveWorkoutSession: vi.fn() }));
vi.mock('../../data/api', () => api);
vi.mock('../../data/workouts', () => wk);

import WorkoutScreen from './index';

const lastDay2: WorkoutSession = {
  schemaVersion: 1, id: 'old', day: 2, startedAt: '2026-11-10T15:00:00Z', completedAt: '2026-11-10T16:00:00Z',
  notes: null,
  entries: [{
    exerciseId: 'd2-goblet-squat', name: 'Goblet Squat', notes: null,
    sets: [
      { reps: 10, weightLb: 50, timeMin: null, timeSec: null, done: true },
      { reps: 9, weightLb: 50, timeMin: null, timeSec: null, done: true },
    ],
  }],
};

const data = {
  recent: [{ id: 'x', day: 1, startedAt: '2026-11-09T15:00:00Z', completedAt: '2026-11-09T16:00:00Z', exerciseCount: 1, setsDone: 1 }],
  lastByDay: { '1': null, '2': lastDay2, '3': null, '4': null },
};

const renderScreen = () => render(<MemoryRouter><WorkoutScreen /></MemoryRouter>);
const card = (name: string) => screen.getByRole('heading', { name }).closest('section') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  api.getProfile.mockReset().mockResolvedValue({ timezone: 'America/New_York' });
  wk.loadWorkoutData.mockReset().mockResolvedValue(data);
  wk.saveWorkoutSession.mockReset().mockResolvedValue({ id: 'id', date: '2026-11-18', savedAt: 'x' });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WorkoutScreen', () => {
  it('shows an error with Retry when loading fails', async () => {
    wk.loadWorkoutData.mockRejectedValueOnce(new Error('boom'));
    renderScreen();
    expect((await screen.findByRole('alert')).textContent).toMatch(/boom/);
    fireEvent.click(screen.getByText('Retry'));
    await screen.findByText('Day 2 · Legs');
  });

  it('defaults to the day after the latest completed one and prefills from last time', async () => {
    renderScreen();
    const pick = await screen.findByText('Day 2 · Legs');
    expect(pick.getAttribute('aria-pressed')).toBe('true');
    const goblet = card('Goblet Squat');
    expect(within(goblet).getByText('Last time:').textContent).toContain('10×50, 9×50');
    expect((within(goblet).getAllByLabelText('Reps')[0] as HTMLInputElement).value).toBe('10');
    expect((within(goblet).getAllByLabelText('Weight (lb)')[0] as HTMLInputElement).value).toBe('50');
    // no previous set 3: falls back to the target
    expect((within(goblet).getAllByLabelText('Reps')[2] as HTMLInputElement).value).toBe('12');
    expect(screen.getByRole('link', { name: 'History' }).getAttribute('href')).toBe('/workout/history');
  });

  it('stepper changes a value, add/remove set works, finish stays disabled with nothing done', async () => {
    renderScreen();
    await screen.findByText('Day 2 · Legs');
    const goblet = card('Goblet Squat');
    fireEvent.click(within(goblet).getAllByLabelText('Increase Weight (lb)')[0]);
    expect((within(goblet).getAllByLabelText('Weight (lb)')[0] as HTMLInputElement).value).toBe('52.5');
    fireEvent.click(within(goblet).getAllByLabelText('Decrease Reps')[0]);
    expect((within(goblet).getAllByLabelText('Reps')[0] as HTMLInputElement).value).toBe('9');

    fireEvent.click(within(goblet).getByText('+ Add set'));
    expect(within(goblet).getAllByText(/^Set \d$/)).toHaveLength(4);
    fireEvent.click(within(goblet).getByLabelText('Remove set 4 of Goblet Squat'));
    expect(within(goblet).getAllByText(/^Set \d$/)).toHaveLength(3);

    expect((screen.getByText('Finish workout') as HTMLButtonElement).disabled).toBe(true);
  });

  it('done starts the rest banner which counts down, adjusts and dismisses', async () => {
    renderScreen();
    await screen.findByText('Day 2 · Legs');
    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText('Done set 1 of Goblet Squat'));
    expect(screen.getByTestId('rest-time').textContent).toBe('2:00');
    expect(screen.getByText('Finish workout · 1 set')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByTestId('rest-time').textContent).toBe('1:50');
    fireEvent.click(screen.getByLabelText('Add 15 seconds'));
    expect(screen.getByTestId('rest-time').textContent).toBe('2:05');
    fireEvent.click(screen.getByLabelText('Subtract 15 seconds'));
    expect(screen.getByTestId('rest-time').textContent).toBe('1:50');
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(screen.getByText('Rest over. Next set!')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Dismiss rest timer'));
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('writes a draft and offers to resume it after reload', async () => {
    renderScreen();
    await screen.findByText('Day 2 · Legs');
    fireEvent.click(screen.getByLabelText('Done set 1 of Goblet Squat'));
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) as string);
    expect(draft.day).toBe(2);
    expect(draft.log['d2-goblet-squat'].sets[0].done).toBe(true);
    expect(draft.id).toBeTruthy();
    cleanup();

    renderScreen();
    expect(await screen.findByText(/unfinished Day 2 workout/)).toBeTruthy();
    fireEvent.click(screen.getByText('Resume workout'));
    expect(screen.getByText('Finish workout · 1 set')).toBeTruthy();
    expect(screen.getByLabelText('Done set 1 of Goblet Squat').getAttribute('aria-pressed')).toBe('true');
  });

  it('discarding a draft clears it', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      id: 'd', day: 3, startedAt: '2026-11-17T12:00:00Z', notes: '', log: {},
    }));
    renderScreen();
    fireEvent.click(await screen.findByText('Discard it'));
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('finish saves only touched exercises with completedAt, then shows the saved message', async () => {
    renderScreen();
    await screen.findByText('Day 2 · Legs');
    fireEvent.click(screen.getByLabelText('Done set 1 of Goblet Squat'));
    fireEvent.click(screen.getByText('Finish workout · 1 set'));
    await screen.findByText(/Saved · counts toward/);
    expect(screen.getByRole('status').textContent).toMatch(/Wed, Nov 18, 2026/);
    expect(wk.saveWorkoutSession).toHaveBeenCalledTimes(1);
    const s: WorkoutSession = wk.saveWorkoutSession.mock.calls[0][0];
    expect(s.day).toBe(2);
    expect(s.completedAt).not.toBeNull();
    expect(s.entries.map((e) => e.exerciseId)).toEqual(['d2-goblet-squat']);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.getByText('View history').getAttribute('href')).toBe('/workout/history');
  });

  it('starts the clock at the first change, not at mount', async () => {
    renderScreen();
    await screen.findByText('Day 2 · Legs');
    vi.useFakeTimers();
    const mountTime = Date.now();
    act(() => { vi.advanceTimersByTime(30 * 60_000); });
    fireEvent.click(screen.getByLabelText('Done set 1 of Goblet Squat'));
    const firstChange = mountTime + 30 * 60_000;
    act(() => { vi.advanceTimersByTime(10 * 60_000); });
    await act(async () => { fireEvent.click(screen.getByText('Finish workout · 1 set')); });
    const s: WorkoutSession = wk.saveWorkoutSession.mock.calls[0][0];
    expect(Date.parse(s.startedAt)).toBe(firstChange);
    expect(Date.parse(s.completedAt as string)).toBe(firstChange + 10 * 60_000);
  });

  it('backdates the start by the duration when the first action is a timed set', async () => {
    wk.loadWorkoutData.mockResolvedValue({
      ...data,
      lastByDay: {
        ...data.lastByDay,
        '2': {
          ...lastDay2,
          entries: [{
            exerciseId: 'd2-warm-up-stationary-bike', name: 'Warm Up: Stationary Bike', notes: null,
            sets: [{ reps: null, weightLb: null, timeMin: 40, timeSec: null, done: true }],
          }],
        },
      },
    });
    renderScreen();
    await screen.findByText('Day 2 · Legs');
    vi.useFakeTimers();
    act(() => { vi.advanceTimersByTime(5 * 60_000); });
    const t = Date.now();
    fireEvent.click(screen.getByLabelText('Done set 1 of Warm Up: Stationary Bike'));
    act(() => { vi.advanceTimersByTime(30 * 60_000); });
    await act(async () => { fireEvent.click(screen.getByText('Finish workout · 1 set')); });
    const s: WorkoutSession = wk.saveWorkoutSession.mock.calls[0][0];
    expect(Date.parse(s.startedAt)).toBe(t - 40 * 60_000);
    expect(Date.parse(s.completedAt as string)).toBe(t + 30 * 60_000);
  });

  it('keeps the draft and shows the error when saving fails', async () => {
    wk.saveWorkoutSession.mockRejectedValueOnce(new Error('network down'));
    renderScreen();
    await screen.findByText('Day 2 · Legs');
    fireEvent.click(screen.getByLabelText('Done set 1 of Goblet Squat'));
    fireEvent.click(screen.getByText('Finish workout · 1 set'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/network down/));
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it('confirms before switching day when sets are done', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderScreen();
    await screen.findByText('Day 2 · Legs');
    fireEvent.click(screen.getByLabelText('Done set 1 of Goblet Squat'));
    fireEvent.click(screen.getByText('Day 3 · Back, Biceps'));
    expect(screen.getByText('Day 2 · Legs').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText('Day 3 · Back, Biceps'));
    expect(screen.getByText('Day 3 · Back, Biceps').getAttribute('aria-pressed')).toBe('true');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

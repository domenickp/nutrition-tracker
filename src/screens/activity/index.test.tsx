// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { DayData } from '../../lib/types';

const api = vi.hoisted(() => ({
  loadDay: vi.fn(),
  saveActivity: vi.fn(),
  saveWorkout: vi.fn(),
  saveExerciseRules: vi.fn(),
  listExerciseRules: vi.fn(),
  deleteWorkout: vi.fn(),
}));
vi.mock('../../data/api', () => api);

import ActivityScreen from './index';

const sample = readFileSync('docs/samples/workout-2026-11-16-d3.json', 'utf8');

const day: DayData = {
  date: '2026-11-16',
  profile: {
    userId: 'u', birthMonth: 1, birthYear: 1990, sex: 'male', heightCm: 180, goal: 'maintain', everydayActivity: 'sedentary',
    units: 'imperial', timezone: 'America/New_York',
    overrideKcalAdjustPct: null, overrideProteinGPerLb: null, overrideFatPct: null, overrideWaterBaseMlPerKg: null,
  },
  weightKg: 80,
  activity: null,
  workouts: [],
  foodLogs: [],
  waterLogs: [],
};

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={['/day/2026-11-16/activity']}>
      <Routes>
        <Route path="/day/:date/activity" element={<ActivityScreen />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.loadDay.mockResolvedValue(day);
  api.listExerciseRules.mockResolvedValue([]);
  api.saveWorkout.mockResolvedValue('saved');
  api.saveActivity.mockResolvedValue(undefined);
  api.saveExerciseRules.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function openReview() {
  renderScreen();
  fireEvent.click(await screen.findByText('Import workout'));
  fireEvent.change(screen.getByLabelText('Workout JSON'), { target: { value: sample } });
  fireEvent.click(screen.getByText('Review'));
  await screen.findByText('Save workout');
}

describe('ActivityScreen', () => {
  it('reviews the sample: bike light, date warning; strenuous override saves', async () => {
    await openReview();
    const bike = screen.getByLabelText(/Stationary Bike/) as HTMLSelectElement;
    expect(bike.value).toBe('light_cardio');
    expect(screen.getByRole('alert').textContent).toMatch(/will be saved to Nov 15/);
    fireEvent.change(bike, { target: { value: 'strenuous_cardio' } });
    fireEvent.click(screen.getByText('Save workout'));
    await waitFor(() => expect(api.saveWorkout).toHaveBeenCalled());
    const [summary, replace] = api.saveWorkout.mock.calls[0];
    expect(replace).toBe(false);
    expect(summary.strenuousCardioH).toBeCloseTo(0.667, 2);
    expect(summary.lightCardioH).toBe(0);
    await waitFor(() => expect(api.saveExerciseRules).toHaveBeenCalled());
  });

  it('asks to replace when the workout exists', async () => {
    api.saveWorkout.mockResolvedValueOnce('exists');
    await openReview();
    fireEvent.click(screen.getByText('Save workout'));
    await screen.findByText('Already imported — replace it?');
    fireEvent.click(screen.getByText('Replace'));
    await waitFor(() => expect(api.saveWorkout).toHaveBeenCalledTimes(2));
    expect(api.saveWorkout.mock.calls[1][1]).toBe(true);
  });

  it('shows parse errors and keeps the text', async () => {
    renderScreen();
    fireEvent.click(await screen.findByText('Import workout'));
    fireEvent.change(screen.getByLabelText('Workout JSON'), { target: { value: '{nope' } });
    fireEvent.click(screen.getByText('Review'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Not valid JSON/);
    expect((screen.getByLabelText('Workout JSON') as HTMLTextAreaElement).value).toBe('{nope');
  });

  it('hours mode: no sedentary input, states the rule, shows the breakdown', async () => {
    api.loadDay.mockResolvedValue({
      ...day,
      activity: {
        date: day.date, mode: 'hours', directKcal: null,
        hours: { sedentaryH: 9, lightCardioH: 0, strenuousCardioH: 0, liftingH: 1 },
        everydayActivity: null,
      },
      workouts: [{ id: 'w', startedAt: '2026-11-16T15:00:00Z', raw: null, lightCardioH: 1, strenuousCardioH: 0, liftingH: 0 }],
    });
    renderScreen();
    await screen.findByText('Activity total:', { exact: false });
    expect(screen.queryByLabelText(/Sedentary hours/)).toBeNull();
    expect(screen.getByText(/16 waking hours minus all exercise/)).toBeTruthy();
    const row = screen.getByText('Sedentary').closest('tr')!;
    // 16 - (1 lifting + 1 light) = 14 h; 0.3 * 80 * 14 = 336 kcal
    expect(row.textContent).toMatch(/14\.0/);
    expect(row.textContent).toMatch(/336/);
    expect(screen.getByText(/Hours include this day/)).toBeTruthy();
    fireEvent.click(screen.getByText('Save activity'));
    await waitFor(() => expect(api.saveActivity).toHaveBeenCalled());
    expect(api.saveActivity.mock.calls[0][0].hours.sedentaryH).toBe(0);
  });

  it('saves direct mode', async () => {
    renderScreen();
    fireEvent.click(await screen.findByText('Enter calories'));
    fireEvent.change(screen.getByLabelText(/Active calories/), { target: { value: '450' } });
    fireEvent.click(screen.getByText('Save activity'));
    await waitFor(() => expect(api.saveActivity).toHaveBeenCalled());
    expect(api.saveActivity.mock.calls[0][0]).toMatchObject({ mode: 'direct', directKcal: 450, date: '2026-11-16' });
  });

  it('has the everyday selector in hours mode and saves its value', async () => {
    renderScreen();
    const sel = (await screen.findByLabelText('Everyday activity today')) as HTMLSelectElement;
    expect(screen.getByText(/Same setting as on the Today screen/)).toBeTruthy();
    expect(sel.options[0].textContent).toBe('Settings default (Mostly sitting)');
    fireEvent.change(sel, { target: { value: 'active' } });
    fireEvent.click(screen.getByText('Save activity'));
    await waitFor(() => expect(api.saveActivity).toHaveBeenCalled());
    expect(api.saveActivity.mock.calls[0][0].everydayActivity).toBe('active');
  });

  it('hides the selector in direct mode and keeps a stored override on save', async () => {
    api.loadDay.mockResolvedValue({
      ...day,
      activity: {
        date: day.date, mode: 'direct', directKcal: 300,
        hours: { sedentaryH: 0, lightCardioH: 0, strenuousCardioH: 0, liftingH: 0 },
        everydayActivity: 'moderate',
      },
    });
    renderScreen();
    await screen.findByText(/already cover the whole day/);
    expect(screen.queryByLabelText('Everyday activity today')).toBeNull();
    fireEvent.click(screen.getByText('Save activity'));
    await waitFor(() => expect(api.saveActivity).toHaveBeenCalled());
    expect(api.saveActivity.mock.calls[0][0]).toMatchObject({ mode: 'direct', everydayActivity: 'moderate' });
  });
});

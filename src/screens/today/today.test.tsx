// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayData } from '../../lib/types';

vi.mock('../../data/api', () => ({
  loadDay: vi.fn(),
  getProfile: vi.fn(),
  addWater: vi.fn(async () => ({})),
  deleteWater: vi.fn(),
  updateFoodLog: vi.fn(async () => ({})),
  deleteFoodLog: vi.fn(),
}));
import * as api from '../../data/api';
import { computeTargets } from '../../lib/targets';
import TodayScreen from './index';

const zero = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0 };
function fixture(over: Partial<DayData> = {}): DayData {
  return {
    date: '2026-11-15',
    profile: {
      userId: 'u', birthMonth: 1, birthYear: 1990, sex: 'male', heightCm: 180, goal: 'maintain',
      units: 'imperial', timezone: 'America/New_York', overrideKcalAdjustPct: null,
      overrideProteinGPerLb: null, overrideFatPct: null, overrideWaterBaseMlPerKg: null,
    },
    weightKg: 80,
    activity: null,
    workouts: [],
    foodLogs: [
      { id: 'f1', date: '2026-11-15', loggedAt: 'x', foodId: null, name: 'Oats', quantity: 2, unitLabel: 'servings',
        grams: 80, totals: { ...zero, kcal: 300, proteinG: 10, carbsG: 54, fatG: 6 } },
    ],
    waterLogs: [],
    ...over,
  };
}

function renderIt() {
  render(
    <MemoryRouter initialEntries={['/day/2026-11-15']}>
      <Routes>
        <Route path="/day/:date" element={<TodayScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api.loadDay).mockResolvedValue(fixture());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TodayScreen', () => {
  it('shows remaining calories computed from targets', async () => {
    const d = fixture();
    const t = computeTargets({ profile: d.profile, weightKg: 80, date: d.date, activity: null, workouts: [] });
    renderIt();
    const left = Math.round(t.targets.kcal - 300).toLocaleString('en-US');
    await waitFor(() => expect(screen.getAllByText(left).length).toBeGreaterThan(0));
    expect(screen.getByText('Oats')).toBeTruthy();
  });

  it('quick-add 12 fl oz calls addWater with ml', async () => {
    renderIt();
    fireEvent.click(await screen.findByText('+12 fl oz'));
    await waitFor(() => expect(api.addWater).toHaveBeenCalled());
    const [date, ml] = vi.mocked(api.addWater).mock.calls[0];
    expect(date).toBe('2026-11-15');
    expect(Math.abs(ml - 354.9)).toBeLessThan(0.5);
    await waitFor(() => expect(api.loadDay).toHaveBeenCalledTimes(2));
  });

  it('editing quantity scales totals', async () => {
    renderIt();
    fireEvent.click(await screen.findByText('Oats'));
    fireEvent.change(await screen.findByLabelText(/Amount/), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(api.updateFoodLog).toHaveBeenCalled());
    const [id, patch] = vi.mocked(api.updateFoodLog).mock.calls[0];
    expect(id).toBe('f1');
    expect(patch.quantity).toBe(1);
    expect(patch.totals.kcal).toBeCloseTo(150, 0);
    expect(patch.grams).toBe(40);
  });

  it('prompts for weight when missing', async () => {
    vi.mocked(api.loadDay).mockResolvedValue(fixture({ weightKg: null }));
    renderIt();
    expect(await screen.findByText(/Add your weight in Settings/)).toBeTruthy();
    expect(screen.getByText('Oats')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisDay, DayData, Profile } from '../../lib/types';
import { addDays, todayIn } from '../../lib/dates';
import { analyzeWeight, type Suggestion } from '../../lib/weightAnalysis';

vi.mock('../../data/api', () => ({
  loadDay: vi.fn(),
  getProfile: vi.fn(),
  addWater: vi.fn(async () => ({})),
  deleteWater: vi.fn(),
  updateFoodLog: vi.fn(async () => ({})),
  deleteFoodLog: vi.fn(),
  addWeight: vi.fn(async () => {}),
  loadAnalysisData: vi.fn(),
  listSuggestionRecords: vi.fn(async () => [] as unknown[] | null),
  acceptCalorieSuggestion: vi.fn(async () => ({})),
  snoozeSuggestion: vi.fn(async () => true),
  saveActivity: vi.fn(async () => {}),
}));
vi.mock('../../lib/weightAnalysis', async (orig) => {
  const m = await orig<typeof import('../../lib/weightAnalysis')>();
  return { ...m, analyzeWeight: vi.fn(m.analyzeWeight) };
});
import * as api from '../../data/api';
import { computeTargets } from '../../lib/targets';
import TodayScreen from './index';

const realImpl = vi.mocked(analyzeWeight).getMockImplementation()!;
const realAnalyze = realImpl;

const zero = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0 };
function fixture(over: Partial<DayData> = {}): DayData {
  return {
    date: '2026-11-15',
    profile: {
      userId: 'u', birthMonth: 1, birthYear: 1990, sex: 'male', heightCm: 180, goal: 'maintain', everydayActivity: 'sedentary',
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

const TODAY = todayIn('America/New_York');

function analysisData(weighIns: Array<{ date: string; kg: number }>, profile?: Profile) {
  const days: AnalysisDay[] = [];
  for (let i = 21; i >= 1; i--) {
    days.push({ date: addDays(TODAY, -i), intakeKcal: null, proteinG: null, activity: null, workouts: [] });
  }
  return { profile: profile ?? fixture().profile, weighIns, days };
}

function renderToday() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<TodayScreen />} />
        <Route path="/progress" element={<p>PROGRESS</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(analyzeWeight).mockImplementation(realImpl);
  vi.mocked(api.loadDay).mockResolvedValue(fixture());
  vi.mocked(api.getProfile).mockResolvedValue(fixture().profile);
  vi.mocked(api.loadAnalysisData).mockResolvedValue(analysisData([]));
  vi.mocked(api.listSuggestionRecords).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TodayScreen food row grams', () => {
  function logs(unitLabel: string, quantity: number, grams: number | null) {
    const base = fixture();
    vi.mocked(api.loadDay).mockResolvedValue({
      ...base,
      foodLogs: [{ ...base.foodLogs[0], unitLabel, quantity, grams }],
    });
  }

  it('shows rounded grams for non-gram units', async () => {
    logs('1 cup', 1, 240.4);
    renderIt();
    const text = (await screen.findByText(/\(240 g\)/)).textContent;
    expect(text).toContain('1 cup (240 g)');
    expect(text).not.toContain('1 1 cup');
  });

  it('does not duplicate grams for gram entries', async () => {
    logs('g', 150, 150);
    renderIt();
    expect((await screen.findByText(/150 g/)).textContent).not.toContain('(150 g)');
  });

  it('shows no parenthesis when grams are unknown', async () => {
    logs('servings', 2, null);
    renderIt();
    expect((await screen.findByText(/2 servings/)).textContent).not.toContain('(');
  });
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

  it('imperial water quick-add buttons are 12, 16, 18 and 20 fl oz', async () => {
    renderIt();
    for (const label of ['+12 fl oz', '+16 fl oz', '+18 fl oz', '+20 fl oz']) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('+8 fl oz')).toBeNull();
  });

  it('quick-add 20 fl oz calls addWater with about 591.47 ml', async () => {
    renderIt();
    fireEvent.click(await screen.findByText('+20 fl oz'));
    await waitFor(() => expect(api.addWater).toHaveBeenCalled());
    const [, ml] = vi.mocked(api.addWater).mock.calls[0];
    expect(Math.abs(ml - 591.47)).toBeLessThan(0.01);
  });

  it('metric water quick-add buttons are unchanged (250, 330, 500 ml)', async () => {
    const d = fixture();
    d.profile = { ...d.profile, units: 'metric' };
    vi.mocked(api.loadDay).mockResolvedValue(d);
    renderIt();
    for (const label of ['+250 ml', '+330 ml', '+500 ml']) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('+12 ml')).toBeNull();
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

  it('past-day pages show no weigh-in and skip the analysis', async () => {
    renderIt();
    await screen.findByText('Oats');
    expect(screen.queryByText('Save weight')).toBeNull();
    expect(api.loadAnalysisData).not.toHaveBeenCalled();
  });
});

describe('TodayScreen weigh-in', () => {
  const todayDay = () => fixture({ date: TODAY });
  const falling = () =>
    Array.from({ length: 22 }, (_, i) => ({ date: addDays(TODAY, -21 + i), kg: 90 - i * 0.05 }));

  it('saves a weight in lb as kg, then shows it', async () => {
    vi.mocked(api.loadDay).mockResolvedValue(todayDay());
    renderToday();
    fireEvent.change(await screen.findByLabelText('Weight (lb)'), { target: { value: '200' } });
    fireEvent.click(screen.getByText('Save weight'));
    await waitFor(() => expect(api.addWeight).toHaveBeenCalled());
    const [date, kg] = vi.mocked(api.addWeight).mock.calls[0] as unknown as [string, number];
    expect(date).toBe(TODAY);
    expect(kg).toBeCloseTo(90.72, 1);
    expect(await screen.findByText('Edit')).toBeTruthy();
    expect(screen.getByText('200.0 lb')).toBeTruthy();
  });

  it('shows the trend line and a Progress link', async () => {
    vi.mocked(api.loadDay).mockResolvedValue(todayDay());
    vi.mocked(api.loadAnalysisData).mockResolvedValue(analysisData(falling()));
    renderToday();
    const el = await screen.findByText(/^Trend \d+\.\d lb · /);
    expect(el.textContent).toMatch(/^Trend \d+\.\d lb · (collecting data|[−+]?\d+\.\d lb\/wk)/);
    expect((screen.getByText('Progress') as HTMLAnchorElement).getAttribute('href')).toBe('/progress');
  });

  it('metric profile shows kg', async () => {
    const d = todayDay();
    d.profile = { ...d.profile, units: 'metric' };
    vi.mocked(api.loadDay).mockResolvedValue(d);
    vi.mocked(api.loadAnalysisData).mockResolvedValue(analysisData(falling(), d.profile));
    renderToday();
    expect(await screen.findByLabelText('Weight (kg)')).toBeTruthy();
    const el = await screen.findByText(/^Trend \d+\.\d kg · /);
    expect(el.textContent).not.toMatch(/lb/);
  });

  describe('suggestion card', () => {
    const calorie: Suggestion = {
      kind: 'calorie', title: 'Raise calories', reason: 'because', oldAdjustPct: -20, oldKcal: 2000,
      newAdjustPct: -15, newKcal: 2200,
    };
    /** First analysis has the suggestion, later ones (after a reload) do not. */
    function suggestOnce() {
      let n = 0;
      vi.mocked(analyzeWeight).mockImplementation((i) => ({
        ...realAnalyze(i),
        suggestions: n++ === 0 ? [calorie] : [],
      }));
    }

    it('Accept saves the new adjustment and refreshes the day', async () => {
      vi.mocked(api.loadDay).mockResolvedValue(todayDay());
      suggestOnce();
      renderToday();
      expect(await screen.findByText('Raise calories')).toBeTruthy();
      fireEvent.click(screen.getByText('Accept'));
      await waitFor(() => expect(api.acceptCalorieSuggestion).toHaveBeenCalled());
      expect(vi.mocked(api.acceptCalorieSuggestion).mock.calls[0][1]).toMatchObject({ newAdjustPct: -15 });
      await waitFor(() => expect(api.loadDay).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByText('Raise calories')).toBeNull());
    });

    it('Not now snoozes and hides the card', async () => {
      vi.mocked(api.loadDay).mockResolvedValue(todayDay());
      suggestOnce();
      renderToday();
      fireEvent.click(await screen.findByText('Not now'));
      await waitFor(() => expect(api.snoozeSuggestion).toHaveBeenCalledWith('calorie', TODAY));
      await waitFor(() => expect(screen.queryByText('Raise calories')).toBeNull());
    });
  });

  it('records unavailable: no card, no error, weigh-in still works', async () => {
    vi.mocked(api.loadDay).mockResolvedValue(todayDay());
    vi.mocked(api.listSuggestionRecords).mockResolvedValue(null);
    renderToday();
    fireEvent.change(await screen.findByLabelText('Weight (lb)'), { target: { value: '180' } });
    fireEvent.click(screen.getByText('Save weight'));
    await waitFor(() => expect(api.addWeight).toHaveBeenCalled());
    expect(screen.queryByText('Suggestion')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an analysis failure hides the trend but never errors the screen', async () => {
    vi.mocked(api.loadDay).mockResolvedValue(todayDay());
    vi.mocked(api.loadAnalysisData).mockRejectedValue(new Error('boom'));
    renderToday();
    expect(await screen.findByLabelText('Weight (lb)')).toBeTruthy();
    await waitFor(() => expect(api.loadAnalysisData).toHaveBeenCalled());
    expect(screen.queryByText(/^Trend/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('everyday activity override', () => {
    it('shows the default label and saves a zero-hours row when none exists', async () => {
      renderIt();
      const sel = (await screen.findByLabelText('Everyday activity today')) as HTMLSelectElement;
      expect(sel.options[0].textContent).toBe('Settings default (Mostly sitting)');
      expect(screen.getByText(/Same setting as on the Activity screen/)).toBeTruthy();
      fireEvent.change(sel, { target: { value: 'moderate' } });
      await waitFor(() => expect(api.saveActivity).toHaveBeenCalled());
      expect(vi.mocked(api.saveActivity).mock.calls[0][0]).toEqual({
        date: '2026-11-15', mode: 'hours', directKcal: null,
        hours: { sedentaryH: 0, lightCardioH: 0, strenuousCardioH: 0, liftingH: 0 },
        everydayActivity: 'moderate',
      });
    });

    it('keeps existing hours when a row exists', async () => {
      const act = {
        date: '2026-11-15', mode: 'hours' as const, directKcal: null,
        hours: { sedentaryH: 0, lightCardioH: 1, strenuousCardioH: 0, liftingH: 0.5 },
        everydayActivity: 'active' as const,
      };
      vi.mocked(api.loadDay).mockResolvedValue(fixture({ activity: act }));
      renderIt();
      const sel = (await screen.findByLabelText('Everyday activity today')) as HTMLSelectElement;
      expect(sel.value).toBe('active');
      fireEvent.change(sel, { target: { value: '' } });
      await waitFor(() => expect(api.saveActivity).toHaveBeenCalled());
      expect(vi.mocked(api.saveActivity).mock.calls[0][0]).toEqual({ ...act, everydayActivity: null });
    });

    it('is shown disabled with a note on a direct-mode day', async () => {
      vi.mocked(api.loadDay).mockResolvedValue(
        fixture({
          activity: {
            date: '2026-11-15', mode: 'direct', directKcal: 400,
            hours: { sedentaryH: 0, lightCardioH: 0, strenuousCardioH: 0, liftingH: 0 },
            everydayActivity: null,
          },
        }),
      );
      renderIt();
      const sel = (await screen.findByLabelText('Everyday activity today')) as HTMLSelectElement;
      expect(sel.disabled).toBe(true);
      expect(screen.getByText(/Not used on days with entered calories\. Switch the day to hours/)).toBeTruthy();
      expect(screen.queryByText(/Same setting as on the/)).toBeNull();
      expect(screen.queryByText(/already cover the whole day/)).toBeNull();
    });
  });
});

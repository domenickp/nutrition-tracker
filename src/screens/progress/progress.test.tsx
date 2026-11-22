// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile, SuggestionRecord } from '../../lib/types';
import { todayIn } from '../../lib/dates';
import type { Suggestion, WeightAnalysis } from '../../lib/weightAnalysis';

const state = vi.hoisted(() => ({ session: { user: { id: 'u' } } as null | { user: { id: string } } }));
vi.mock('../../data/auth', () => ({ useSession: () => ({ session: state.session, loading: false }) }));
vi.mock('../../data/api', () => ({
  getProfile: vi.fn(),
  loadAnalysisData: vi.fn(),
  listSuggestionRecords: vi.fn(),
  acceptCalorieSuggestion: vi.fn(async () => ({})),
  snoozeSuggestion: vi.fn(async () => true),
}));
vi.mock('../../lib/weightAnalysis', () => ({ analyzeWeight: vi.fn() }));
import * as api from '../../data/api';
import { analyzeWeight } from '../../lib/weightAnalysis';
import App from '../../App';
import ProgressScreen from './index';

const profile: Profile = {
  userId: 'u', birthMonth: 1, birthYear: 1990, sex: 'male', heightCm: 180, goal: 'lose_fat',
  units: 'imperial', timezone: 'America/New_York', overrideKcalAdjustPct: null,
  overrideProteinGPerLb: null, overrideFatPct: null, overrideWaterBaseMlPerKg: null,
};
const TODAY = todayIn(profile.timezone);

const calorie: Suggestion = {
  kind: 'calorie', title: 'Raise calories', reason: 'because numbers', oldAdjustPct: -20, oldKcal: 2000,
  newAdjustPct: -15, newKcal: 2200,
};
const cardio: Suggestion = {
  kind: 'cardio', title: 'Add cardio', reason: 'cardio reason', oldAdjustPct: -20, oldKcal: 2000,
  newAdjustPct: null, newKcal: null,
};

function analysis(over: Partial<WeightAnalysis> = {}): WeightAnalysis {
  return {
    status: 'on_track',
    missing: [],
    window: { from: '2026-11-01', to: '2026-11-21', days: 21, loggedDays: 18, weighedDays: 15, lowLogDays: 0 },
    trend: [
      { date: '2026-11-20', kg: 80, trendKg: 80 },
      { date: '2026-11-21', kg: null, trendKg: 79.9 },
      { date: '2026-11-22', kg: 79, trendKg: 79.7 },
    ],
    rate: { kgPerWeek: -0.5, pctPerWeek: -0.63 },
    avgIntakeKcal: 2100,
    avgEstimatedBurn: 2600,
    impliedBurn: 2550,
    avgProteinG: 140,
    proteinTargetG: 160,
    suggestions: [],
    ...over,
  };
}

const rec = (over: Partial<SuggestionRecord>): SuggestionRecord => ({
  id: 'r', kind: 'calorie', action: 'accepted', snoozeUntil: null, oldAdjustPct: -20, newAdjustPct: -15,
  oldKcal: 2000, newKcal: 2200, reason: 'old reason', createdAt: '2026-11-10T15:00:00Z', ...over,
});

function renderIt(path = '/progress') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/progress" element={<ProgressScreen />} />
        <Route path="/" element={<p>TODAY PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api.getProfile).mockResolvedValue(profile);
  vi.mocked(api.loadAnalysisData).mockResolvedValue({ profile, weighIns: [], days: [] });
  vi.mocked(api.listSuggestionRecords).mockResolvedValue([]);
  vi.mocked(analyzeWeight).mockReturnValue(analysis());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProgressScreen', () => {
  it('draws one dot per weigh-in and one trend path', async () => {
    renderIt();
    const svg = await screen.findByRole('img');
    expect(svg.querySelectorAll('circle')).toHaveLength(2);
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    expect(svg.getAttribute('aria-label')).toMatch(/trend/i);
    // min / max weight and first / last dates, in lb
    expect(within(svg as unknown as HTMLElement).getByText('174.2 lb')).toBeTruthy();
    expect(within(svg as unknown as HTMLElement).getByText('176.4 lb')).toBeTruthy();
    expect(within(svg as unknown as HTMLElement).getByText('Nov 20')).toBeTruthy();
    expect(within(svg as unknown as HTMLElement).getByText('Nov 22')).toBeTruthy();
  });

  it('shows the trend, signed rate and status phrase', async () => {
    renderIt();
    expect(await screen.findByText(/Trend 175\.7 lb · −1\.1 lb\/wk/)).toBeTruthy();
    expect(screen.getByText('On track')).toBeTruthy();
  });

  it('shows window numbers and day counts', async () => {
    renderIt();
    await screen.findByRole('img');
    expect(screen.getByText('2,100 kcal/day')).toBeTruthy();
    expect(screen.getByText('2,600 kcal/day')).toBeTruthy();
    expect(screen.getByText('2,550 kcal/day')).toBeTruthy();
    expect(screen.getByText('140 g vs 160 g')).toBeTruthy();
    expect(screen.getByText('18 of 21 days logged, 15 weighed')).toBeTruthy();
  });

  it('shows dashes for null numbers', async () => {
    vi.mocked(analyzeWeight).mockReturnValue(
      analysis({ avgIntakeKcal: null, avgEstimatedBurn: null, impliedBurn: null, avgProteinG: null, proteinTargetG: null }),
    );
    renderIt();
    await screen.findByRole('img');
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getByText('— vs —')).toBeTruthy();
  });

  it('lists the missing items while collecting', async () => {
    vi.mocked(analyzeWeight).mockReturnValue(
      analysis({ status: 'collecting', rate: null, missing: ['8 more days', 'weigh in more often'] }),
    );
    renderIt();
    expect(await screen.findByText('Collecting data: 8 more days, weigh in more often')).toBeTruthy();
  });

  it('shows "No weigh-ins yet" with no points', async () => {
    vi.mocked(analyzeWeight).mockReturnValue(analysis({ trend: [], rate: null, status: 'collecting' }));
    renderIt();
    expect(await screen.findByText('No weigh-ins yet')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('says suggestions are unavailable when records are null', async () => {
    vi.mocked(api.listSuggestionRecords).mockResolvedValue(null);
    renderIt();
    expect(
      await screen.findByText('Suggestions unavailable until the database update is applied.'),
    ).toBeTruthy();
    expect(screen.getByText('No accepted suggestions yet.')).toBeTruthy();
  });

  it('shows an error when the analysis data fails to load', async () => {
    vi.mocked(api.loadAnalysisData).mockRejectedValue(new Error('boom'));
    renderIt();
    expect((await screen.findByRole('alert')).textContent).toBe('boom');
  });

  it('lists accepted calorie history newest first', async () => {
    vi.mocked(api.listSuggestionRecords).mockResolvedValue([
      rec({ id: 'a', createdAt: '2026-11-01T15:00:00Z', oldKcal: 1900, newKcal: 2000, reason: 'first one' }),
      rec({ id: 'b', createdAt: '2026-11-10T15:00:00Z', reason: 'second one' }),
      rec({ id: 'c', kind: 'protein', createdAt: '2026-11-12T15:00:00Z', reason: 'ignored' }),
      rec({ id: 'd', action: 'snoozed', createdAt: '2026-11-13T15:00:00Z', reason: 'ignored too' }),
    ]);
    renderIt();
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('2026-11-10');
    expect(items[0].textContent).toContain('2,000 → 2,200 kcal');
    expect(items[0].textContent).toContain('second one');
    expect(items[1].textContent).toContain('2026-11-01');
    expect(items[1].textContent).toContain('1,900 → 2,000 kcal');
    expect(screen.queryByText('No accepted suggestions yet.')).toBeNull();
  });

  it('shows the empty history state', async () => {
    renderIt();
    expect(await screen.findByText('No accepted suggestions yet.')).toBeTruthy();
  });

  it('shows every suggestion; Accept only on the calorie one', async () => {
    vi.mocked(analyzeWeight).mockReturnValue(analysis({ suggestions: [calorie, cardio] }));
    renderIt();
    expect(await screen.findByText('Raise calories')).toBeTruthy();
    expect(screen.getByText('Add cardio')).toBeTruthy();
    expect(screen.getAllByText('Accept')).toHaveLength(1);
    expect(screen.getAllByText('Not now')).toHaveLength(2);
    expect(screen.getByText('because numbers')).toBeTruthy();
  });

  it('Accept saves the suggestion and reloads', async () => {
    vi.mocked(analyzeWeight).mockReturnValue(analysis({ suggestions: [calorie] }));
    renderIt();
    fireEvent.click(await screen.findByText('Accept'));
    await waitFor(() => expect(api.acceptCalorieSuggestion).toHaveBeenCalledWith(profile, calorie));
    await waitFor(() => expect(api.loadAnalysisData).toHaveBeenCalledTimes(2));
  });

  it('Not now snoozes that kind and reloads', async () => {
    vi.mocked(analyzeWeight).mockReturnValue(analysis({ suggestions: [calorie] }));
    renderIt();
    fireEvent.click(await screen.findByText('Not now'));
    await waitFor(() => expect(api.snoozeSuggestion).toHaveBeenCalledWith('calorie', TODAY));
    await waitFor(() => expect(api.loadAnalysisData).toHaveBeenCalledTimes(2));
  });

  it('links back to Today', async () => {
    renderIt();
    await screen.findByRole('img');
    fireEvent.click(screen.getAllByRole('link', { name: 'Today' })[0]);
    expect(await screen.findByText('TODAY PAGE')).toBeTruthy();
  });
});

describe('/progress through App routing', () => {
  it('renders the lazy screen', async () => {
    render(
      <MemoryRouter initialEntries={['/progress']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Progress' })).toBeTruthy();
    expect(await screen.findByRole('img')).toBeTruthy();
  });
});

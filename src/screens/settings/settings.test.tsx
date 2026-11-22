// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(async (p: unknown) => ({ userId: 'u', ...(p as object) })),
  addWeight: vi.fn(async (_d: string, _kg: number) => {}),
  getLatestWeight: vi.fn(async (_d: string) => null as number | null),
  listSuggestionRecords: vi.fn(async () => null as unknown[] | null),
}));
vi.mock('../../data/api', () => api);
vi.mock('../../data/auth', () => ({ signOut: vi.fn(async () => {}) }));

import SettingsScreen from './index';

const setup = () =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/" element={<p>HOME</p>} />
      </Routes>
    </MemoryRouter>,
  );

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const profile = {
  userId: 'u', birthMonth: 3, birthYear: 1985, sex: 'male', heightCm: 177.8, goal: 'maintain', everydayActivity: 'sedentary',
  units: 'imperial', timezone: 'America/New_York',
  overrideKcalAdjustPct: null, overrideProteinGPerLb: null, overrideFatPct: 35, overrideWaterBaseMlPerKg: null,
};

beforeEach(() => {
  api.getProfile.mockResolvedValue(null);
  api.getLatestWeight.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function fillFirstRun(weight: string) {
  await screen.findByText('Set up your profile');
  type('Birth month', '3');
  type('Birth year', '1985');
  type('Height (ft)', '5');
  type('Height (in)', '10');
  if (weight) type(/Current weight/, weight);
}

describe('SettingsScreen', () => {
  it('first run blocks save without weight and keeps typed input', async () => {
    setup();
    await fillFirstRun('');
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByText('Enter your current weight.')).toBeTruthy();
    expect(api.saveProfile).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Birth year') as HTMLInputElement).value).toBe('1985');
  });

  it('saves imperial input as metric and navigates home', async () => {
    setup();
    await fillFirstRun('180');
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await screen.findByText('HOME');
    const saved = api.saveProfile.mock.calls[0][0] as { heightCm: number; units: string };
    expect(saved.units).toBe('imperial');
    expect(saved.heightCm).toBeCloseTo(177.8, 1);
    const [date, kg] = api.addWeight.mock.calls[0];
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(kg).toBeCloseTo(81.65, 1);
  });

  it('saves the chosen everyday activity', async () => {
    api.getProfile.mockResolvedValue(profile);
    api.getLatestWeight.mockResolvedValue(81.65);
    setup();
    await screen.findByText('Your profile');
    type('Everyday activity', 'moderate');
    expect((screen.getByLabelText('Everyday activity') as HTMLSelectElement).selectedOptions[0].textContent).toBe('On your feet part of the day');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved');
    expect(api.saveProfile.mock.calls[0][0]).toMatchObject({ everydayActivity: 'moderate' });
  });

  it('preselects an existing active profile', async () => {
    api.getProfile.mockResolvedValue({ ...profile, everydayActivity: 'active' });
    api.getLatestWeight.mockResolvedValue(81.65);
    setup();
    await screen.findByText('Your profile');
    expect((screen.getByLabelText('Everyday activity') as HTMLSelectElement).value).toBe('active');
  });

  it('reset to default sends null for an override and skips unchanged weight', async () => {
    api.getProfile.mockResolvedValue(profile);
    api.getLatestWeight.mockResolvedValue(81.65);
    setup();
    await screen.findByText('Your profile');
    expect((screen.getByLabelText('Fat (% of calories)') as HTMLInputElement).value).toBe('35');
    fireEvent.click(screen.getByRole('button', { name: 'Reset fat to default' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved');
    expect(api.saveProfile.mock.calls[0][0]).toMatchObject({ overrideFatPct: null });
    expect(api.addWeight).not.toHaveBeenCalled();
  });

  it('toggling units converts displayed values', async () => {
    api.getProfile.mockResolvedValue(profile);
    api.getLatestWeight.mockResolvedValue(81.65);
    setup();
    await screen.findByText('Your profile');
    expect((screen.getByLabelText('Current weight (lb)') as HTMLInputElement).value).toBe('180');
    fireEvent.click(screen.getByRole('button', { name: /Metric/ }));
    expect((screen.getByLabelText('Current weight (kg)') as HTMLInputElement).value).toBe('81.6');
    expect((screen.getByLabelText('Height (cm)') as HTMLInputElement).value).toBe('177.8');
  });

  const rec = (over: object) => ({
    id: 'r', kind: 'calorie', action: 'accepted', snoozeUntil: null, oldAdjustPct: -20, newAdjustPct: -15,
    oldKcal: 2000, newKcal: 2200, reason: 'x', createdAt: '2026-11-10T15:00:00Z', ...over,
  });

  it('notes a suggestion-set calorie adjustment when it matches the override', async () => {
    api.getProfile.mockResolvedValue({ ...profile, overrideKcalAdjustPct: -15 });
    api.listSuggestionRecords.mockResolvedValue([rec({})]);
    setup();
    expect(await screen.findByText('Set from a suggestion on Nov 10')).toBeTruthy();
  });

  it('shows no note when the override differs or records are unavailable', async () => {
    api.getProfile.mockResolvedValue({ ...profile, overrideKcalAdjustPct: -12 });
    api.listSuggestionRecords.mockResolvedValue([rec({})]);
    setup();
    await screen.findByText('Your profile');
    expect(screen.queryByText(/Set from a suggestion/)).toBeNull();
    cleanup();
    api.getProfile.mockResolvedValue({ ...profile, overrideKcalAdjustPct: -15 });
    api.listSuggestionRecords.mockResolvedValue(null);
    setup();
    await screen.findByText('Your profile');
    expect(screen.queryByText(/Set from a suggestion/)).toBeNull();
  });
});

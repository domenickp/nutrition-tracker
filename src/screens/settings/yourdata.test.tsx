// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DRAFT_KEY } from '../../lib/workoutSession';

const calls = vi.hoisted(() => [] as string[]);
const api = vi.hoisted(() => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  addWeight: vi.fn(),
  getLatestWeight: vi.fn(async (_d: string) => null as number | null),
  listSuggestionRecords: vi.fn(async () => null as unknown[] | null),
  exportMyData: vi.fn(),
  accountIsEmpty: vi.fn(),
  purgeMyData: vi.fn(),
  importMyData: vi.fn(),
}));
const download = vi.hoisted(() => ({ saveJsonFile: vi.fn() }));
vi.mock('../../data/api', () => api);
vi.mock('../../data/auth', () => ({ signOut: vi.fn(async () => {}) }));
vi.mock('./download', () => download);

import SettingsScreen from './index';

const setup = () =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
    </MemoryRouter>,
  );

const emptyTables = () => ({
  profiles: [], weights: [], foods: [], food_logs: [], water_logs: [],
  daily_activity: [], workouts: [], exercise_categories: [], target_suggestions: [],
});

const MESSAGE =
  "All your data has been deleted. Your account is still active, so you can start using the app again at any time without asking anyone. Keeping the account doesn't keep any data. If you'd like your account removed as well, ask Domenick.";

function chooseFile(text: string) {
  const file = new File([text], 'b.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => text });
  fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } });
}

beforeEach(() => {
  calls.length = 0;
  api.getProfile.mockResolvedValue(null);
  api.exportMyData.mockImplementation(async () => {
    calls.push('export');
    return { ...emptyTables(), foods: [{ id: 'f1', user_id: 'u', name: 'Egg' }] };
  });
  download.saveJsonFile.mockImplementation(() => {
    calls.push('save');
  });
  api.purgeMyData.mockImplementation(async () => {
    calls.push('purge');
  });
  api.accountIsEmpty.mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Your data', () => {
  it('renders on first-run settings and downloads a named backup', async () => {
    setup();
    await screen.findByText('Set up your profile');
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await waitFor(() => expect(download.saveJsonFile).toHaveBeenCalled());
    const [name, data] = download.saveJsonFile.mock.calls[0];
    expect(name).toMatch(/^nutrition-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(data.app).toBe('nutrition-tracker');
    expect(data.tables.foods[0]).toEqual({ id: 'f1', name: 'Egg' });
  });

  it('gates Delete on exactly DELETE, then exports, saves, purges in order', async () => {
    localStorage.setItem(DRAFT_KEY, 'x');
    setup();
    await screen.findByText('Your data');
    const btn = screen.getByRole('button', { name: 'Delete all my data' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'delete' } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(await screen.findByText(MESSAGE)).toBeTruthy();
    expect(calls).toEqual(['export', 'save', 'purge']);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    const before = api.getProfile.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(api.getProfile.mock.calls.length).toBeGreaterThan(before));
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });

  it('does not purge when the export fails', async () => {
    api.exportMyData.mockRejectedValue(new Error('export broke'));
    setup();
    await screen.findByText('Your data');
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete all my data' }));
    expect((await screen.findByText('export broke')).getAttribute('role')).toBe('alert');
    expect(api.purgeMyData).not.toHaveBeenCalled();
  });

  it('disables Import with an explanation when the account is not empty', async () => {
    api.accountIsEmpty.mockResolvedValue(false);
    setup();
    expect(await screen.findByText('Import only works on an empty account. Delete your data first.')).toBeTruthy();
    expect(screen.queryByLabelText('Backup file')).toBeNull();
  });

  it('shows parse errors for a bad file', async () => {
    setup();
    await screen.findByText('Your data');
    await waitFor(() => expect((screen.getByLabelText('Backup file') as HTMLInputElement).disabled).toBe(false));
    chooseFile('not json');
    expect(await screen.findByText('This file is not valid JSON.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
  });

  it('shows counts for a good file and imports prepared rows', async () => {
    api.importMyData.mockResolvedValue(3);
    setup();
    await screen.findByText('Your data');
    await waitFor(() => expect((screen.getByLabelText('Backup file') as HTMLInputElement).disabled).toBe(false));
    chooseFile(
      JSON.stringify({
        app: 'nutrition-tracker', version: 1, exportedAt: 'x',
        tables: { foods: [{ id: 'f1', user_id: 'u', name: 'Egg' }], food_logs: [{ id: 'l1', food_id: 'f1', user_id: 'u' }, { id: 'l2', food_id: null }] },
      }),
    );
    expect(await screen.findByText('food logs: 2')).toBeTruthy();
    expect(screen.getByText('foods: 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Imported 3 items.')).toBeTruthy();
    const rows = api.importMyData.mock.calls[0][0];
    expect(rows.foods[0].user_id).toBeUndefined();
    expect(rows.foods[0].id).not.toBe('f1');
    expect(rows.food_logs[0].food_id).toBe(rows.foods[0].id);
    await waitFor(() => expect(api.getProfile).toHaveBeenCalledTimes(2));
  });
});

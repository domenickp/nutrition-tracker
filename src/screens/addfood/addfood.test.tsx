// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '../../lib/types';

vi.mock('../../data/api', () => ({
  getProfile: vi.fn(),
  listFoods: vi.fn(),
  searchUsda: vi.fn(),
  getUsdaFood: vi.fn(),
  saveFood: vi.fn(),
  addFoodLog: vi.fn(),
  updateFood: vi.fn(),
}));
import * as api from '../../data/api';
import AddFoodScreen from './index';

const n = (kcal: number) => ({ kcal, proteinG: 1, carbsG: 20, fatG: 0.3, waterMl: 0 });
const banana: Food = {
  id: 'f1', name: 'Banana', brand: null, source: 'usda', fdcId: 111, baseLabel: '100 g', baseGrams: 100,
  nutrients: n(89), portions: [{ label: '1 cup', grams: 240 }], lastUsedAt: null,
};
const usdaApple = { ...banana, id: undefined, name: 'Apple', fdcId: 222, dataType: 'Foundation', nutrients: n(52) };

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/day/2026-11-16/add']}>
      <Routes>
        <Route path="/day/:date/add" element={<AddFoodScreen />} />
        <Route path="/day/:date" element={<p>TODAY</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api.getProfile).mockResolvedValue({ units: 'metric' } as never);
  vi.mocked(api.listFoods).mockResolvedValue([banana]);
  vi.mocked(api.searchUsda).mockResolvedValue([usdaApple as never, { ...usdaApple, fdcId: 111, name: 'Dup' } as never]);
  vi.mocked(api.getUsdaFood).mockResolvedValue(usdaApple as never);
  vi.mocked(api.saveFood).mockImplementation(async (f) => ({ ...f, id: 'new', lastUsedAt: null }) as Food);
  vi.mocked(api.addFoodLog).mockResolvedValue({} as never);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(450); });

describe('AddFoodScreen', () => {
  it('shows saved foods before debounced USDA results and hides duplicates', async () => {
    renderScreen();
    await flush();
    fireEvent.change(screen.getByLabelText('Search foods'), { target: { value: 'app' } });
    await flush();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf('Your foods')).toBeLessThan(headings.indexOf('USDA results'));
    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.queryByText('Dup')).toBeNull();
  });

  it('selecting a USDA result gets detail, saves, then shows amount step', async () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText('Search foods'), { target: { value: 'app' } });
    await flush();
    fireEvent.click(screen.getByText('Apple'));
    await flush();
    expect(api.getUsdaFood).toHaveBeenCalledWith(222);
    expect(api.saveFood).toHaveBeenCalledWith(usdaApple);
    expect(screen.getByLabelText('Amount')).toBeTruthy();
  });

  it('logs 1 cup (240 g) of an 89 kcal/100 g food as 213.6 kcal', async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText('Banana'));
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'portion:1 cup' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } });
    expect(screen.getByTestId('preview').textContent).toContain('213.6 kcal');
    fireEvent.click(screen.getByText('Log it'));
    await flush();
    expect(api.addFoodLog).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-11-16', foodId: 'f1', quantity: 1, unitLabel: '1 cup', grams: 240,
      totals: expect.objectContaining({ kcal: 213.6 }),
    }));
    expect(screen.getByText('TODAY')).toBeTruthy();
  });

  it('manual form blocks negatives and saves a manual food', async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText('Enter manually'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bar' } });
    fireEvent.change(screen.getByLabelText('Serving'), { target: { value: '1 bar' } });
    fireEvent.change(screen.getByLabelText('Calories (kcal)'), { target: { value: '-5' } });
    fireEvent.change(screen.getByLabelText('Protein (g)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Carbs (g)'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Fat (g)'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Save food'));
    await flush();
    expect(api.saveFood).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a number, 0 or more')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Calories (kcal)'), { target: { value: '200' } });
    fireEvent.click(screen.getByText('Save food'));
    await flush();
    expect(api.saveFood).toHaveBeenCalledWith(expect.objectContaining({
      source: 'manual', fdcId: null, name: 'Bar', baseLabel: '1 bar', baseGrams: null,
      nutrients: { kcal: 200, proteinG: 10, carbsG: 20, fatG: 5, waterMl: 0 },
    }));
    expect(screen.getByLabelText('Amount')).toBeTruthy();
  });

  it('logs tbsp of a food with a cup portion, showing total grams', async () => {
    const f: Food = { ...banana, portions: [{ label: '1 cup, sliced', grams: 150 }] };
    vi.mocked(api.listFoods).mockResolvedValue([f]);
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText('Banana'));
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'volume:tbsp' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2' } });
    expect(screen.getByTestId('preview').textContent).toContain('16.7 kcal');
    expect(screen.getByTestId('preview').textContent).toContain('= 18.8 g');
    fireEvent.click(screen.getByText('Log it'));
    await flush();
    expect(api.addFoodLog).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2, unitLabel: 'tbsp', grams: 18.8 }));
  });

  it('shows total grams for servings', async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText('Banana'));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2' } });
    expect(screen.getByTestId('preview').textContent).toContain('= 200 g');
  });

  it('keeps the physical amount when switching units', async () => {
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText('Banana'));
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'grams' } });
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('100');
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'volume:cup' } });
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('0.417');
  });

  it('adds a measure to a food and selects the cup option', async () => {
    const plain: Food = { ...banana, portions: [] };
    vi.mocked(api.listFoods).mockResolvedValue([plain]);
    vi.mocked(api.updateFood).mockImplementation(async (id, f) => ({ ...f, id, lastUsedAt: null }) as Food);
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText('Banana'));
    expect(screen.queryByRole('option', { name: 'cup' })).toBeNull();
    fireEvent.click(screen.getByText('Add a measure'));
    fireEvent.change(screen.getByLabelText('Measure grams'), { target: { value: '140' } });
    fireEvent.click(screen.getByText('Save measure'));
    await flush();
    const { id: _i, lastUsedAt: _l, ...rest } = plain;
    expect(api.updateFood).toHaveBeenCalledWith('f1', { ...rest, portions: [{ label: '1 cup', grams: 140 }] });
    expect(screen.getByRole('option', { name: 'cup' })).toBeTruthy();
    expect((screen.getByLabelText('Unit') as HTMLSelectElement).value).toBe('volume:cup');
    expect(screen.getByText('from 1 cup = 140 g')).toBeTruthy();
  });

  it('explains when a food has no grams or volume base', async () => {
    vi.mocked(api.listFoods).mockResolvedValue([{ ...banana, baseLabel: '1 bar', baseGrams: null, portions: [] }]);
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText('Banana'));
    expect(screen.getByText('Add grams per serving to this food to use cups and spoons')).toBeTruthy();
    expect(screen.queryByText('Add a measure')).toBeNull();
  });

  it('shows total ml for a drink measured in cups', async () => {
    vi.mocked(api.listFoods).mockResolvedValue([{ ...banana, name: 'Cola', baseLabel: '355 ml', baseGrams: null, portions: [] }]);
    renderScreen();
    await flush();
    fireEvent.click(screen.getByText('Cola'));
    expect(screen.getByTestId('preview').textContent).toContain('= 355 ml');
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'volume:cup' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } });
    expect(screen.getByTestId('preview').textContent).toContain('= 236.6 ml');
  });
});

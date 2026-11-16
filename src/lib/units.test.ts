import { describe, expect, it } from 'vitest';
import {
  cmToIn, flOzToMl, formatVolume, formatWeight, inToCm, kgToLb, lbToKg, mlToFlOz,
} from './units';

describe('conversions', () => {
  it('round-trips', () => {
    expect(lbToKg(kgToLb(81.8))).toBeCloseTo(81.8, 9);
    expect(inToCm(cmToIn(178))).toBeCloseTo(178, 9);
    expect(flOzToMl(mlToFlOz(1893))).toBeCloseTo(1893, 9);
  });
  it('known values', () => {
    expect(kgToLb(1)).toBeCloseTo(2.20462);
    expect(cmToIn(2.54)).toBeCloseTo(1);
    expect(mlToFlOz(29.5735)).toBeCloseTo(1);
  });
});

describe('formatting', () => {
  it('weight', () => {
    expect(formatWeight(lbToKg(180.4), 'imperial')).toBe('180.4 lb');
    expect(formatWeight(81.8, 'metric')).toBe('81.8 kg');
  });
  it('volume', () => {
    expect(formatVolume(flOzToMl(64), 'imperial')).toBe('64 fl oz');
    expect(formatVolume(500, 'metric')).toBe('500 ml');
    expect(formatVolume(1900, 'metric')).toBe('1.9 L');
    expect(formatVolume(1000, 'metric')).toBe('1.0 L');
  });
});

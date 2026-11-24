import type { EverydayActivity } from './types';

/** Labels for the everyday activity levels (Settings, Today, Activity). */
export const EVERYDAY_LABEL: Record<EverydayActivity, string> = {
  sedentary: 'Mostly sitting',
  moderate: 'On your feet part of the day',
  active: 'On your feet most of the day / physical job',
};

export const EVERYDAY_LEVELS: EverydayActivity[] = ['sedentary', 'moderate', 'active'];

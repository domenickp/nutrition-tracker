// TEMPORARY STUB (nt-b2i.1). The "data" task replaces this whole file with the full §5 API.
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    userId: data.user_id,
    birthMonth: data.birth_month,
    birthYear: data.birth_year,
    sex: data.sex,
    heightCm: data.height_cm,
    goal: data.goal,
    units: data.units,
    timezone: data.timezone,
    overrideKcalAdjustPct: data.override_kcal_adjust_pct,
    overrideProteinGPerLb: data.override_protein_g_per_lb,
    overrideFatPct: data.override_fat_pct,
    overrideWaterBaseMlPerKg: data.override_water_base_ml_per_kg,
  };
}

import { addDays, localDate } from './dates';
import { computeTargets, KCAL_ADJUST_PCT, MET } from './targets';
import type { AnalysisDay, Profile, SuggestionKind, SuggestionRecord, WeighIn } from './types';
import { formatWeight, kgToLb } from './units';
import {
  AIM_PCT_PER_WEEK,
  classifyRate,
  KCAL_PER_LB,
  WINDOW_DAYS,
  weeklyRate,
  weightTrend,
  type Rate,
  type RateStatus,
  type TrendPoint,
} from './weightTrend';

export interface Suggestion {
  kind: SuggestionKind;
  title: string;
  reason: string;
  oldAdjustPct: number;
  oldKcal: number;
  newAdjustPct: number | null;
  newKcal: number | null;
}
export interface WeightAnalysis {
  status: 'collecting' | RateStatus;
  missing: string[];
  window: {
    from: string;
    to: string;
    days: number;
    loggedDays: number;
    weighedDays: number;
    lowLogDays: number;
  };
  trend: TrendPoint[];
  rate: Rate | null;
  avgIntakeKcal: number | null;
  avgEstimatedBurn: number | null;
  impliedBurn: number | null;
  avgProteinG: number | null;
  proteinTargetG: number | null;
  suggestions: Suggestion[];
}

const MIN_DAYS = 14;
const MIN_WEIGHED_SHARE = 0.6;
const MIN_LOGGED_SHARE = 0.8;
const LOW_LOG_SHARE = 0.5;
const LOW_LOG_LIMIT = 3;
const MAX_RATIO = 1.1;
const MIN_RATIO = 0.9;
const MIN_CHANGE = 0.03;
const PROTEIN_SHARE = 0.9;
const LIFTING_WINDOW_DAYS = 14;
const LIFTING_MIN_SESSIONS = 4; // fewer than 2 a week
const COOLDOWN_DAYS = 7;
const EPS = 1e-9;

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
const round = (n: number | null): number | null => (n === null ? null : Math.round(n));

function countDates(from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) n++;
  return n;
}

function rateSentence(rate: Rate, units: Profile['units']): string {
  const dir = rate.kgPerWeek < 0 ? 'losing' : 'gaining';
  return `Your trend weight is ${dir} ${formatWeight(Math.abs(rate.kgPerWeek), units)} a week (${Math.abs(rate.pctPerWeek).toFixed(2)}% of body weight).`;
}

export function analyzeWeight(input: {
  profile: Profile;
  today: string;
  weighIns: WeighIn[];
  days: AnalysisDay[];
  records: SuggestionRecord[] | null;
}): WeightAnalysis {
  const { profile, today, weighIns, days, records } = input;
  const to = addDays(today, -1);
  const trend = weightTrend(weighIns, addDays(today, -55), today);

  // Window: 21 days ending yesterday, clipped to the first weigh-in or logged day.
  const earliest = addDays(today, -WINDOW_DAYS);
  const dated = [
    ...weighIns.map((w) => w.date),
    ...days.filter((d) => d.intakeKcal !== null).map((d) => d.date),
  ].sort();
  const from = dated.length ? (dated[0] > earliest ? dated[0] : earliest) : today;
  const winDays = days.filter((d) => d.date >= from && d.date <= to);
  const length = from > to ? 0 : countDates(from, to);

  const weighedSet = new Set(weighIns.map((w) => w.date));
  const weighedDays = winDays.filter((d) => weighedSet.has(d.date)).length;
  const loggedDays = winDays.filter((d) => d.intakeKcal !== null).length;

  const points = length > 0 ? weightTrend(weighIns, from, to) : [];
  const trendByDate = new Map(points.map((p) => [p.date, p.trendKg]));
  const rate = weeklyRate(points);

  // Per-day estimated burn and targets, at that day's trend weight.
  const burns: number[] = [];
  const proteinTargets: number[] = [];
  let lowLogDays = 0;
  for (const d of winDays) {
    const weightKg = trendByDate.get(d.date);
    if (weightKg === undefined) continue;
    const r = computeTargets({ profile, weightKg, date: d.date, activity: d.activity, workouts: d.workouts });
    burns.push(r.burn);
    proteinTargets.push(r.targets.proteinG);
    if (d.intakeKcal !== null && d.intakeKcal < LOW_LOG_SHARE * r.targets.kcal) lowLogDays++;
  }
  const avgIntake = mean(winDays.filter((d) => d.intakeKcal !== null).map((d) => d.intakeKcal as number));
  const avgProtein = mean(winDays.filter((d) => d.proteinG !== null).map((d) => d.proteinG as number));
  const avgBurn = mean(burns);
  const proteinTarget = mean(proteinTargets);
  const changeKg = points.length >= 2 ? points[points.length - 1].trendKg - points[0].trendKg : null;
  const impliedBurn =
    avgIntake !== null && changeKg !== null && length > 0
      ? avgIntake - (kgToLb(changeKg) * KCAL_PER_LB) / length
      : null;

  const missing: string[] = [];
  if (length < MIN_DAYS) missing.push(`${MIN_DAYS - length} more days`);
  if (length === 0 || weighedDays < MIN_WEIGHED_SHARE * length) missing.push('weigh in more often');
  if (length === 0 || loggedDays < MIN_LOGGED_SHARE * length) missing.push('log food more often');
  const collecting = missing.length > 0 || rate === null;

  const out: WeightAnalysis = {
    status: collecting ? 'collecting' : classifyRate(profile.goal, rate.pctPerWeek),
    missing,
    window: { from, to, days: length, loggedDays, weighedDays, lowLogDays },
    trend,
    rate,
    avgIntakeKcal: round(avgIntake),
    avgEstimatedBurn: round(avgBurn),
    impliedBurn: round(impliedBurn),
    avgProteinG: round(avgProtein),
    proteinTargetG: round(proteinTarget),
    suggestions: [],
  };
  if (collecting || records === null || avgBurn === null) return out;

  const units = profile.units;
  const status = out.status as RateStatus;
  const lastTrendKg = points[points.length - 1].trendKg;
  const oldAdjust = profile.overrideKcalAdjustPct ?? KCAL_ADJUST_PCT[profile.goal];
  const oldKcal = Math.round(avgBurn * (1 + oldAdjust / 100));
  const base = { oldAdjustPct: oldAdjust, oldKcal, newAdjustPct: null, newKcal: null };
  const rateText = rateSentence(rate, units);
  const found: Suggestion[] = [];

  if (lowLogDays >= LOW_LOG_LIMIT) {
    found.push({
      ...base,
      kind: 'logging',
      title: 'Log your meals more completely',
      reason: `${lowLogDays} of the last ${length} days were logged at under half your target, so food may be missing from the log. Targets are not changed until logging is complete.`,
    });
  } else {
    const needUp = status === 'below';
    const needDown = status === 'above';

    if ((needUp || needDown) && avgIntake !== null && impliedBurn !== null) {
      const aimedIntake =
        impliedBurn + (kgToLb((AIM_PCT_PER_WEEK[profile.goal] * lastTrendKg) / 100) * KCAL_PER_LB) / 7;
      const oldFactor = 1 + oldAdjust / 100;
      let newAdjust = Math.round((aimedIntake / avgBurn - 1) * 100);
      const ratio = () => (1 + newAdjust / 100) / oldFactor;
      while (ratio() > MAX_RATIO + EPS) newAdjust--;
      while (ratio() < MIN_RATIO - EPS) newAdjust++;
      const r = ratio();
      const bigEnough = r >= 1 + MIN_CHANGE - EPS || r <= 1 - MIN_CHANGE + EPS;
      if (bigEnough && ((needUp && r > 1) || (needDown && r < 1))) {
        const newKcal = Math.round(avgBurn * (1 + newAdjust / 100));
        found.push({
          ...base,
          kind: 'calorie',
          title: needUp
            ? `Eat about ${newKcal - oldKcal} kcal more a day`
            : `Eat about ${oldKcal - newKcal} kcal less a day`,
          reason:
            `${rateText} Over the last ${length} days you averaged ${Math.round(avgIntake)} kcal a day, ` +
            `which implies you burn about ${Math.round(impliedBurn)} kcal a day (the estimate is ${Math.round(avgBurn)}). ` +
            `Moving the calorie adjustment from ${oldAdjust}% to ${newAdjust}% changes the target from ${oldKcal} to ${newKcal} kcal.`,
          newAdjustPct: newAdjust,
          newKcal,
        });
      }
    }

    if (
      profile.goal === 'lose_fat' &&
      needUp &&
      avgProtein !== null &&
      proteinTarget !== null &&
      avgProtein < PROTEIN_SHARE * proteinTarget
    ) {
      found.push({
        ...base,
        kind: 'protein',
        title: 'Raise protein to keep muscle',
        reason: `You are losing faster than planned and averaged ${Math.round(avgProtein)} g of protein against a ${Math.round(proteinTarget)} g target. Hitting the protein target helps keep muscle while you lose fat.`,
      });
    }

    if (profile.goal === 'lose_fat' && needDown) {
      const kcalEach = Math.round(((MET.strenuous - 1) * lastTrendKg * 0.5) / 10) * 10;
      found.push({
        ...base,
        kind: 'cardio',
        title: 'Or add 1-2 cardio sessions a week',
        reason: `${rateText} Instead of eating less, a 30 minute hard cardio session burns about ${kcalEach} kcal at your current weight.`,
      });
    }

    if (profile.goal === 'build_muscle') {
      const recentFrom = addDays(to, -(LIFTING_WINDOW_DAYS - 1));
      let sessions = 0;
      for (const d of winDays) {
        if (d.date < recentFrom) continue;
        sessions += d.workouts.filter((w) => w.liftingH > 0).length;
        if (d.activity?.mode === 'hours' && d.activity.hours.liftingH >= 0.5) sessions++;
      }
      if (sessions < LIFTING_MIN_SESSIONS) {
        found.push({
          ...base,
          kind: 'lifting',
          title: 'Add lifting: gaining without lifting is mostly fat',
          reason: `You logged ${sessions} lifting session${sessions === 1 ? '' : 's'} in the last ${LIFTING_WINDOW_DAYS} days. Aim for at least 2 a week so the weight you gain is muscle.`,
        });
      }
    }
  }

  const hidden = new Set<SuggestionKind>();
  const cooldownFrom = addDays(today, -(COOLDOWN_DAYS - 1));
  for (const r of records) {
    if (r.action === 'snoozed' && r.snoozeUntil !== null && r.snoozeUntil >= today) hidden.add(r.kind);
    if (r.action === 'accepted' && r.kind === 'calorie') {
      const d = localDate(r.createdAt, profile.timezone);
      if (d >= cooldownFrom && d <= today) hidden.add('calorie');
    }
  }
  out.suggestions = found.filter((s) => !hidden.has(s.kind));
  return out;
}

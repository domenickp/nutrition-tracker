import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Layout, Spinner, SuggestionCard } from '../../components';
import {
  acceptCalorieSuggestion,
  getProfile,
  listSuggestionRecords,
  loadAnalysisData,
  snoozeSuggestion,
} from '../../data/api';
import { localDate, todayIn } from '../../lib/dates';
import type { Goal, Profile, SuggestionRecord, Units } from '../../lib/types';
import { formatWeight, kgToLb } from '../../lib/units';
import { analyzeWeight, type Suggestion, type WeightAnalysis } from '../../lib/weightAnalysis';
import { WeightChart } from './WeightChart';
import './progress.css';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const n0 = (n: number | null) => (n === null ? '—' : Math.round(n).toLocaleString('en-US'));
const kcal = (n: number | null) => (n === null ? '—' : `${n0(n)} kcal/day`);
const grams = (n: number | null) => (n === null ? '—' : `${n0(n)} g`);

function signedRate(kgPerWeek: number, units: Units): string {
  const v = units === 'imperial' ? kgToLb(kgPerWeek) : kgPerWeek;
  const rounded = Math.round(v * 10) / 10;
  const sign = rounded < 0 ? '−' : rounded > 0 ? '+' : '';
  return `${sign}${Math.abs(rounded).toFixed(1)} ${units === 'imperial' ? 'lb' : 'kg'}/wk`;
}

function statusPhrase(a: WeightAnalysis, goal: Goal): string {
  const gaining = (a.rate?.kgPerWeek ?? 0) > 0;
  switch (a.status) {
    case 'collecting':
      return 'Still collecting data';
    case 'on_track':
      return 'On track';
    case 'slow':
      return 'A little slow';
    case 'below':
      if (goal === 'lose_fat') return 'Losing faster than your goal aims';
      if (goal === 'maintain') return 'Losing, which is below your goal of holding steady';
      return gaining ? 'Gaining slower than your goal aims' : 'Losing, but your goal is to gain';
    case 'above':
      if (goal === 'lose_fat') return gaining ? 'Gaining, but your goal is to lose' : 'Losing slower than your goal aims';
      if (goal === 'maintain') return 'Gaining, which is above your goal of holding steady';
      return 'Gaining faster than your goal aims';
  }
}

export default function ProgressScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [analysis, setAnalysis] = useState<WeightAnalysis | null>(null);
  const [records, setRecords] = useState<SuggestionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await getProfile();
      if (!p) throw new Error('No profile');
      const t = todayIn(p.timezone);
      const data = await loadAnalysisData(t);
      const recs = await listSuggestionRecords();
      setToday(t);
      setProfile(data.profile);
      setRecords(recs);
      setAnalysis(
        analyzeWeight({ profile: data.profile, today: t, weighIns: data.weighIns, days: data.days, records: recs }),
      );
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run a write, then reload. Errors are shown, never dropped. */
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const back = <Link to="/">Today</Link>;

  if (error && !analysis) {
    return (
      <Layout title="Progress" actions={back}>
        <p className="progress__error" role="alert">{error}</p>
      </Layout>
    );
  }
  if (!analysis || !profile || !today) {
    return (
      <Layout title="Progress" actions={back}>
        <Spinner />
      </Layout>
    );
  }

  const units = profile.units;
  const last = analysis.trend[analysis.trend.length - 1];
  const w = analysis.window;
  const history = (records ?? [])
    .filter((r) => r.kind === 'calorie' && r.action === 'accepted')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  const accept = (s: Suggestion) => run(() => acceptCalorieSuggestion(profile, s));
  const snooze = (s: Suggestion) =>
    run(async () => {
      if (!(await snoozeSuggestion(s.kind, today))) throw new Error('Could not snooze this suggestion.');
    });

  return (
    <Layout title="Progress" actions={back}>
      <div className="stack">
        {actionError && <p className="progress__error" role="alert">{actionError}</p>}
        {error && <p className="progress__error" role="alert">{error}</p>}

        <Card title="Weight">
          {last && (
            <p className="progress__status">
              <span className="num">
                Trend {formatWeight(last.trendKg, units)}
                {analysis.rate ? ` · ${signedRate(analysis.rate.kgPerWeek, units)}` : ''}
              </span>
            </p>
          )}
          <p className="muted">{statusPhrase(analysis, profile.goal)}</p>
          <WeightChart trend={analysis.trend} units={units} />
        </Card>

        <Card title="This window">
          <dl className="progress__stats num">
            <dt>Average intake</dt>
            <dd>{kcal(analysis.avgIntakeKcal)}</dd>
            <dt>Estimated burn</dt>
            <dd>{kcal(analysis.avgEstimatedBurn)}</dd>
            <dt>Implied burn</dt>
            <dd>{kcal(analysis.impliedBurn)}</dd>
            <dt>Protein (average vs target)</dt>
            <dd>
              {grams(analysis.avgProteinG)} vs {grams(analysis.proteinTargetG)}
            </dd>
          </dl>
          <p className="muted">
            {w.loggedDays} of {w.days} days logged, {w.weighedDays} weighed
          </p>
          {analysis.status === 'collecting' && (
            <p className="muted">Collecting data: {analysis.missing.join(', ')}</p>
          )}
        </Card>

        {records === null ? (
          <p className="muted">Suggestions unavailable until the database update is applied.</p>
        ) : (
          analysis.suggestions.map((s) => (
            <SuggestionCard
              key={s.kind}
              suggestion={s}
              onAccept={s.kind === 'calorie' ? () => void accept(s) : undefined}
              onSnooze={() => void snooze(s)}
              busy={busy}
            />
          ))
        )}

        <Card title="Accepted suggestions">
          {history.length === 0 ? (
            <p className="muted">No accepted suggestions yet.</p>
          ) : (
            <ul className="progress__history">
              {history.map((r) => (
                <li key={r.id}>
                  <div className="progress__history-head num">
                    <span>{localDate(r.createdAt, profile.timezone)}</span>
                    <span>
                      {n0(r.oldKcal)} → {n0(r.newKcal)} kcal
                    </span>
                  </div>
                  {r.reason && <p className="muted">{r.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Layout>
  );
}

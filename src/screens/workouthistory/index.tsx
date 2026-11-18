import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Layout, Spinner } from '../../components';
import { getProfile } from '../../data/api';
import { loadWorkoutData } from '../../data/workouts';
import { ROUTINE, routineDay } from '../../lib/routine';
import { formatSessionDate, type SessionSummary } from '../../lib/workoutSession';
import './workouthistory.css';

export default function WorkoutHistoryScreen() {
  const [recent, setRecent] = useState<SessionSummary[] | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setRecent(null);
    Promise.all([loadWorkoutData(), getProfile()])
      .then(([d, p]) => {
        setTz(p?.timezone);
        setRecent(d.recent);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load workouts'));
  }, []);
  useEffect(load, [load]);

  return (
    <Layout title="Workout history">
      <nav className="wh-links" aria-label="Workout links">
        <Link className="wh-link" to="/workout">‹ Back to workout</Link>
        <Link className="wh-link" to="/workout/import">Import from FatherWorkout</Link>
      </nav>
      {error && (
        <div>
          <p className="field__error" role="alert">{error}</p>
          <Button onClick={load}>Retry</Button>
        </div>
      )}
      {!recent && !error && <Spinner />}
      {recent && recent.length === 0 && (
        <p className="muted">
          No workouts yet. Log one on the Workout tab, or import your FatherWorkout sessions.
        </p>
      )}
      {recent && recent.length > 0 && (
        <ul className="wh-list">
          {recent.map((s) => {
            const areas = routineDay(ROUTINE, s.day)?.areas;
            return (
              <li key={s.id}>
                <Link className="wh-row" to={`/workout/history/${encodeURIComponent(s.id)}`}>
                  <span className="wh-row__date">
                    {formatSessionDate(s.startedAt, tz)}
                    {s.completedAt === null && <span className="wh-tag">unfinished</span>}
                  </span>
                  <span className="wh-row__meta">
                    {`Day ${s.day}${areas ? ' · ' + areas : ''} · ${s.setsDone} ${s.setsDone === 1 ? 'set' : 'sets'}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Layout>
  );
}

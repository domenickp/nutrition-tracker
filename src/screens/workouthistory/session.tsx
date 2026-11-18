import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Layout, Spinner } from '../../components';
import { getProfile } from '../../data/api';
import { getWorkoutSession } from '../../data/workouts';
import { ROUTINE, routineDay } from '../../lib/routine';
import {
  formatNum,
  formatSessionDate,
  type SessionSet,
  type WorkoutSession,
} from '../../lib/workoutSession';
import './workouthistory.css';

const has = (n: number | null | undefined): n is number => n !== null && n !== undefined;

function setText(s: SessionSet): string {
  const parts: string[] = [];
  if (has(s.reps)) parts.push(formatNum(s.reps) + (has(s.weightLb) ? ` × ${formatNum(s.weightLb)} lb` : ' reps'));
  else if (has(s.weightLb)) parts.push(`${formatNum(s.weightLb)} lb`);
  if (has(s.timeMin)) parts.push(`${formatNum(s.timeMin)} min`);
  if (has(s.timeSec)) parts.push(`${formatNum(s.timeSec)} s`);
  return parts.join(' · ') || '—';
}

export default function WorkoutSessionScreen() {
  const { id } = useParams();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSession(null);
    setError(null);
    Promise.all([getWorkoutSession(id ?? ''), getProfile()])
      .then(([s, p]) => {
        if (!live) return;
        setTz(p?.timezone);
        setSession(s);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load workout');
      });
    return () => { live = false; };
  }, [id]);

  const areas = session ? routineDay(ROUTINE, session.day)?.areas : undefined;
  const heading = session
    ? `${formatSessionDate(session.startedAt, tz)} · Day ${session.day}${areas ? ' · ' + areas : ''}`
    : 'Workout';

  return (
    <Layout title={heading}>
      <Link className="wh-link" to="/workout/history">‹ Back to history</Link>
      {error && <p className="field__error" role="alert">{error}</p>}
      {!session && !error && <Spinner />}
      {session && (
        <>
          {session.completedAt === null && <p className="muted">This session was not finished.</p>}
          {session.entries.map((e, i) => (
            <Card key={`${e.exerciseId}-${i}`} title={e.name}>
              <ul className="wh-sets">
                {e.sets.map((s, j) => (
                  <li key={j} className={s.done ? 'wh-set--done' : 'wh-set--todo'}>
                    {(s.done ? '✓ ' : '○ ') + setText(s)}
                  </li>
                ))}
              </ul>
              {e.notes && <p className="wh-note">{e.notes}</p>}
            </Card>
          ))}
          {session.notes && (
            <Card title="Session notes">
              <p className="wh-note">{session.notes}</p>
            </Card>
          )}
        </>
      )}
    </Layout>
  );
}

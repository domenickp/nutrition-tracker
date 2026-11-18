import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spinner } from './components';
import { getProfile } from './data/api';
import { useSession } from './data/auth';
import ActivityScreen from './screens/activity';
import AddFoodScreen from './screens/addfood';
import SettingsScreen from './screens/settings';
import SignInScreen from './screens/signin';
import TodayScreen from './screens/today';
import WorkoutScreen from './screens/workout';
import WorkoutHistoryScreen from './screens/workouthistory';
import WorkoutImportScreen from './screens/workouthistory/import';
import WorkoutSessionScreen from './screens/workouthistory/session';

/** Today's date in the browser's zone; only used to resolve the /activity nav link. */
function RedirectToActivityToday() {
  const today = new Intl.DateTimeFormat('en-CA').format(new Date());
  return <Navigate to={`/day/${today}/activity`} replace />;
}

type ProfileState = 'unknown' | 'missing' | 'present';

export default function App() {
  const { session, loading } = useSession();
  const { pathname } = useLocation();
  const [profile, setProfile] = useState<ProfileState>('unknown');
  const userId = session?.user.id ?? null;

  // Re-check the profile whenever the user or the route changes, so saving
  // a profile on /settings lets the owner move on.
  useEffect(() => {
    if (!userId) {
      setProfile('unknown');
      return;
    }
    let active = true;
    getProfile()
      .then((p) => active && setProfile(p ? 'present' : 'missing'))
      .catch(() => active && setProfile('present')); // don't trap the user on a transient error
    return () => {
      active = false;
    };
  }, [userId, pathname]);

  if (loading) return <Spinner />;

  if (!session) {
    if (pathname !== '/signin') return <Navigate to="/signin" replace />;
  } else {
    if (pathname === '/signin') return <Navigate to="/" replace />;
    if (profile === 'unknown') return <Spinner />;
    if (profile === 'missing' && pathname !== '/settings') return <Navigate to="/settings" replace />;
  }

  return (
    <Routes>
      <Route path="/signin" element={<SignInScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="/" element={<TodayScreen />} />
      <Route path="/day/:date" element={<TodayScreen />} />
      <Route path="/day/:date/add" element={<AddFoodScreen />} />
      <Route path="/day/:date/activity" element={<ActivityScreen />} />
      <Route path="/workout" element={<WorkoutScreen />} />
      <Route path="/workout/history" element={<WorkoutHistoryScreen />} />
      <Route path="/workout/history/:id" element={<WorkoutSessionScreen />} />
      <Route path="/workout/import" element={<WorkoutImportScreen />} />
      <Route path="/activity"element={<RedirectToActivityToday />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

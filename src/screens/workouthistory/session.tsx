import { useParams } from 'react-router-dom';
import { Layout } from '../../components';

export default function WorkoutSessionScreen() {
  const { id } = useParams();
  return (
    <Layout title="Workout">
      <p>Session {id}</p>
    </Layout>
  );
}

import { useParams } from 'react-router-dom';
import { Card, Layout } from '../../components';

/** Placeholder: replaced by the "addfood" screen task. */
export default function AddFoodScreen() {
  const params = useParams();
  return (
    <Layout title="Add food">
      <Card title="Add food">
        <p className="muted">Placeholder screen.</p>
        <pre className="num">{JSON.stringify(params)}</pre>
      </Card>
    </Layout>
  );
}

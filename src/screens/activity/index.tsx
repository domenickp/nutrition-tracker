import { useParams } from 'react-router-dom';
import { Card, Layout } from '../../components';

/** Placeholder: replaced by the "activity" screen task. */
export default function ActivityScreen() {
  const params = useParams();
  return (
    <Layout title="Activity">
      <Card title="Activity">
        <p className="muted">Placeholder screen.</p>
        <pre className="num">{JSON.stringify(params)}</pre>
      </Card>
    </Layout>
  );
}

import { useParams } from 'react-router-dom';
import { Card, Layout } from '../../components';

/** Placeholder: replaced by the "today" screen task. */
export default function TodayScreen() {
  const params = useParams();
  return (
    <Layout title="Today">
      <Card title="Today">
        <p className="muted">Placeholder screen.</p>
        <pre className="num">{JSON.stringify(params)}</pre>
      </Card>
    </Layout>
  );
}

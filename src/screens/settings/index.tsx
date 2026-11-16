import { useParams } from 'react-router-dom';
import { Card, Layout } from '../../components';

/** Placeholder: replaced by the "settings" screen task. */
export default function SettingsScreen() {
  const params = useParams();
  return (
    <Layout title="Settings">
      <Card title="Settings">
        <p className="muted">Placeholder screen.</p>
        <pre className="num">{JSON.stringify(params)}</pre>
      </Card>
    </Layout>
  );
}

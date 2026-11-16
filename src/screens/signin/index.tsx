import { useParams } from 'react-router-dom';
import { Card, Layout } from '../../components';

/** Placeholder: replaced by the "signin" screen task. */
export default function SignInScreen() {
  const params = useParams();
  return (
    <Layout title="Sign in">
      <Card title="Sign in">
        <p className="muted">Placeholder screen.</p>
        <pre className="num">{JSON.stringify(params)}</pre>
      </Card>
    </Layout>
  );
}

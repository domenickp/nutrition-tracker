import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Card, Field, Layout } from '../../components';
import { sendSignInEmail, verifyCode } from '../../data/auth';
import styles from './signin.module.css';

/** Supabase says this when shouldCreateUser is false and the address is unknown. */
export function friendlySignInError(message: string): string {
  if (/signups? (not allowed|(are |is )?disabled)|user not found|not allowed for this instance/i.test(message)) {
    return 'This app is invite-only, and that email address is not on the list. Check for typos, or ask the owner for an invite.';
  }
  return message;
}

export default function SignInScreen() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSendEmail(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await sendSignInEmail(trimmed);
      setEmail(trimmed);
      setStep('code');
    } catch (err) {
      setError(friendlySignInError(err instanceof Error ? err.message : 'Could not send the email.'));
    } finally {
      setPending(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await verifyCode(email, trimmed);
      // The app shell reacts to the new session and redirects.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not work.');
    } finally {
      setPending(false);
    }
  }

  function useDifferentEmail() {
    setStep('email');
    setCode('');
    setError(null);
  }

  return (
    <Layout title="Sign in">
      <Card>
        {step === 'email' ? (
          <form className={styles.form} onSubmit={onSendEmail} noValidate>
            <p className="muted">Enter your email and we will send you a sign-in code.</p>
            <Field
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
            />
            <Button type="submit" block disabled={pending}>
              {pending ? 'Sending…' : 'Email me a code'}
            </Button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={onVerify} noValidate>
            <p>We emailed you a 6-digit code (or tap the link in the email).</p>
            <p className="muted">Sent to {email}</p>
            <Field
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={error}
            />
            <Button type="submit" block disabled={pending}>
              {pending ? 'Checking…' : 'Sign in'}
            </Button>
            <Button variant="ghost" block disabled={pending} onClick={useDifferentEmail}>
              Use a different email
            </Button>
          </form>
        )}
      </Card>
    </Layout>
  );
}

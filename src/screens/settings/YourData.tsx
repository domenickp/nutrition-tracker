import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field } from '../../components';
import { accountIsEmpty, exportMyData, getProfile, importMyData, purgeMyData } from '../../data/api';
import { OWNER_NAME } from '../../lib/appInfo';
import { BACKUP_TABLES, backupFileName, buildBackup, countRows, parseBackup, prepareImport } from '../../lib/backup';
import type { BackupFile } from '../../lib/backup';
import { todayIn } from '../../lib/dates';
import { DRAFT_KEY } from '../../lib/workoutSession';
import { saveJsonFile } from './download';
import styles from './settings.module.css';

const TABLE_WORDS: Record<(typeof BACKUP_TABLES)[number], string> = {
  profiles: 'profile',
  weights: 'weights',
  foods: 'foods',
  food_logs: 'food logs',
  water_logs: 'water logs',
  daily_activity: 'daily activity',
  workouts: 'workouts',
  exercise_categories: 'exercise categories',
  target_suggestions: 'target suggestions',
};

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** Export everything and save it as a file. Throws on any failure. */
async function downloadBackup(): Promise<void> {
  const tables = await exportMyData();
  const profile = await getProfile();
  const date = todayIn(profile?.timezone ?? browserZone());
  saveJsonFile(backupFileName(date), buildBackup(tables, new Date().toISOString()));
}

export interface YourDataProps {
  /** Called after the delete message is dismissed or an import finished: re-check the profile. */
  onChanged: () => void;
}

export default function YourData({ onChanged }: YourDataProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [empty, setEmpty] = useState<boolean | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [backup, setBackup] = useState<BackupFile | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    accountIsEmpty().then(
      (v) => active && setEmpty(v),
      () => active && setEmpty(false),
    );
    return () => {
      active = false;
    };
  }, []);

  async function onDownload() {
    setError(null);
    setBusy(true);
    try {
      await downloadBackup();
    } catch (err) {
      setError(message(err, 'Could not download your backup.'));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setError(null);
    setBusy(true);
    try {
      await downloadBackup();
    } catch (err) {
      setError(message(err, 'Could not save a backup, so nothing was deleted.'));
      setBusy(false);
      return;
    }
    try {
      await purgeMyData();
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* storage unavailable */
      }
      setConfirmText('');
      setBackup(null);
      setImported(null);
      setEmpty(true);
      setDeleted(true);
    } catch (err) {
      setError(message(err, 'Could not delete your data.'));
    } finally {
      setBusy(false);
    }
  }

  function onOk() {
    setDeleted(false);
    navigate('/settings', { replace: true });
    onChanged();
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    setImported(null);
    setBackup(null);
    setParseErrors([]);
    if (!file) return;
    try {
      const result = parseBackup(await file.text());
      if (result.ok) setBackup(result.backup);
      else setParseErrors(result.errors);
    } catch (err) {
      setError(message(err, 'Could not read that file.'));
    }
  }

  async function onImport() {
    if (!backup) return;
    setError(null);
    setBusy(true);
    try {
      const n = await importMyData(prepareImport(backup, () => crypto.randomUUID(), new Date().toISOString()));
      setImported(n);
      setBackup(null);
      setEmpty(false);
      navigate('/settings', { replace: true });
      onChanged();
    } catch (err) {
      setError(message(err, 'Could not import your backup.'));
    } finally {
      setBusy(false);
    }
  }

  const counts = backup ? countRows(backup) : null;
  const summary = counts
    ? BACKUP_TABLES.filter((t) => counts[t] > 0).map((t) => `${TABLE_WORDS[t]}: ${counts[t]}`)
    : [];

  return (
    <Card title="Your data">
      <div className={styles.stack}>
        {deleted && (
          <div role="status" className={styles.stack}>
            <p>
              All your data has been deleted. Your account is still active, so you can start using the app again at
              any time without asking anyone. Keeping the account doesn&apos;t keep any data. If you&apos;d like your
              account removed as well, ask {OWNER_NAME}.
            </p>
            <Button onClick={onOk}>OK</Button>
          </div>
        )}

        <div className={styles.stack}>
          <h3 className={styles.sub}>Download backup</h3>
          <p className="muted">Saves everything in your account to a file on this device.</p>
          <Button variant="secondary" disabled={busy} onClick={onDownload}>Download backup</Button>
        </div>

        <div className={styles.stack}>
          <h3 className={styles.sub}>Import backup</h3>
          {empty === false ? (
            <p className="muted">Import only works on an empty account. Delete your data first.</p>
          ) : (
            <>
              <div className="field">
                <label className="field__label" htmlFor="import-file">Backup file</label>
                <input
                  id="import-file"
                  type="file"
                  className="field__input"
                  accept=".json,application/json"
                  disabled={busy || empty === null}
                  onChange={onFile}
                />
              </div>
              {parseErrors.length > 0 && (
                <ul className={styles.errorList} role="alert">
                  {parseErrors.map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
              {backup && (
                <>
                  <p>This backup contains:</p>
                  {summary.length > 0 ? (
                    <ul>{summary.map((s) => <li key={s}>{s}</li>)}</ul>
                  ) : (
                    <p className="muted">Nothing to import: the backup is empty.</p>
                  )}
                  <Button disabled={busy} onClick={onImport}>Import</Button>
                </>
              )}
            </>
          )}
          {imported !== null && <p className={styles.saved} role="status">Imported {imported} items.</p>}
        </div>

        <div className={styles.stack}>
          <h3 className={styles.sub}>Delete all my data</h3>
          <p className="muted">
            Permanently deletes everything in your account. A backup file is downloaded first. Your account stays active.
          </p>
          <Field
            label="Type DELETE to confirm"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <Button variant="danger" disabled={busy || confirmText !== 'DELETE'} onClick={onDelete}>
            Delete all my data
          </Button>
        </div>

        {error && <p className="field__error" role="alert">{error}</p>}
      </div>
    </Card>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Layout } from '../../components';
import { importWorkoutSessions } from '../../data/workouts';
import './workouthistory.css';

interface Result {
  imported: number;
  existing: number;
  invalid: { name: string; errors: string[] }[];
}

export default function WorkoutImportScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onFiles(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const items: unknown[] = [];
      const names: string[] = [];
      const badFiles: { name: string; errors: string[] }[] = [];
      for (const file of files) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await file.text());
        } catch {
          badFiles.push({ name: file.name, errors: ['Not valid JSON'] });
          continue;
        }
        for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
          items.push(item);
          names.push(file.name);
        }
      }
      const r = items.length
        ? await importWorkoutSessions(items)
        : { imported: 0, existing: 0, invalid: [] };
      setResult({
        imported: r.imported,
        existing: r.existing,
        invalid: [
          ...badFiles,
          ...r.invalid.map((v) => ({ name: names[v.index] ?? `item ${v.index}`, errors: v.errors })),
        ],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Import workouts">
      <Card title="From FatherWorkout">
        <ol className="wh-note">
          <li>In Google Drive, open “FatherWorkout Data”, then “sessions”.</li>
          <li>Download the folder (Drive zips it) and unzip it.</li>
          <li>Select all the .json files here.</li>
        </ol>
        <input
          className="wh-file"
          type="file"
          multiple
          accept=".json,application/json"
          aria-label="Session files"
          disabled={busy}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void onFiles(files);
          }}
        />
        {busy && <p role="status">Importing…</p>}
        {error && <p className="field__error" role="alert">{error}</p>}
      </Card>
      {result && (
        <Card title="Result">
          <p className="wh-counts" role="status">
            {result.imported} imported · {result.existing} already there · {result.invalid.length} invalid
          </p>
          {result.invalid.length > 0 && (
            <ul className="wh-invalid">
              {result.invalid.map((v, i) => (
                <li key={i}>
                  <strong>{v.name}</strong>: {v.errors.join('; ')}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Link className="wh-link" to="/workout/history">View history</Link>
    </Layout>
  );
}

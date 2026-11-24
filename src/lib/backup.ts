// Backup file format and import preparation (contracts §10.1). Pure: no I/O, ids come from the caller.

export const BACKUP_APP = 'nutrition-tracker';
export const BACKUP_VERSION = 1;
export const BACKUP_TABLES = [
  'profiles',
  'weights',
  'foods',
  'food_logs',
  'water_logs',
  'daily_activity',
  'workouts',
  'exercise_categories',
  'target_suggestions',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupRow = Record<string, unknown>;
export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  tables: Record<BackupTable, BackupRow[]>;
}

/** Tables whose primary key is a generated uuid; imports give these rows new ids. */
const UUID_TABLES: readonly BackupTable[] = ['weights', 'foods', 'food_logs', 'water_logs', 'target_suggestions'];

/** Column defaults from supabase/migrations/*.sql. NOW marks a timestamptz `default now()`. */
const NOW = Symbol('now');
const DEFAULTS: Record<BackupTable, Record<string, unknown>> = {
  profiles: { everyday_activity: 'sedentary', created_at: NOW, updated_at: NOW },
  weights: { created_at: NOW, updated_at: NOW },
  foods: { water_ml: 0, portions: [], created_at: NOW, updated_at: NOW },
  food_logs: { logged_at: NOW, water_ml: 0, created_at: NOW, updated_at: NOW },
  water_logs: { logged_at: NOW, created_at: NOW, updated_at: NOW },
  daily_activity: {
    sedentary_h: 0,
    light_cardio_h: 0,
    strenuous_cardio_h: 0,
    lifting_h: 0,
    created_at: NOW,
    updated_at: NOW,
  },
  workouts: { light_cardio_h: 0, strenuous_cardio_h: 0, lifting_h: 0, created_at: NOW, updated_at: NOW },
  exercise_categories: { created_at: NOW, updated_at: NOW },
  target_suggestions: { created_at: NOW, updated_at: NOW },
};

/** Defaults per table; timestamp columns hold the string 'now' (prepareImport substitutes the real time). */
export const COLUMN_DEFAULTS: Record<BackupTable, BackupRow> = Object.fromEntries(
  BACKUP_TABLES.map((t) => [
    t,
    Object.fromEntries(Object.entries(DEFAULTS[t]).map(([k, v]) => [k, v === NOW ? 'now' : v])),
  ]),
) as Record<BackupTable, BackupRow>;

function emptyTables(): Record<BackupTable, BackupRow[]> {
  return Object.fromEntries(BACKUP_TABLES.map((t) => [t, []])) as unknown as Record<BackupTable, BackupRow[]>;
}

function withoutUser(row: BackupRow): BackupRow {
  const rest = { ...row };
  delete rest.user_id;
  return rest;
}

/** Rows as read from the API; strips user_id from every row. */
export function buildBackup(tables: Record<BackupTable, BackupRow[]>, exportedAt: string): BackupFile {
  const out = emptyTables();
  for (const t of BACKUP_TABLES) out[t] = (tables[t] ?? []).map(withoutUser);
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt, tables: out };
}

export function backupFileName(date: string): string {
  return `nutrition-tracker-backup-${date}.json`;
}

/** JSON text -> backup, or the problems found. Unknown tables ignored; missing tables = []. */
export function parseBackup(
  text: string,
): { ok: true; backup: BackupFile } | { ok: false; errors: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON.'] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['This is not a Nutrition Tracker backup.'] };
  }
  const d = data as Record<string, unknown>;
  const errors: string[] = [];
  if (d.app !== BACKUP_APP) {
    errors.push('This is not a Nutrition Tracker backup.');
  } else if (typeof d.version !== 'number' || !Number.isFinite(d.version) || d.version < 1) {
    errors.push('The backup has no valid version.');
  } else if (d.version > BACKUP_VERSION) {
    errors.push('This backup was made by a newer version of the app. Update the app and try again.');
  }
  const tables = emptyTables();
  if (d.app === BACKUP_APP) {
    const raw = d.tables;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push('The backup has no tables.');
    } else {
      for (const t of BACKUP_TABLES) {
        const v = (raw as Record<string, unknown>)[t];
        if (v === undefined) continue;
        if (!Array.isArray(v)) {
          errors.push(`Table "${t}" is not a list.`);
        } else if (!v.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
          errors.push(`Table "${t}" has a row that is not an object.`);
        } else {
          tables[t] = v as BackupRow[];
        }
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      version: d.version as number,
      exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : '',
      tables,
    },
  };
}

export function countRows(b: BackupFile): Record<BackupTable, number> {
  return Object.fromEntries(BACKUP_TABLES.map((t) => [t, b.tables[t]?.length ?? 0])) as Record<BackupTable, number>;
}

/** Rows ready for import_my_data: new uuids (via newId) for weights, foods, food_logs,
 *  water_logs, target_suggestions; food_logs.food_id remapped (unknown -> null); user_id
 *  removed; missing columns filled from COLUMN_DEFAULTS (created_at/updated_at -> now). */
export function prepareImport(
  b: BackupFile,
  newId: () => string,
  now: string,
): Record<BackupTable, BackupRow[]> {
  const foodIds = new Map<string, string>();
  const out = emptyTables();
  for (const t of BACKUP_TABLES) {
    out[t] = (b.tables[t] ?? []).map((raw) => {
      const row = withoutUser(raw);
      if (UUID_TABLES.includes(t)) {
        const id = newId();
        if (t === 'foods' && typeof row.id === 'string') foodIds.set(row.id, id);
        row.id = id;
      }
      for (const [k, v] of Object.entries(DEFAULTS[t])) {
        if (row[k] === undefined) row[k] = v === NOW ? now : structuredClone(v);
      }
      return row;
    });
  }
  // foods precede food_logs in BACKUP_TABLES, so the id map is complete here.
  for (const log of out.food_logs) {
    const old = log.food_id;
    log.food_id = typeof old === 'string' ? (foodIds.get(old) ?? null) : null;
  }
  return out;
}

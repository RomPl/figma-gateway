import type { SqliteDatabase } from './sqlite';

const MIGRATIONS = [
  `
    CREATE TABLE IF NOT EXISTS aliases (
      alias TEXT PRIMARY KEY COLLATE NOCASE,
      file_key TEXT NOT NULL,
      node_id TEXT NOT NULL,
      project TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_aliases_project ON aliases(project);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_aliases_file_node ON aliases(file_key, node_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_ip TEXT,
      actor_user_agent TEXT,
      request_id TEXT,
      target TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT 'null',
      status TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target);
  `
];

export const migrateDatabase = (db: SqliteDatabase): void => {
  for (const migration of MIGRATIONS) {
    db.exec(migration);
  }
};

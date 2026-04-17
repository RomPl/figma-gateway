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
  `,
  `
    CREATE TABLE IF NOT EXISTS ui_blocks (
      ui_id TEXT PRIMARY KEY COLLATE NOCASE,
      project TEXT NOT NULL,
      file_key TEXT,
      node_id TEXT,
      code_repository TEXT,
      code_path TEXT,
      code_export_name TEXT,
      code_selector TEXT,
      code_marker_type TEXT NOT NULL,
      figma_binding_type TEXT NOT NULL,
      figma_binding_key TEXT NOT NULL,
      name TEXT,
      description TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_ui_blocks_project ON ui_blocks(project);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_ui_blocks_file_node ON ui_blocks(file_key, node_id);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_ui_blocks_code_path ON ui_blocks(code_path);
  `,
  `
    CREATE TABLE IF NOT EXISTS ui_mappings (
      ui_id TEXT PRIMARY KEY COLLATE NOCASE,
      project TEXT NOT NULL,
      semantic_role TEXT,
      code_file TEXT NOT NULL,
      code_component TEXT NOT NULL,
      code_selector TEXT,
      code_line_start INTEGER,
      code_line_end INTEGER,
      code_jsx_path TEXT,
      code_snapshot_hash TEXT,
      code_snapshot_json TEXT NOT NULL DEFAULT '{}',
      figma_file_key TEXT NOT NULL,
      figma_node_id TEXT NOT NULL,
      figma_snapshot_hash TEXT,
      figma_snapshot_json TEXT NOT NULL DEFAULT '{}',
      sync_last_direction TEXT NOT NULL,
      sync_last_synced_at TEXT,
      sync_last_code_hash TEXT,
      sync_last_figma_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_ui_mappings_project ON ui_mappings(project);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_ui_mappings_figma ON ui_mappings(figma_file_key, figma_node_id);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_ui_mappings_code ON ui_mappings(code_file, code_component);
  `,
  `
    CREATE TABLE IF NOT EXISTS design_tokens (
      token TEXT PRIMARY KEY COLLATE NOCASE,
      type TEXT NOT NULL,
      project TEXT NOT NULL,
      description TEXT,
      raw_value TEXT NOT NULL,
      numeric_value REAL,
      unit_value TEXT,
      css_var_value TEXT,
      tailwind_value TEXT,
      value_meta_json TEXT NOT NULL DEFAULT '{}',
      code_file TEXT,
      code_export_name TEXT,
      code_selector TEXT,
      code_class_name TEXT,
      code_style_path TEXT,
      code_css_var TEXT,
      code_token_source TEXT,
      figma_file_key TEXT,
      figma_collection_id TEXT,
      figma_variable_id TEXT,
      figma_style_id TEXT,
      figma_name TEXT,
      figma_mode TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_design_tokens_project_type ON design_tokens(project, type);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_design_tokens_figma_refs ON design_tokens(figma_variable_id, figma_style_id);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_design_tokens_code_refs ON design_tokens(code_class_name, code_css_var);
  `,
  `
    CREATE TABLE IF NOT EXISTS asset_registry (
      asset_id TEXT PRIMARY KEY COLLATE NOCASE,
      project TEXT NOT NULL,
      ui_id TEXT,
      asset_kind TEXT NOT NULL,
      source_path TEXT,
      resolved_url TEXT,
      hash TEXT NOT NULL,
      width REAL,
      height REAL,
      role TEXT,
      figma_strategy TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_asset_registry_project_ui ON asset_registry(project, ui_id);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_asset_registry_hash ON asset_registry(hash);
  `,
  `
    CREATE TABLE IF NOT EXISTS plugin_bridge_sessions (
      session_id TEXT PRIMARY KEY COLLATE NOCASE,
      session_token TEXT NOT NULL,
      file_key TEXT,
      local_file_key TEXT,
      file_name TEXT,
      client_name TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      connected INTEGER NOT NULL DEFAULT 1
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_plugin_bridge_sessions_file ON plugin_bridge_sessions(file_key, local_file_key);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_plugin_bridge_sessions_seen ON plugin_bridge_sessions(last_seen_at);
  `,
  `
    CREATE TABLE IF NOT EXISTS plugin_bridge_commands (
      command_id TEXT PRIMARY KEY COLLATE NOCASE,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      dispatched_at TEXT,
      completed_at TEXT,
      result_json TEXT,
      error_json TEXT
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_plugin_bridge_commands_session_status ON plugin_bridge_commands(session_id, status, created_at);
  `
];

export const migrateDatabase = (db: SqliteDatabase): void => {
  for (const migration of MIGRATIONS) {
    db.exec(migration);
  }
};

import type { SqliteDatabase } from './sqlite';

export type AliasSeedRecord = {
  alias: string;
  fileKey: string;
  nodeId: string;
  project: string;
  tags: string[];
  description?: string;
};

export const exampleAliasSeedData: AliasSeedRecord[] = [
  {
    alias: 'hero-primary',
    fileKey: 'demo-file-key',
    nodeId: '1:2',
    project: 'marketing-site',
    tags: ['hero', 'primary', 'landing'],
    description: 'Primary hero block for the marketing landing page'
  },
  {
    alias: 'footer-contact',
    fileKey: 'demo-file-key',
    nodeId: '1:3',
    project: 'marketing-site',
    tags: ['footer', 'contact'],
    description: 'Footer contact link block'
  }
];

export const seedAliasRegistry = (db: SqliteDatabase, seedData: AliasSeedRecord[] = exampleAliasSeedData): number => {
  const countRow = db.prepare('SELECT COUNT(*) AS count FROM aliases').get() as { count: number };
  if (countRow.count > 0) {
    return 0;
  }

  const now = new Date().toISOString();
  const statement = db.prepare(`
    INSERT INTO aliases (alias, file_key, node_id, project, tags_json, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const record of seedData) {
    statement.run(
      record.alias,
      record.fileKey,
      record.nodeId,
      record.project,
      JSON.stringify(record.tags),
      record.description ?? null,
      now,
      now
    );
  }

  return seedData.length;
};

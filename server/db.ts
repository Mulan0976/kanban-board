import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'kanban.db');

// Compatibility wrapper that mimics better-sqlite3 API on top of sql.js
export class Database {
  private db: SqlJsDatabase;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sqlJsDb: SqlJsDatabase) {
    this.db = sqlJsDb;
  }

  prepare(sql: string) {
    const db = this.db;
    const self = this;
    return {
      run(...params: unknown[]) {
        db.run(sql, params as any[]);
        self.scheduleSave();
        return { changes: db.getRowsModified() };
      },
      get(...params: unknown[]): Record<string, unknown> | undefined {
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params as any[]);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row as Record<string, unknown>;
        }
        stmt.free();
        return undefined;
      },
      all(...params: unknown[]): Record<string, unknown>[] {
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params as any[]);
        const rows: Record<string, unknown>[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as Record<string, unknown>);
        }
        stmt.free();
        return rows;
      },
    };
  }

  exec(sql: string) {
    this.db.exec(sql);
    this.scheduleSave();
  }

  pragma(pragma: string) {
    this.db.exec(`PRAGMA ${pragma}`);
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveToDisk();
    }, 500);
  }

  saveNow() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveToDisk();
  }

  saveToDisk() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
      console.error('Failed to save database:', err);
    }
  }

  close() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveToDisk();
    this.db.close();
  }
}

let db: Database;

export async function initDb(): Promise<Database> {
  const SQL = await initSqlJs();

  let sqlJsDb: SqlJsDatabase;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    sqlJsDb = new SQL.Database(buffer);
  } else {
    sqlJsDb = new SQL.Database();
  }

  db = new Database(sqlJsDb);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return db;
}

export function runMigrations(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      owner_id TEXT,
      owner_session TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS board_members (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      user_id TEXT,
      session_token TEXT,
      permission TEXT NOT NULL CHECK(permission IN ('view', 'edit')),
      display_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invite_links (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      code TEXT UNIQUE NOT NULL,
      permission TEXT NOT NULL CHECK(permission IN ('view', 'edit')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 250,
      width REAL NOT NULL DEFAULT 300,
      height REAL,
      color TEXT,
      is_done_column INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      color TEXT,
      preview_image TEXT,
      preview_settings TEXT,
      attachments TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_assignees (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_checkpoints (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS time_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      logged_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      dependency_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, dependency_id)
    );

    CREATE TABLE IF NOT EXISTS action_history (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_summary TEXT NOT NULL,
      snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add width column to existing columns table
  try {
    database.exec('ALTER TABLE columns ADD COLUMN width REAL NOT NULL DEFAULT 300');
  } catch {
    // Column already exists, ignore
  }

  // Migration: add attachments column to existing tasks table
  try {
    database.exec('ALTER TABLE tasks ADD COLUMN attachments TEXT');
  } catch {
    // Column already exists, ignore
  }

  // Migration: add preview_settings column
  try {
    database.exec('ALTER TABLE tasks ADD COLUMN preview_settings TEXT');
  } catch {}

  // Migration: add height column to columns table
  try {
    database.exec('ALTER TABLE columns ADD COLUMN height REAL');
  } catch {}
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

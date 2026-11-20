import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import type { CardPresetRecord, StudioPresetConfigData } from '../src/utils/presetValidation.ts';

export interface DbUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: 'user' | 'admin';
  createdAtMs: number;
}

export interface PresetRepository {
  readonly driver: 'postgres' | 'sqlite';
  init(): Promise<void>;
  createUser(user: DbUser): Promise<void>;
  findUserByEmail(email: string): Promise<DbUser | null>;
  findUserById(id: string): Promise<DbUser | null>;
  countPresetsByOwner(ownerId: string): Promise<number>;
  createPreset(record: CardPresetRecord): Promise<void>;
  getPresetById(id: string): Promise<CardPresetRecord | null>;
  listPresetsByOwner(ownerId: string, maxRows?: number): Promise<CardPresetRecord[]>;
  listAllPresets(maxRows?: number): Promise<CardPresetRecord[]>;
  updatePreset(
    id: string,
    ownerId: string,
    patch: {
      title: string;
      description: string;
      isPublic: boolean;
      thumbnailDataUrl: string;
      config: StudioPresetConfigData;
      updatedAtMs: number;
    }
  ): Promise<boolean>;
  deletePreset(id: string): Promise<boolean>;
  close(): Promise<void>;
}

interface RawPresetRow {
  id: string;
  owner_id: string;
  author_name: string;
  title: string;
  description: string;
  is_public: number | boolean;
  thumbnail_data_url: string;
  config_json: string;
  created_at: number | string;
  updated_at: number | string;
}

interface RawUserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: string;
  created_at: number | string;
}

function rowToUser(row: RawUserRow | undefined | null): DbUser | null {
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    passwordHash: String(row.password_hash),
    role: row.role === 'admin' ? 'admin' : 'user',
    createdAtMs: Number(row.created_at) || 0,
  };
}

function rowToPreset(row: RawPresetRow | undefined | null): CardPresetRecord | null {
  if (!row) return null;
  try {
    const config = JSON.parse(String(row.config_json)) as StudioPresetConfigData;
    return {
      id: String(row.id),
      ownerId: String(row.owner_id),
      authorName: String(row.author_name),
      title: String(row.title),
      description: String(row.description),
      isPublic: Boolean(row.is_public),
      thumbnailDataUrl: String(row.thumbnail_data_url || ''),
      config,
      createdAtMs: Number(row.created_at) || 0,
      updatedAtMs: Number(row.updated_at) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * PostgreSQL driver for Vercel (Neon, Vercel Postgres, Supabase, Railway, etc.)
 * Activated automatically whenever process.env.DATABASE_URL is configured.
 */
class PostgresRepository implements PresetRepository {
  readonly driver = 'postgres' as const;
  private readonly pool: Pool;
  private initialized = false;

  constructor(connectionString: string) {
    const isLocal =
      connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    this.pool = new Pool({
      connectionString,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at BIGINT NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS presets (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        is_public BOOLEAN NOT NULL DEFAULT TRUE,
        thumbnail_data_url TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_presets_owner_updated ON presets(owner_id, updated_at DESC);`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_presets_updated ON presets(updated_at DESC);`
    );
    this.initialized = true;
  }

  async createUser(user: DbUser): Promise<void> {
    await this.init();
    await this.pool.query(
      `INSERT INTO users (id, email, display_name, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.email, user.displayName, user.passwordHash, user.role, user.createdAtMs]
    );
  }

  async findUserByEmail(email: string): Promise<DbUser | null> {
    await this.init();
    const res = await this.pool.query<RawUserRow>(
      `SELECT id, email, display_name, password_hash, role, created_at
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    return rowToUser(res.rows[0]);
  }

  async findUserById(id: string): Promise<DbUser | null> {
    await this.init();
    const res = await this.pool.query<RawUserRow>(
      `SELECT id, email, display_name, password_hash, role, created_at
       FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rowToUser(res.rows[0]);
  }

  async countPresetsByOwner(ownerId: string): Promise<number> {
    await this.init();
    const res = await this.pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM presets WHERE owner_id = $1`,
      [ownerId]
    );
    return Number(res.rows[0]?.cnt ?? 0);
  }

  async createPreset(record: CardPresetRecord): Promise<void> {
    await this.init();
    await this.pool.query(
      `INSERT INTO presets
        (id, owner_id, author_name, title, description, is_public, thumbnail_data_url, config_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        record.id,
        record.ownerId,
        record.authorName,
        record.title,
        record.description,
        record.isPublic,
        record.thumbnailDataUrl,
        JSON.stringify(record.config),
        record.createdAtMs,
        record.updatedAtMs,
      ]
    );
  }

  async getPresetById(id: string): Promise<CardPresetRecord | null> {
    await this.init();
    const res = await this.pool.query<RawPresetRow>(
      `SELECT id, owner_id, author_name, title, description, is_public, thumbnail_data_url, config_json, created_at, updated_at
       FROM presets WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rowToPreset(res.rows[0]);
  }

  async listPresetsByOwner(ownerId: string, maxRows = 100): Promise<CardPresetRecord[]> {
    await this.init();
    const res = await this.pool.query<RawPresetRow>(
      `SELECT id, owner_id, author_name, title, description, is_public, thumbnail_data_url, config_json, created_at, updated_at
       FROM presets WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT $2`,
      [ownerId, maxRows]
    );
    return res.rows.map(rowToPreset).filter((r): r is CardPresetRecord => r !== null);
  }

  async listAllPresets(maxRows = 60): Promise<CardPresetRecord[]> {
    await this.init();
    const res = await this.pool.query<RawPresetRow>(
      `SELECT id, owner_id, author_name, title, description, is_public, thumbnail_data_url, config_json, created_at, updated_at
       FROM presets ORDER BY updated_at DESC LIMIT $1`,
      [maxRows]
    );
    return res.rows.map(rowToPreset).filter((r): r is CardPresetRecord => r !== null);
  }

  async updatePreset(
    id: string,
    ownerId: string,
    patch: {
      title: string;
      description: string;
      isPublic: boolean;
      thumbnailDataUrl: string;
      config: StudioPresetConfigData;
      updatedAtMs: number;
    }
  ): Promise<boolean> {
    await this.init();
    const res = await this.pool.query(
      `UPDATE presets
       SET title = $1, description = $2, is_public = $3, thumbnail_data_url = $4, config_json = $5, updated_at = $6
       WHERE id = $7 AND owner_id = $8`,
      [
        patch.title,
        patch.description,
        patch.isPublic,
        patch.thumbnailDataUrl,
        JSON.stringify(patch.config),
        patch.updatedAtMs,
        id,
        ownerId,
      ]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async deletePreset(id: string): Promise<boolean> {
    await this.init();
    const res = await this.pool.query(`DELETE FROM presets WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Built-in Node 22 SQLite driver (zero native build deps) for instant local & preview persistence
 * whenever DATABASE_URL is not configured.
 */
export class SqliteRepository implements PresetRepository {
  readonly driver = 'sqlite' as const;
  private readonly dbPath: string;
  private db: import('node:sqlite').DatabaseSync | null = null;

  constructor(dbPath?: string) {
    if (dbPath === ':memory:') {
      this.dbPath = ':memory:';
    } else {
      const baseDir = path.resolve(process.cwd(), 'data');
      const target = dbPath ? path.resolve(dbPath) : path.resolve(baseDir, 'badgeforge.sqlite');
      this.dbPath = target;
    }
  }

  private async ensureDb(): Promise<import('node:sqlite').DatabaseSync> {
    if (this.db) return this.db;
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      fs.mkdirSync(dir, { recursive: true });
    }
    const { DatabaseSync } = await import('node:sqlite');
    const instance = new DatabaseSync(this.dbPath);
    instance.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS presets (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        is_public INTEGER NOT NULL DEFAULT 1,
        thumbnail_data_url TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_presets_owner_updated ON presets(owner_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_presets_updated ON presets(updated_at DESC);
    `);
    this.db = instance;
    return instance;
  }

  async init(): Promise<void> {
    await this.ensureDb();
  }

  async createUser(user: DbUser): Promise<void> {
    const db = await this.ensureDb();
    db.prepare(
      `INSERT INTO users (id, email, display_name, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(user.id, user.email, user.displayName, user.passwordHash, user.role, user.createdAtMs);
  }

  async findUserByEmail(email: string): Promise<DbUser | null> {
    const db = await this.ensureDb();
    const row = db
      .prepare(
        `SELECT id, email, display_name, password_hash, role, created_at
         FROM users WHERE email = ? LIMIT 1`
      )
      .get(email) as RawUserRow | undefined;
    return rowToUser(row);
  }

  async findUserById(id: string): Promise<DbUser | null> {
    const db = await this.ensureDb();
    const row = db
      .prepare(
        `SELECT id, email, display_name, password_hash, role, created_at
         FROM users WHERE id = ? LIMIT 1`
      )
      .get(id) as RawUserRow | undefined;
    return rowToUser(row);
  }

  async countPresetsByOwner(ownerId: string): Promise<number> {
    const db = await this.ensureDb();
    const row = db
      .prepare(`SELECT COUNT(*) AS cnt FROM presets WHERE owner_id = ?`)
      .get(ownerId) as { cnt?: number } | undefined;
    return Number(row?.cnt ?? 0);
  }

  async createPreset(record: CardPresetRecord): Promise<void> {
    const db = await this.ensureDb();
    db.prepare(
      `INSERT INTO presets
        (id, owner_id, author_name, title, description, is_public, thumbnail_data_url, config_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id,
      record.ownerId,
      record.authorName,
      record.title,
      record.description,
      record.isPublic ? 1 : 0,
      record.thumbnailDataUrl,
      JSON.stringify(record.config),
      record.createdAtMs,
      record.updatedAtMs
    );
  }

  async getPresetById(id: string): Promise<CardPresetRecord | null> {
    const db = await this.ensureDb();
    const row = db
      .prepare(
        `SELECT id, owner_id, author_name, title, description, is_public, thumbnail_data_url, config_json, created_at, updated_at
         FROM presets WHERE id = ? LIMIT 1`
      )
      .get(id) as RawPresetRow | undefined;
    return rowToPreset(row);
  }

  async listPresetsByOwner(ownerId: string, maxRows = 100): Promise<CardPresetRecord[]> {
    const db = await this.ensureDb();
    const rows = db
      .prepare(
        `SELECT id, owner_id, author_name, title, description, is_public, thumbnail_data_url, config_json, created_at, updated_at
         FROM presets WHERE owner_id = ? ORDER BY updated_at DESC LIMIT ?`
      )
      .all(ownerId, maxRows) as unknown as RawPresetRow[];
    return rows.map(rowToPreset).filter((r): r is CardPresetRecord => r !== null);
  }

  async listAllPresets(maxRows = 60): Promise<CardPresetRecord[]> {
    const db = await this.ensureDb();
    const rows = db
      .prepare(
        `SELECT id, owner_id, author_name, title, description, is_public, thumbnail_data_url, config_json, created_at, updated_at
         FROM presets ORDER BY updated_at DESC LIMIT ?`
      )
      .all(maxRows) as unknown as RawPresetRow[];
    return rows.map(rowToPreset).filter((r): r is CardPresetRecord => r !== null);
  }

  async updatePreset(
    id: string,
    ownerId: string,
    patch: {
      title: string;
      description: string;
      isPublic: boolean;
      thumbnailDataUrl: string;
      config: StudioPresetConfigData;
      updatedAtMs: number;
    }
  ): Promise<boolean> {
    const db = await this.ensureDb();
    const res = db
      .prepare(
        `UPDATE presets
         SET title = ?, description = ?, is_public = ?, thumbnail_data_url = ?, config_json = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?`
      )
      .run(
        patch.title,
        patch.description,
        patch.isPublic ? 1 : 0,
        patch.thumbnailDataUrl,
        JSON.stringify(patch.config),
        patch.updatedAtMs,
        id,
        ownerId
      );
    return Number(res.changes ?? 0) > 0;
  }

  async deletePreset(id: string): Promise<boolean> {
    const db = await this.ensureDb();
    const res = db.prepare(`DELETE FROM presets WHERE id = ?`).run(id);
    return Number(res.changes ?? 0) > 0;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

let sharedRepo: PresetRepository | null = null;

export function getPresetRepository(): PresetRepository {
  if (sharedRepo) return sharedRepo;
  const dbUrl = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  ).trim();
  if (dbUrl) {
    sharedRepo = new PostgresRepository(dbUrl);
  } else {
    // On Vercel without DATABASE_URL, /tmp is writable; locally use ./data/badgeforge.sqlite
    const fallbackPath = process.env.VERCEL
      ? '/tmp/badgeforge.sqlite'
      : undefined;
    sharedRepo = new SqliteRepository(fallbackPath);
  }
  return sharedRepo;
}

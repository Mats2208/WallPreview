import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: any };

export type UserRow = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: 'ADMIN' | 'USER';
  created_at: string;
  updated_at: string;
};

export type AssetRow = {
  id: number;
  owner_id: number | null;
  kind: 'WALL' | 'UTILITY';
  name: string;
  original_name: string;
  mime_type: string;
  size: number;
  storage_path: string;
  public_url: string;
  created_at: string;
};

export type ProjectRow = {
  id: number;
  owner_id: number;
  name: string;
  wall_asset_id: number | null;
  scene_json: string;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db: any;
  private readonly dataDir = join(process.cwd(), 'data');
  private readonly dbPath = join(this.dataDir, 'wallpreview.sqlite');

  onModuleInit() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
    this.seed();
  }

  onModuleDestroy() {
    this.db?.close();
  }

  run(sql: string, params: Record<string, unknown> = {}) {
    return this.db.prepare(sql).run(params);
  }

  get<T>(sql: string, params: Record<string, unknown> = {}): T | undefined {
    return this.db.prepare(sql).get(params) as T | undefined;
  }

  all<T>(sql: string, params: Record<string, unknown> = {}): T[] {
    return this.db.prepare(sql).all(params) as T[];
  }

  hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
    return `${salt}:${hash}`;
  }

  verifyPassword(password: string, stored: string) {
    const [salt, expected] = stored.split(':');
    if (!salt || !expected) {
      return false;
    }

    const hash = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
    return createHash('sha256').update(hash).digest('hex') === createHash('sha256').update(expected).digest('hex');
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NULL,
        kind TEXT NOT NULL CHECK(kind IN ('WALL', 'UTILITY')),
        name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        public_url TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        wall_asset_id INTEGER NULL,
        scene_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(wall_asset_id) REFERENCES assets(id) ON DELETE SET NULL
      );
    `);
  }

  private seed() {
    const admin = this.get<UserRow>('SELECT * FROM users WHERE email = $email', {
      $email: 'admin@wallpreview.local',
    });

    if (!admin) {
      this.run(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES ($email, $name, $passwordHash, 'ADMIN')`,
        {
          $email: 'admin@wallpreview.local',
          $name: 'WallPreview Admin',
          $passwordHash: this.hashPassword('Admin123!'),
        },
      );
    }
  }
}

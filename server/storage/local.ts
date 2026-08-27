import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { BatchItem, DbAdapter, DbStatement, RunResult } from "./types";

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

export function openLocalDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "archive.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/** better-sqlite3 wrapped in the async DbAdapter shape. */
export class LocalAdapter implements DbAdapter {
  readonly kind = "local" as const;

  constructor(private readonly db: Database.Database) {}

  prepare(sql: string): DbStatement {
    const stmt = this.db.prepare(sql);
    return {
      async run(...params: unknown[]): Promise<RunResult> {
        const info = stmt.run(...params);
        return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
      },
      get(...params: unknown[]) {
        return Promise.resolve(stmt.get(...params));
      },
      all(...params: unknown[]) {
        return Promise.resolve(stmt.all(...params));
      },
    };
  }

  async batch(items: BatchItem[], _timeoutMs?: number): Promise<void> {
    if (items.length === 0) return;
    const tx = this.db.transaction((list: BatchItem[]) => {
      for (const item of list) this.db.prepare(item.sql).run(...(item.params ?? []));
    });
    tx(items);
  }

  /** Direct (non-adapter) escape hatch used only by boot-time settings plumbing. */
  get raw(): Database.Database {
    return this.db;
  }
}

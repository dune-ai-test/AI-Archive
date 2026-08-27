export type StorageMode = "local" | "d1";

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface BatchItem {
  sql: string;
  params?: unknown[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DbStatement {
  run(...params: any[]): Promise<RunResult>;
  get(...params: any[]): Promise<any>;
  all(...params: any[]): Promise<any[]>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Minimal async facade mirroring the better-sqlite3 statement API,
 * implemented for both the local SQLite file and Cloudflare D1 (REST).
 */
export interface DbAdapter {
  readonly kind: StorageMode;
  prepare(sql: string): DbStatement;
  /** Execute statements sequentially; atomic where the backend supports it. */
  batch(items: BatchItem[], timeoutMs?: number): Promise<void>;
}

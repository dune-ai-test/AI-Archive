import type { BatchItem, DbAdapter, DbStatement, RunResult } from "./types";

export interface D1Credentials {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

interface D1Error {
  code?: number;
  message?: string;
}

interface D1QueryMeta {
  changes?: number;
  last_row_id?: number;
  duration?: number;
}

interface D1QueryResult {
  results?: Record<string, unknown>[];
  success: boolean;
  meta?: D1QueryMeta;
}

interface D1Response {
  success?: boolean;
  errors?: D1Error[];
  messages?: D1Error[];
  result?: D1QueryResult[] | null;
}

export function readD1Credentials(): D1Credentials | null {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const databaseId = (process.env.CLOUDFLARE_D1_DATABASE_ID ?? "").trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  if (!accountId || !databaseId || !apiToken) return null;
  return { accountId, databaseId, apiToken };
}

function normalizeParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint") return Number(v);
  return v;
}

/** Cloudflare D1 over the REST query endpoint. Every statement is one HTTPS roundtrip. */
export class D1Adapter implements DbAdapter {
  readonly kind = "d1" as const;

  /** Detected at first use: does /query accept an array body? Some runtimes don't. */
  private supportsBatchArrays: boolean | null = null;

  constructor(private readonly creds: D1Credentials) {}

  private endpoint(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.creds.accountId}/d1/database/${this.creds.databaseId}/query`;
  }

  private async exec(
    body: { sql: string; params?: unknown[] } | { sql: string; params?: unknown[] }[],
    timeoutMs = 15_000
  ): Promise<D1QueryResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(this.endpoint(), {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.creds.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error)?.name === "AbortError") throw new Error("D1 request timed out");
      throw new Error(`D1 unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }
    clearTimeout(timer);

    const text = await res.text();
    let data: D1Response;
    try {
      data = JSON.parse(text) as D1Response;
    } catch {
      throw new Error(`D1 returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.ok || data.success === false || (data.errors && data.errors.length > 0)) {
      const msg =
        data.errors?.map((e) => e.message).join("; ") ||
        text.slice(0, 300) ||
        `HTTP ${res.status}`;
      throw new Error(`D1 error: ${msg}`);
    }
    return Array.isArray(data.result) ? data.result : [];
  }

  prepare(sql: string): DbStatement {
    return {
      run: async (...params: unknown[]): Promise<RunResult> => {
        const first = await this.single(sql, params);
        return {
          changes: first.meta?.changes ?? 0,
          lastInsertRowid: Number(first.meta?.last_row_id ?? 0),
        };
      },
      get: async (...params: unknown[]) => {
        const first = await this.single(sql, params);
        return first.results?.[0];
      },
      all: async (...params: unknown[]) => {
        const first = await this.single(sql, params);
        return first.results ?? [];
      },
    };
  }

  private async single(sql: string, params: unknown[], timeoutMs?: number): Promise<D1QueryResult> {
    const results = await this.exec({ sql, params: params.map(normalizeParam) }, timeoutMs);
    return results[0] ?? { success: true, meta: {} };
  }

  async batch(items: BatchItem[], timeoutMs?: number): Promise<void> {
    if (items.length === 0) return;
    if (this.supportsBatchArrays === null) {
      this.supportsBatchArrays = await this.detectBatchSupport(timeoutMs);
    }
    if (this.supportsBatchArrays) {
      const CHUNK = 100; // statements per REST call
      for (let i = 0; i < items.length; i += CHUNK) {
        await this.exec(
          items.slice(i, i + CHUNK).map((it) => ({
            sql: it.sql,
            params: (it.params ?? []).map(normalizeParam),
          })),
          timeoutMs
        );
      }
      return;
    }
    // Fallback: the endpoint rejected an array body — execute sequentially.
    for (const it of items) {
      await this.single(it.sql, it.params ?? [], timeoutMs);
    }
  }

  /** Probe whether the REST endpoint accepts multi-statement array bodies. */
  private async detectBatchSupport(timeoutMs?: number): Promise<boolean> {
    try {
      await this.exec([{ sql: `SELECT 1 AS one` }, { sql: `SELECT 2 AS two` }], timeoutMs);
      return true;
    } catch {
      return false;
    }
  }
}

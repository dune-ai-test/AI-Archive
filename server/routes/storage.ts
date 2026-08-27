import { Hono } from "hono";
import {
  activeKind,
  activeSource,
  d1Adapter,
  d1State,
  envMode,
  localAdapter,
  setRuntimeMode,
  storageReady,
} from "../storage";
import type { DbAdapter } from "../storage/types";
import type { StorageCounts, StorageMode } from "../../shared/types";

export const storageRoutes = new Hono<{
  Variables: { admin: boolean };
}>();

const COUNTS_SQL = `SELECT
  (SELECT COUNT(*) FROM posts WHERE review='accepted' AND source!='github') AS posts,
  (SELECT COUNT(*) FROM posts WHERE review='accepted' AND source='github') AS repos,
  (SELECT COUNT(*) FROM entities) AS entities`;

async function probeCounts(
  adapter: DbAdapter | null
): Promise<{ counts: StorageCounts | null; error: string | null }> {
  if (!adapter) return { counts: null, error: "not configured" };
  try {
    const row = (await adapter.prepare(`SELECT 1 AS ok`).get()) as { ok: number };
    if (row?.ok !== 1) throw new Error("ping failed");
    const counts = (await adapter.prepare(COUNTS_SQL).get()) as unknown as StorageCounts;
    return { counts, error: null };
  } catch (err) {
    return { counts: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function statusPayload() {
  await storageReady();
  const localProbe = await probeCounts(localAdapter);
  let d1Probe: { counts: StorageCounts | null; error: string | null } = {
    counts: null,
    error: null,
  };
  if (d1Adapter) {
    d1Probe =
      d1State.lastError && !d1State.booted
        ? { counts: null, error: d1State.lastError }
        : await probeCounts(d1Adapter);
  }

  return {
    mode: activeKind(),
    source: activeSource(),
    locked: Boolean(envMode),
    d1_configured: Boolean(d1Adapter),
    d1_booted: d1State.booted,
    d1_boot_error: d1Adapter ? d1State.lastError : null,
    d1_fallback: d1Adapter ? d1State.fallbackActive : false,
    counts: {
      local: localProbe.counts,
      local_error: localProbe.error,
      d1: d1Probe.counts,
      d1_error: d1Adapter ? d1Probe.error ?? d1State.lastError : "not configured",
    },
  };
}

storageRoutes.get("/status", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  return c.json(await statusPayload());
});

storageRoutes.put("/mode", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ mode?: string }>().catch(() => ({}) as { mode?: string });
  const mode = body.mode as StorageMode | undefined;
  if (mode !== "local" && mode !== "d1") return c.json({ error: "mode must be 'local' or 'd1'" }, 400);
  try {
    await setRuntimeMode(mode);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Switch failed" }, 409);
  }
  return c.json(await statusPayload());
});

// Ping D1 independently of which storage is currently active.
storageRoutes.post("/test", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  if (!d1Adapter) {
    return c.json({
      ok: false,
      error:
        "Cloudflare D1 is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN.",
    });
  }
  const started = Date.now();
  try {
    const row = (await d1Adapter.prepare(`SELECT 1 AS ok`).get()) as { ok: number };
    if (row?.ok !== 1) throw new Error("unexpected response");
    return c.json({ ok: true, latency_ms: Date.now() - started });
  } catch (err) {
    return c.json({ ok: false, latency_ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * One-time migration: replace the CONTENT tables in D1 with a snapshot of the
 * local SQLite database (posts, tags, entities, repo_meta).
 * AI connections / settings / sessions are NOT copied.
 * Safe to re-run if it is interrupted.
 */
storageRoutes.post("/push-local", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  if (!d1Adapter) return c.json({ error: "Cloudflare D1 is not configured." }, 400);
  await storageReady();

  type PostSnapshot = Record<string, unknown> & { id: number };

  // 1. Snapshot local content
  const posts = (await localAdapter.prepare(`SELECT * FROM posts ORDER BY id`).all()) as PostSnapshot[];
  const cats = (await localAdapter.prepare(`SELECT * FROM categories ORDER BY id`).all()) as PostSnapshot[];
  const ents = (await localAdapter.prepare(`SELECT * FROM entities ORDER BY id`).all()) as PostSnapshot[];
  const postCats = (await localAdapter.prepare(`SELECT * FROM post_categories`).all()) as PostSnapshot[];
  const postEnts = (await localAdapter.prepare(`SELECT * FROM post_entities`).all()) as PostSnapshot[];
  const repoMeta = (await localAdapter.prepare(`SELECT * FROM repo_meta`).all()) as PostSnapshot[];

  const items: { sql: string; params?: unknown[] }[] = [];

  // 2. Clear remote content (children first — FKs are enforced).
  items.push({ sql: `DELETE FROM post_categories` });
  items.push({ sql: `DELETE FROM post_entities` });
  items.push({ sql: `DELETE FROM repo_meta` });
  items.push({ sql: `DELETE FROM posts` });
  items.push({ sql: `DELETE FROM categories` });
  items.push({ sql: `DELETE FROM entities` });

  // 3. Parents first, preserving IDs.
  for (const cat of cats)
    items.push({
      sql: `INSERT INTO categories (id, slug, name, emoji) VALUES (?, ?, ?, ?)`,
      params: [cat.id, cat.slug, cat.name, cat.emoji],
    });
  for (const ent of ents)
    items.push({
      sql: `INSERT INTO entities (id, type, name, slug) VALUES (?, ?, ?, ?)`,
      params: [ent.id, ent.type, ent.name, ent.slug],
    });
  for (const p of posts)
    items.push({
      sql: `INSERT INTO posts (id, raw_text, author_handle, author_name, post_url, posted_at, title, summary,
                               status, review, source, error, analysis_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        p.id, p.raw_text, p.author_handle, p.author_name, p.post_url, p.posted_at, p.title, p.summary,
        p.status ?? "analyzed", p.review ?? "accepted", p.source ?? "manual", p.error, p.analysis_json,
        p.created_at, p.updated_at,
      ],
    });
  for (const pc of postCats)
    items.push({ sql: `INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)`, params: [pc.post_id, pc.category_id] });
  for (const pe of postEnts)
    items.push({ sql: `INSERT OR IGNORE INTO post_entities (post_id, entity_id) VALUES (?, ?)`, params: [pe.post_id, pe.entity_id] });
  for (const rm of repoMeta)
    items.push({
      sql: `INSERT OR REPLACE INTO repo_meta (post_id, full_name, stars, language, topics, pushed_at) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [rm.post_id, rm.full_name, rm.stars ?? 0, rm.language, rm.topics, rm.pushed_at],
    });

  try {
    await d1Adapter.batch(items, 30_000);
  } catch (err) {
    return c.json(
      {
        error: `Push failed partway (simply run it again to repair): ${err instanceof Error ? err.message : String(err)}`,
      },
      500
    );
  }

  return c.json({
    ok: true,
    pushed: {
      posts: posts.length,
      categories: cats.length,
      entities: ents.length,
      repo_meta: repoMeta.length,
    },
  });
});

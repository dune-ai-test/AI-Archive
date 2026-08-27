import { Hono } from "hono";
import { getActiveConfig, getConfigById, testConfig } from "../ai";
import { activeStorage } from "../storage";
import type { SettingsPublic } from "../../shared/types";

export const settingsRoutes = new Hono<{
  Variables: { admin: boolean };
}>();

// Public view of the ACTIVE connection (kept for compatibility)
settingsRoutes.get("/", async (c) => {
  const cfg = await getActiveConfig();
  const pub: SettingsPublic = {
    ai_base_url: cfg.base_url,
    ai_model: cfg.model,
    ai_api_key_set: Boolean(cfg.api_key),
  };
  return c.json(pub);
});

// Test either the active connection, a saved one, or an unsaved draft.
// Body is optional; empty strings fall back to stored values.
settingsRoutes.post("/test", async (c) => {
  const b = await c
    .req.json<{
      connection_id?: number | null;
      base_url?: string;
      api_key?: string;
      model?: string;
    }>()
    .catch(() => ({}) as { connection_id?: null; base_url?: string; api_key?: string; model?: string });

  let cfg = { base_url: "", api_key: "", model: "" };

  if (b.connection_id != null) {
    const stored = await getConfigById(Number(b.connection_id));
    if (!stored) return c.json({ error: "Connection not found" }, 404);
    cfg = {
      base_url: b.base_url?.trim() || stored.base_url,
      api_key: b.api_key?.trim() || stored.api_key,
      model: b.model?.trim() || stored.model,
    };
  } else {
    const active = await getActiveConfig();
    cfg = {
      base_url: b.base_url?.trim() || active.base_url,
      api_key: b.api_key?.trim() || active.api_key,
      model: b.model?.trim() || active.model,
    };
  }

  return c.json(await testConfig(cfg));
});

interface ImportRow {
  raw_text?: string;
  title?: string | null;
  summary?: string | null;
  author_handle?: string | null;
  author_name?: string | null;
  post_url?: string | null;
  posted_at?: string | null;
  source?: string;
  tags?: {
    categories?: { slug: string; name: string; emoji?: string }[];
    entities?: { type: string; name: string; slug?: string }[];
    repoMeta?: {
      full_name: string;
      stars?: number;
      language?: string | null;
      topics?: string[];
      pushed_at?: string | null;
    };
  };
}

const VALID_ENTITY_TYPES = ["company", "model", "person", "technology", "product"];

function name2slug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

settingsRoutes.post("/import", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  const db = activeStorage();

  const payload = await c.req
    .json<{ posts?: ImportRow[] }>()
    .catch(() => null);
  const incoming = payload?.posts;
  if (!Array.isArray(incoming) || incoming.length === 0)
    return c.json({ error: "No posts found in file" }, 400);
  if (incoming.length > 5000)
    return c.json({ error: "File too large (max 5000 posts)" }, 400);

  // Dedup against existing content with one query instead of one per row.
  const existingRawTexts = new Set(
    ((await db.prepare(`SELECT raw_text FROM posts`).all()) as { raw_text: string }[]).map((r) => r.raw_text)
  );

  const items: { sql: string; params?: unknown[] }[] = [];
  let imported = 0;
  let skipped = 0;

  for (const p of incoming) {
    const rawText = typeof p.raw_text === "string" ? p.raw_text.trim() : "";
    if (!rawText || existingRawTexts.has(rawText)) {
      skipped++;
      continue;
    }
    existingRawTexts.add(rawText);

    items.push({
      sql: `INSERT INTO posts (raw_text, title, summary, author_handle, author_name, post_url,
                             posted_at, source, status, review)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'analyzed', 'accepted')`,
      params: [
        rawText.slice(0, 20_000),
        typeof p.title === "string" ? p.title.slice(0, 160) : null,
        typeof p.summary === "string" ? p.summary.slice(0, 1200) : null,
        p.author_handle ?? null,
        p.author_name ?? null,
        p.post_url ?? null,
        p.posted_at ?? null,
        typeof p.source === "string" ? p.source : "manual",
      ],
    });

    for (const cat of p.tags?.categories ?? []) {
      if (typeof cat.slug !== "string" || !cat.slug) continue;
      items.push({
        sql: `INSERT OR IGNORE INTO categories (slug, name, emoji) VALUES (?, ?, ?)`,
        params: [cat.slug, cat.name || cat.slug, cat.emoji ?? ""],
      });
      items.push({
        sql: `INSERT OR IGNORE INTO post_categories (post_id, category_id)
              VALUES ((SELECT id FROM posts WHERE raw_text = ? LIMIT 1),
                      (SELECT id FROM categories WHERE slug = ?))`,
        params: [rawText.slice(0, 20_000), cat.slug],
      });
    }

    for (const e of p.tags?.entities ?? []) {
      if (typeof e.name !== "string" || !e.name.trim()) continue;
      const type = VALID_ENTITY_TYPES.includes(e.type) ? e.type : "technology";
      const slug = e.slug ?? name2slug(e.name);
      items.push({
        sql: `INSERT OR IGNORE INTO entities (type, name, slug) VALUES (?, ?, ?)`,
        params: [type, e.name, slug],
      });
      items.push({
        sql: `INSERT OR IGNORE INTO post_entities (post_id, entity_id)
              VALUES ((SELECT id FROM posts WHERE raw_text = ? LIMIT 1),
                      (SELECT id FROM entities WHERE type = ? AND slug = ?))`,
        params: [rawText.slice(0, 20_000), type, slug],
      });
    }

    const rm = p.tags?.repoMeta;
    if (rm && typeof rm.full_name === "string") {
      items.push({
        sql: `INSERT OR REPLACE INTO repo_meta (post_id, full_name, stars, language, topics, pushed_at)
              VALUES ((SELECT id FROM posts WHERE raw_text = ? LIMIT 1), ?, ?, ?, ?, ?)`,
        params: [
          rawText.slice(0, 20_000),
          rm.full_name,
          rm.stars ?? 0,
          rm.language ?? null,
          (rm.topics ?? []).join(","),
          rm.pushed_at ?? null,
        ],
      });
    }

    imported++;
  }

  try {
    // Imported IDs are needed inside later statements via subselects, so all
    // statements must execute in strict order — the adapter batches keep that.
    await db.batch(items);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Import failed" }, 500);
  }

  return c.json({ ok: true, imported, skipped });
});

settingsRoutes.get("/export", async (c) => {
  const db = activeStorage();
  const posts = await db.prepare(`SELECT * FROM posts ORDER BY id`).all();
  const cats = await db
    .prepare(
      `SELECT pc.post_id, c.id, c.slug, c.name, c.emoji FROM post_categories pc JOIN categories c ON c.id = pc.category_id`
    )
    .all();
  const ents = await db
    .prepare(
      `SELECT pe.post_id, e.id, e.type, e.name, e.slug FROM post_entities pe JOIN entities e ON e.id = pe.entity_id`
    )
    .all();
  const reposMeta = (await db.prepare(`SELECT * FROM repo_meta`).all()) as {
    post_id: number;
    full_name: string;
    stars: number;
    language: string | null;
    topics: string | null;
    pushed_at: string | null;
  }[];

  const byPost = new Map<number, { categories: unknown[]; entities: unknown[]; repoMeta?: unknown }>();
  for (const p of posts as { id: number }[]) byPost.set(p.id, { categories: [], entities: [] });
  for (const row of cats as { post_id: number }[]) {
    const { post_id, ...rest } = row;
    byPost.get(post_id)?.categories.push(rest);
  }
  for (const row of ents as { post_id: number }[]) {
    const { post_id, ...rest } = row;
    byPost.get(post_id)?.entities.push(rest);
  }
  for (const rm of reposMeta) {
    const entry = byPost.get(rm.post_id);
    if (entry)
      entry.repoMeta = {
        full_name: rm.full_name,
        stars: rm.stars,
        language: rm.language,
        topics: (rm.topics ?? "").split(",").filter(Boolean),
        pushed_at: rm.pushed_at,
      };
  }

  const exportPayload = {
    exported_at: new Date().toISOString(),
    posts: (posts as Record<string, unknown>[]).map((p) => ({
      ...p,
      tags: byPost.get(p.id as number) ?? { categories: [], entities: [] },
    })),
  };

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="archive-ai-x-export-${Date.now()}.json"`);
  return c.body(JSON.stringify(exportPayload, null, 2));
});

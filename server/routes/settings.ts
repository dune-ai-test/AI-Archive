import { Hono } from "hono";
import { getActiveConfig, getConfigById, testConfig } from "../ai";
import { db } from "../db";
import type { SettingsPublic } from "../../shared/types";

export const settingsRoutes = new Hono<{
  Variables: { admin: boolean };
}>();

// Public view of the ACTIVE connection (kept for compatibility)
settingsRoutes.get("/", (c) => {
  const cfg = getActiveConfig();
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
    const stored = getConfigById(Number(b.connection_id));
    if (!stored) return c.json({ error: "Connection not found" }, 404);
    cfg = {
      base_url: b.base_url?.trim() || stored.base_url,
      api_key: b.api_key?.trim() || stored.api_key,
      model: b.model?.trim() || stored.model,
    };
  } else {
    const active = getActiveConfig();
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

settingsRoutes.post("/import", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);

  const payload = await c.req
    .json<{ posts?: ImportRow[] }>()
    .catch(() => null);
  const incoming = payload?.posts;
  if (!Array.isArray(incoming) || incoming.length === 0)
    return c.json({ error: "No posts found in file" }, 400);
  if (incoming.length > 5000)
    return c.json({ error: "File too large (max 5000 posts)" }, 400);

  let imported = 0;
  let skipped = 0;

  const insertAll = db.transaction(() => {
    for (const p of incoming) {
      const rawText = typeof p.raw_text === "string" ? p.raw_text.trim() : "";
      if (!rawText) {
        skipped++;
        continue;
      }
      // Skip exact duplicates already in the archive
      const exists = db.prepare(`SELECT 1 FROM posts WHERE raw_text = ? LIMIT 1`).get(rawText);
      if (exists) {
        skipped++;
        continue;
      }

      const info = db
        .prepare(
          `INSERT INTO posts (raw_text, title, summary, author_handle, author_name, post_url,
                             posted_at, source, status, review)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'analyzed', 'accepted')`
        )
        .run(
          rawText.slice(0, 20_000),
          typeof p.title === "string" ? p.title.slice(0, 160) : null,
          typeof p.summary === "string" ? p.summary.slice(0, 1200) : null,
          p.author_handle ?? null,
          p.author_name ?? null,
          p.post_url ?? null,
          p.posted_at ?? null,
          typeof p.source === "string" ? p.source : "manual"
        );
      const id = Number(info.lastInsertRowid);
      imported++;

      const tags = p.tags;
      if (!tags) continue;

      for (const cat of tags.categories ?? []) {
        if (typeof cat.slug !== "string" || !cat.slug) continue;
        db.prepare(
          `INSERT OR IGNORE INTO categories (slug, name, emoji) VALUES (?, ?, ?)`
        ).run(cat.slug, cat.name || cat.slug, cat.emoji ?? "");
        const row = db.prepare(`SELECT id FROM categories WHERE slug = ?`).get(cat.slug) as { id: number };
        db.prepare(`INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)`).run(id, row.id);
      }

      for (const e of tags.entities ?? []) {
        if (typeof e.name !== "string" || !e.name.trim()) continue;
        const type = ["company", "model", "person", "technology", "product"].includes(e.type) ? e.type : "technology";
        const slug = e.slug ?? name2slug(e.name);
        db.prepare(`INSERT OR IGNORE INTO entities (type, name, slug) VALUES (?, ?, ?)`).run(type, e.name, slug);
        const row = db.prepare(`SELECT id FROM entities WHERE type = ? AND slug = ?`).get(type, slug) as { id: number };
        db.prepare(`INSERT OR IGNORE INTO post_entities (post_id, entity_id) VALUES (?, ?)`).run(id, row.id);
      }

      const rm = tags.repoMeta;
      if (rm && typeof rm.full_name === "string") {
        db.prepare(
          `INSERT OR REPLACE INTO repo_meta (post_id, full_name, stars, language, topics, pushed_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          rm.full_name,
          rm.stars ?? 0,
          rm.language ?? null,
          (rm.topics ?? []).join(","),
          rm.pushed_at ?? null
        );
      }
    }
  });

  try {
    insertAll();
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Import failed" }, 500);
  }

  return c.json({ ok: true, imported, skipped });
});

function name2slug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

settingsRoutes.get("/export", (c) => {
  const posts = db.prepare(`SELECT * FROM posts ORDER BY id`).all();
  const cats = db
    .prepare(
      `SELECT pc.post_id, c.id, c.slug, c.name, c.emoji FROM post_categories pc JOIN categories c ON c.id = pc.category_id`
    )
    .all();
  const ents = db
    .prepare(
      `SELECT pe.post_id, e.id, e.type, e.name, e.slug FROM post_entities pe JOIN entities e ON e.id = pe.entity_id`
    )
    .all();
  const reposMeta = db.prepare(`SELECT * FROM repo_meta`).all() as {
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

  const payload = {
    exported_at: new Date().toISOString(),
    posts: (posts as Record<string, unknown>[]).map((p) => ({
      ...p,
      tags: byPost.get(p.id as number) ?? { categories: [], entities: [] },
    })),
  };

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="archive-ai-x-export-${Date.now()}.json"`);
  return c.body(JSON.stringify(payload, null, 2));
});

import { Hono } from "hono";
import { getActiveConfig, getConfigById, testConfig } from "../ai";
import { db } from "../db";
import type { SettingsPublic } from "../../shared/types";

export const settingsRoutes = new Hono();

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

  const byPost = new Map<number, { categories: unknown[]; entities: unknown[] }>();
  for (const p of posts as { id: number }[]) byPost.set(p.id, { categories: [], entities: [] });
  for (const row of cats as { post_id: number }[]) {
    const { post_id, ...rest } = row;
    byPost.get(post_id)?.categories.push(rest);
  }
  for (const row of ents as { post_id: number }[]) {
    const { post_id, ...rest } = row;
    byPost.get(post_id)?.entities.push(rest);
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

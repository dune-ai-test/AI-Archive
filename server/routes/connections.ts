import { Hono } from "hono";
import { db } from "../db";
import { getActiveConfig } from "../ai";
import type { ConnectionDTO } from "../../shared/types";

export const connectionsRoutes = new Hono();

function slugHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "Connection";
  }
}

function listConnections(): ConnectionDTO[] {
  const active = getActiveConfig();
  const rows = db.prepare(`SELECT id, name, base_url, model FROM connections ORDER BY id`).all() as {
    id: number;
    name: string;
    base_url: string;
    model: string;
  }[];
  const keyRows = db.prepare(`SELECT id FROM connections`).all() as { id: number }[];
  // fetch key presence separately without exposing keys
  const withKeys = new Set(
    (
      db
        .prepare(`SELECT id, api_key FROM connections`)
        .all() as { id: number; api_key: string }[]
    )
      .filter((r) => r.api_key.trim().length > 0)
      .map((r) => r.id)
  );
  void keyRows;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    base_url: r.base_url,
    model: r.model,
    is_active: active.id === r.id,
    key_set: withKeys.has(r.id),
  }));
}

connectionsRoutes.get("/", (c) => c.json(listConnections()));

connectionsRoutes.post("/", async (c) => {
  const b = await c.req.json<{
    name?: string;
    base_url?: string;
    api_key?: string;
    model?: string;
  }>();

  const baseUrl = (b.base_url ?? "").trim().replace(/\/+$/, "");
  const model = (b.model ?? "").trim();
  if (!baseUrl || !model) return c.json({ error: "base_url and model are required" }, 400);

  const name = (b.name ?? "").trim() || slugHost(baseUrl);
  const apiKey = (b.api_key ?? "").trim();

  const count = (db.prepare(`SELECT COUNT(*) AS n FROM connections`).get() as { n: number }).n;
  const info = db
    .prepare(`INSERT INTO connections (name, base_url, api_key, model) VALUES (?, ?, ?, ?)`)
    .run(name, baseUrl, apiKey, model);

  const id = Number(info.lastInsertRowid);
  if (count === 0) {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('active_connection_id', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(String(id));
  }

  return c.json({ ok: true, id, connections: listConnections() }, 201);
});

connectionsRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  const existing = db.prepare(`SELECT id FROM connections WHERE id = ?`).get(id);
  if (!existing) return c.json({ error: "Connection not found" }, 404);

  const b = await c.req.json<{
    name?: string;
    base_url?: string;
    api_key?: string;
    model?: string;
  }>();

  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (typeof b.name === "string" && b.name.trim()) {
    fields.push("name = ?");
    values.push(b.name.trim());
  }
  if (typeof b.base_url === "string" && b.base_url.trim()) {
    fields.push("base_url = ?");
    values.push(b.base_url.trim().replace(/\/+$/, ""));
  }
  if (typeof b.model === "string" && b.model.trim()) {
    fields.push("model = ?");
    values.push(b.model.trim());
  }
  // Empty api_key means "keep existing"
  if (typeof b.api_key === "string" && b.api_key.trim()) {
    fields.push("api_key = ?");
    values.push(b.api_key.trim());
  }

  if (fields.length) {
    db.prepare(`UPDATE connections SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
  }
  return c.json({ ok: true, connections: listConnections() });
});

connectionsRoutes.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

  const wasActive = getActiveConfig().id === id;
  const info = db.prepare(`DELETE FROM connections WHERE id = ?`).run(id);
  if (info.changes === 0) return c.json({ error: "Connection not found" }, 404);

  if (wasActive) {
    const next = db.prepare(`SELECT id FROM connections ORDER BY id LIMIT 1`).get() as
      | { id: number }
      | undefined;
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('active_connection_id', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(next ? String(next.id) : "");
  }
  return c.json({ ok: true, connections: listConnections() });
});

connectionsRoutes.post("/:id/activate", (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  const exists = db.prepare(`SELECT id FROM connections WHERE id = ?`).get(id);
  if (!exists) return c.json({ error: "Connection not found" }, 404);

  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('active_connection_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(id));

  return c.json({ ok: true, connections: listConnections() });
});

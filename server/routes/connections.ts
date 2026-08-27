import { Hono } from "hono";
import { activeStorage } from "../storage";
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

async function listConnections(): Promise<ConnectionDTO[]> {
  const db = activeStorage();
  const active = await getActiveConfig();
  const rows = (await db.prepare(`SELECT id, name, base_url, model FROM connections ORDER BY id`).all()) as {
    id: number;
    name: string;
    base_url: string;
    model: string;
  }[];
  // fetch key presence separately without exposing keys
  const keyRows = (await db.prepare(`SELECT id, api_key FROM connections`).all()) as {
    id: number;
    api_key: string;
  }[];
  const withKeys = new Set(keyRows.filter((r) => r.api_key.trim().length > 0).map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    base_url: r.base_url,
    model: r.model,
    is_active: active.id === r.id,
    key_set: withKeys.has(r.id),
  }));
}

connectionsRoutes.get("/", async (c) => c.json(await listConnections()));

connectionsRoutes.post("/", async (c) => {
  const db = activeStorage();
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

  const countRow = (await db.prepare(`SELECT COUNT(*) AS n FROM connections`).get()) as { n: number };
  const info = await db
    .prepare(`INSERT INTO connections (name, base_url, api_key, model) VALUES (?, ?, ?, ?)`)
    .run(name, baseUrl, apiKey, model);

  const id = Number(info.lastInsertRowid);
  if (countRow.n === 0) {
    await db
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('active_connection_id', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(String(id));
  }

  return c.json({ ok: true, id, connections: await listConnections() }, 201);
});

connectionsRoutes.patch("/:id", async (c) => {
  const db = activeStorage();
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  const existing = await db.prepare(`SELECT id FROM connections WHERE id = ?`).get(id);
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
    await db.prepare(`UPDATE connections SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
  }
  return c.json({ ok: true, connections: await listConnections() });
});

connectionsRoutes.delete("/:id", async (c) => {
  const db = activeStorage();
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

  const wasActive = (await getActiveConfig()).id === id;
  const info = await db.prepare(`DELETE FROM connections WHERE id = ?`).run(id);
  if (info.changes === 0) return c.json({ error: "Connection not found" }, 404);

  if (wasActive) {
    const next = (await db.prepare(`SELECT id FROM connections ORDER BY id LIMIT 1`).get()) as
      | { id: number }
      | undefined;
    await db
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('active_connection_id', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(next ? String(next.id) : "");
  }
  return c.json({ ok: true, connections: await listConnections() });
});

connectionsRoutes.post("/:id/activate", async (c) => {
  const db = activeStorage();
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  const exists = await db.prepare(`SELECT id FROM connections WHERE id = ?`).get(id);
  if (!exists) return c.json({ error: "Connection not found" }, 404);

  await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('active_connection_id', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(String(id));

  return c.json({ ok: true, connections: await listConnections() });
});

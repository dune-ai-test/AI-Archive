import { Hono } from "hono";
import { activeStorage } from "../storage";
import type { EntityTypeName } from "../../shared/types";

export const searchRoutes = new Hono();

function buildMatchQuery(q: string): string | null {
  const tokens = q
    .trim()
    .toLowerCase()
    .replace(/["'()*:^]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"*`).join(" ");
}

searchRoutes.get("/", async (c) => {
  const db = activeStorage();
  const q = c.req.query("q") ?? "";
  const match = buildMatchQuery(q);
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  if (!match) return c.json({ items: [], query: q });

  let rows: Record<string, unknown>[];
  try {
    rows = (await db
      .prepare(
        `SELECT p.*, bm25(posts_fts) AS rank
         FROM posts_fts JOIN posts p ON p.id = posts_fts.rowid
         WHERE posts_fts MATCH ? AND p.review = 'accepted'
         ORDER BY rank LIMIT ?`
      )
      .all(match, limit)) as unknown as Record<string, unknown>[];
  } catch {
    return c.json({ items: [], query: q });
  }

  // attach tags + snippet info client-side; strip rank
  const ids = rows.map((r) => Number(r.id));
  const ph = ids.map(() => "?").join(",");
  const cats = ids.length
    ? ((await db
        .prepare(
          `SELECT pc.post_id, c.id, c.slug, c.name, c.emoji FROM post_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.post_id IN (${ph})`
        )
        .all(...ids)) as unknown as ({ post_id: number } & { id: number; slug: string; name: string; emoji: string })[])
    : [];
  const ents = ids.length
    ? ((await db
        .prepare(
          `SELECT pe.post_id, e.id, e.type, e.name, e.slug FROM post_entities pe JOIN entities e ON e.id = pe.entity_id WHERE pe.post_id IN (${ph})`
        )
        .all(...ids)) as unknown as ({ post_id: number } & { id: number; type: EntityTypeName; name: string; slug: string })[])
    : [];

  const items = rows.map(({ rank: _rank, ...r }) => {
    const id = Number(r.id);
    return {
      ...r,
      status: r.status,
      categories: cats.filter((x) => x.post_id === id),
      entities: ents
        .filter((x) => x.post_id === id)
        .map(({ post_id: _p, ...e }) => e),
      query: q,
    };
  });

  return c.json({ items, query: q });
});

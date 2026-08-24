import { Hono } from "hono";
import { db } from "../db";
import type { RepoMeta } from "../../shared/types";

export const reposRoutes = new Hono<{
  Variables: { admin: boolean };
}>();

interface RepoRow {
  id: number;
  title: string | null;
  summary: string | null;
  raw_text: string;
  author_handle: string | null;
  post_url: string | null;
  status: string;
  review: string;
  created_at: string;
  full_name: string;
  stars: number;
  language: string | null;
  topics: string | null;
  pushed_at: string | null;
}

reposRoutes.get("/", (c) => {
  const admin = c.get("admin");
  const limit = Math.min(Number(c.req.query("limit")) || 100, 200);
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
  const sort = c.req.query("sort") === "stars" ? "r.stars DESC, p.id DESC" : "p.created_at DESC, p.id DESC";

  const reviewFilter = admin ? "" : `AND p.review = 'accepted'`;

  // Optional category filter (?category=slug1,slug2)
  const category = c.req.query("category")?.split(",").filter(Boolean) ?? [];
  let catJoin = "";
  const catParams: string[] = [];
  if (category.length) {
    catJoin = `JOIN post_categories rc ON rc.post_id = p.id JOIN categories rc2 ON rc2.id = rc.category_id AND rc2.slug IN (${category
      .map(() => "?")
      .join(",")})`;
    catParams.push(...category);
  }

  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.summary, p.raw_text, p.author_handle, p.post_url,
              p.status, p.review, p.created_at,
              r.full_name, r.stars, r.language, r.topics, r.pushed_at
       FROM posts p
       JOIN repo_meta r ON r.post_id = p.id
       ${catJoin}
       WHERE 1=1 ${reviewFilter}
       GROUP BY p.id
       ORDER BY ${sort} LIMIT ? OFFSET ?`
    )
    .all(...catParams, limit, offset) as unknown as RepoRow[];

  const total = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) AS n FROM posts p
         JOIN repo_meta r ON r.post_id = p.id
         ${catJoin}
         WHERE 1=1 ${reviewFilter}`
      )
      .get(...catParams) as { n: number }
  ).n;

  const items = rows.map((r) => ({
    ...r,
    status: r.status,
    review: r.review,
    topics: (r.topics ?? "").split(",").filter(Boolean),
    meta: {
      full_name: r.full_name,
      stars: r.stars,
      language: r.language,
      topics: (r.topics ?? "").split(",").filter(Boolean),
      pushed_at: r.pushed_at,
    } satisfies RepoMeta,
  }));

  return c.json({ items, total, limit, offset });
});

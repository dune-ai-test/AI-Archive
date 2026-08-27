import { Hono } from "hono";
import { activeStorage } from "../storage";
import type { TaxonomyResponse } from "../../shared/types";

export const taxonomyRoutes = new Hono();

taxonomyRoutes.get("/", async (c) => {
  const db = activeStorage();
  // Optional per-source counting for the sidebar:
  // ?source=github → repos only · ?source=posts → everything except repos
  // no param → all accepted content (Browse rail)
  const src = c.req.query("source");
  let sub = `(SELECT id FROM posts WHERE review = 'accepted')`;
  if (src === "github") sub = `(SELECT id FROM posts WHERE review = 'accepted' AND source = 'github')`;
  else if (src === "posts") sub = `(SELECT id FROM posts WHERE review = 'accepted' AND source != 'github')`;

  const categories = (await db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.emoji, COUNT(pc.post_id) AS count
       FROM categories c
       LEFT JOIN post_categories pc ON pc.category_id = c.id
         AND pc.post_id IN ${sub}
       GROUP BY c.id ORDER BY c.id`
    )
    .all()) as unknown as TaxonomyResponse["categories"];

  const entities = (await db
    .prepare(
      `SELECT e.id, e.type, e.name, e.slug, COUNT(pe.post_id) AS count
       FROM entities e
       LEFT JOIN post_entities pe ON pe.entity_id = e.id
         AND pe.post_id IN ${sub}
       GROUP BY e.id ORDER BY count DESC, e.name COLLATE NOCASE`
    )
    .all()) as unknown as TaxonomyResponse["entities"];

  const payload: TaxonomyResponse = { categories, entities };
  return c.json(payload);
});

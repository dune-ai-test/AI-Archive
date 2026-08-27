import { Hono } from "hono";
import { slugify } from "../db";
import { activeStorage } from "../storage";
import { analyzePost } from "../ai";
import type {
  Category,
  Entity,
  EntityTypeName,
  PostDetail,
  PostReview,
  PostTags,
} from "../../shared/types";

interface PostRow {
  id: number;
  raw_text: string;
  author_handle: string | null;
  author_name: string | null;
  post_url: string | null;
  posted_at: string | null;
  title: string | null;
  summary: string | null;
  status: string;
  review: string;
  error: string | null;
  analysis_json: string | null;
  created_at: string;
  updated_at: string;
}

async function attachTags<T extends { id: number }>(rows: T[]): Promise<(T & PostTags)[]> {
  if (rows.length === 0) return [];
  const db = activeStorage();
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => "?").join(",");
  const [cats, ents] = await Promise.all([
    db
      .prepare(
        `SELECT pc.post_id, c.id, c.slug, c.name, c.emoji
         FROM post_categories pc JOIN categories c ON c.id = pc.category_id
         WHERE pc.post_id IN (${ph}) ORDER BY c.id`
      )
      .all(...ids) as unknown as ({ post_id: number } & Category)[],
    db
      .prepare(
        `SELECT pe.post_id, e.id, e.type, e.name, e.slug
         FROM post_entities pe JOIN entities e ON e.id = pe.entity_id
         WHERE pe.post_id IN (${ph}) ORDER BY e.type, e.name`
      )
      .all(...ids) as unknown as ({ post_id: number } & Entity)[],
  ]);

  const map = new Map<number, PostTags>();
  for (const r of rows) map.set(r.id, { categories: [], entities: [] });
  for (const c of cats) {
    const t = map.get(c.post_id);
    if (t) t.categories.push({ id: c.id, slug: c.slug, name: c.name, emoji: c.emoji });
  }
  for (const e of ents) {
    const t = map.get(e.post_id);
    if (t)
      t.entities.push({
        id: e.id,
        type: e.type as EntityTypeName,
        name: e.name,
        slug: e.slug,
      });
  }
  return rows.map((r) => ({ ...r, ...(map.get(r.id) ?? { categories: [], entities: [] }) }));
}

export const postsRoutes = new Hono<{
  Variables: { admin: boolean };
}>();

// ---------------------------------------------------------------------------
// X link / embed resolution helpers
// ---------------------------------------------------------------------------

const STATUS_URL_RE =
  /https?:\/\/(?:(?:www|mobile)\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,20})\/status(?:es)?\/(\d+)/;

const GITHUB_REPO_RE = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/;

export interface GithubRepoInfo extends ResolvedPost {
  meta: { full_name: string; stars: number; language: string | null; topics: string[]; pushed_at: string | null };
}

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "archive-ai-x",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

/** Resolve a github.com/owner/repo link into content + metadata via the public API. */
async function resolveGithubRepo(url: string): Promise<GithubRepoInfo | null> {
  const m = url.match(GITHUB_REPO_RE);
  if (!m) return null;
  let [, owner, name] = m;
  name = name.replace(/\.git$/i, "");
  // Skip non-repo paths like /topics, /search, org pages with extra segments
  if (["topics", "search", "features", "collections", "trending", "sponsors", "settings"].includes(name.toLowerCase()))
    return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers: ghHeaders(),
      signal: controller.signal,
    });
    if (!repoRes.ok) return null;
    const repo = (await repoRes.json()) as {
      full_name: string;
      description: string | null;
      stargazers_count: number;
      language: string | null;
      topics?: string[];
      pushed_at: string | null;
      html_url: string;
    };

    let readmeText = "";
    const readmeRes = await fetch(`https://api.github.com/repos/${owner}/${name}/readme`, {
      headers: { ...ghHeaders(), Accept: "application/vnd.github.raw" },
      signal: controller.signal,
    });
    if (readmeRes.ok) {
      readmeText = await readmeRes.text();
      // Light cleanup of markdown noise
      readmeText = readmeText
        .replace(/<[^>]+>/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    const topics = (repo.topics ?? []).slice(0, 8);
    const meta = {
      full_name: repo.full_name,
      stars: repo.stargazers_count ?? 0,
      language: repo.language ?? null,
      topics,
      pushed_at: repo.pushed_at ?? null,
    };

    const parts = [
      `${repo.full_name} — ★ ${meta.stars.toLocaleString()}${meta.language ? ` · ${meta.language}` : ""}${
        topics.length ? ` · ${topics.join(", ")}` : ""
      }`,
      repo.description ? `Description: ${repo.description}` : "",
      readmeText ? `README:\n${readmeText.slice(0, 6000)}` : "",
    ].filter(Boolean);

    return {
      raw_text: parts.join("\n\n").slice(0, 8000),
      author_handle: `@${owner}`,
      author_name: null,
      post_url: repo.html_url,
      posted_at: null,
      meta,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ResolvedPost {
  raw_text: string;
  author_handle: string | null;
  author_name: string | null;
  post_url: string | null;
  posted_at: string | null;
}

function decodeHtmlEntities(s: string): string {
  const named: Record<string, string> = {
    mdash: "—", ndash: "–", amp: "&", lt: "<", gt: ">",
    quot: '"', apos: "'", nbsp: " ", hellip: "…", rsquo: "’", lsquo: "‘",
    ldquo: "“", rdquo: "”", copy: "©",
  };
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => named[name.toLowerCase()] ?? m);
}

/** Extract tweet body + date + handle from oEmbed/embed HTML. */
function parseTweetHtml(html: string): { text: string; date: string | null; handle: string | null } {
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) =>
      decodeHtmlEntities(
        m[1]
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<a [^>]*?>([\s\S]*?)<\/a>/gi, "$1")
          .replace(/<[^>]+>/g, "")
      ).trim()
    )
    .filter(Boolean);

  const tail = html.slice(html.lastIndexOf("</p>"));
  const dateRaw = tail.match(/<a [^>]*>([^<]{2,40})<\/a>/i)?.[1]?.trim() ?? null;
  let posted_at: string | null = null;
  if (dateRaw) {
    const d = new Date(dateRaw);
    if (!isNaN(d.getTime())) posted_at = d.toISOString();
  }

  const plain = decodeHtmlEntities(html.replace(/<[^>]+>/g, " "));
  const sig = plain.match(/—\s*(?:[^—]*?)\(@([A-Za-z0-9_]+)\)/);

  return { text: paragraphs.join("\n\n"), date: posted_at, handle: sig?.[1] ?? null };
}

async function resolveViaOEmbed(statusUrl: string): Promise<ResolvedPost | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(statusUrl)}&omit_script=1&dnt=true`,
      { signal: controller.signal, headers: { "User-Agent": "archive-ai-x/0.1" } }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      html?: string;
      url?: string;
      author_name?: string;
      author_url?: string;
    };
    if (!j.html) return null;

    const { text, date, handle } = parseTweetHtml(j.html);
    if (!text) return null;

    const authorFromUrl = j.author_url?.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]+)/i)?.[1] ?? null;
    return {
      raw_text: text,
      author_handle: (handle ?? authorFromUrl) ? `@${handle ?? authorFromUrl}` : null,
      author_name: j.author_name ?? null,
      post_url: j.url ?? statusUrl,
      posted_at: date,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function resolveFromPastedEmbed(raw: string): ResolvedPost | null {
  const bq = raw.match(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/i)?.[0] ?? raw;
  const { text, date, handle } = parseTweetHtml(bq);
  if (!text) return null;
  const url = raw.match(STATUS_URL_RE)?.[0] ?? null;
  return {
    raw_text: text,
    author_handle: handle ? `@${handle}` : null,
    author_name: null,
    post_url: url,
    posted_at: date,
  };
}

// ---------------------------------------------------------------------------
// Standalone resolver endpoint (used by Add Post preview)
// ---------------------------------------------------------------------------

postsRoutes.post("/resolve", async (c) => {
  const body = await c.req.json<{ input?: string }>().catch(() => ({}) as { input?: string });
  const input = (body.input ?? "").trim();
  if (!input) return c.json({ error: "input required" }, 400);
  if (input.length > 100_000) return c.json({ error: "input too long" }, 400);

  const urlMatch = input.match(STATUS_URL_RE);
  if (urlMatch) {
    const viaApi = await resolveViaOEmbed(urlMatch[0]);
    if (viaApi) return c.json({ resolved: true, source: "x", ...viaApi });
  }

  if (GITHUB_REPO_RE.test(input)) {
    const gh = await resolveGithubRepo(input);
    if (gh) return c.json({ resolved: true, source: "github", ...gh });
  }

  if (/twitter-tweet|<blockquote/i.test(input)) {
    const parsed = resolveFromPastedEmbed(input);
    if (parsed) return c.json({ resolved: true, source: "x", ...parsed });
  }

  return c.json({ resolved: false, raw_text: input });
});

// ---------------------------------------------------------------------------
// Create — resolves links/embeds, lands in Requests for approval
// ---------------------------------------------------------------------------

postsRoutes.post("/", async (c) => {
  const db = activeStorage();
  const body = await c.req.json<Partial<PostDetail>>();
  let rawText = (body.raw_text ?? "").trim();
  if (!rawText) return c.json({ error: "raw_text is required" }, 400);
  if (rawText.length > 100_000) return c.json({ error: "raw_text too long" }, 400);

  const clean = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null;

  let authorHandle = clean(body.author_handle);
  let authorName = clean(body.author_name);
  let postUrl = clean(body.post_url);
  let postedAt = clean(body.posted_at);
  let source: string = "manual";
  let ghMeta: GithubRepoInfo["meta"] | null = null;

  // A GitHub link is treated as a repo only when it IS the content —
  // an X post that merely mentions github.com stays an X post.
  const ghMatch = rawText.match(GITHUB_REPO_RE);
  const leftoverText = rawText.replace(/https?:\/\/\S+/g, "").replace(/\s/g, "");
  const ghIsPrimary = Boolean(ghMatch) && leftoverText.length < 30;

  if (ghIsPrimary && ghMatch) {
    source = "github";
    const r = await resolveGithubRepo(ghMatch[0]);
    if (r) {
      rawText = r.raw_text || rawText;
      authorHandle ||= r.author_handle;
      authorName ||= r.author_name;
      postUrl ||= r.post_url;
      ghMeta = r.meta;
    } else {
      // API failed (rate limit / private repo) — keep it in the Repos
      // section with a placeholder card instead of leaking into the timeline.
      authorHandle ||= `@${ghMatch[1]}`;
      postUrl ||= ghMatch[0];
      ghMeta = {
        full_name: `${ghMatch[1]}/${ghMatch[2].replace(/\.git$/i, "")}`,
        stars: 0,
        language: null,
        topics: [],
        pushed_at: null,
      };
    }
  } else {
    // Resolve X links / embed code into plain content before storing
    const urlMatch = rawText.match(STATUS_URL_RE);
    if (urlMatch) {
      source = "x";
      const r = await resolveViaOEmbed(urlMatch[0]);
      if (r) {
        rawText = r.raw_text || rawText;
        authorHandle ||= r.author_handle;
        authorName ||= r.author_name;
        postUrl ||= r.post_url;
        postedAt ||= r.posted_at;
      }
    } else if (/twitter-tweet|<blockquote/i.test(rawText)) {
      source = "x";
      const r = resolveFromPastedEmbed(rawText);
      if (r) {
        rawText = r.raw_text || rawText;
        authorHandle ||= r.author_handle;
        postUrl ||= r.post_url;
        postedAt ||= r.posted_at;
      }
    }
  }
  if (rawText.length > 20_000) rawText = rawText.slice(0, 20_000);

  const info = await db
    .prepare(
      `INSERT INTO posts (raw_text, author_handle, author_name, post_url, posted_at, review, source)
       VALUES (?, ?, ?, ?, ?, 'review', ?)`
    )
    .run(rawText, authorHandle, authorName, postUrl, postedAt, source);

  const id = Number(info.lastInsertRowid);

  if (ghMeta) {
    await db
      .prepare(
        `INSERT INTO repo_meta (post_id, full_name, stars, language, topics, pushed_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, ghMeta.full_name, ghMeta.stars, ghMeta.language, ghMeta.topics.join(","), ghMeta.pushed_at);
  }

  // Fire-and-forget analysis; Requests page polls for status.
  void analyzePost(id).catch(() => {});

  const row = (await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id)) as PostRow;
  return c.json(await attachTags([row]), 201);
});

// ---------------------------------------------------------------------------
// List with filters (default: accepted only — timeline view)
// ---------------------------------------------------------------------------

postsRoutes.get("/", async (c) => {
  const db = activeStorage();
  const q = c.req.query();
  const category = q.category?.split(",").filter(Boolean) ?? [];
  const entity = q.entity?.split(",").filter(Boolean).map(Number) ?? [];
  const type = q.type?.split(",").filter(Boolean) ?? [];
  const status = q.status ?? "";
  const sort = q.sort === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Number(q.limit) || 50, 200);
  const offset = Math.max(Number(q.offset) || 0, 0);

  const joins: string[] = [];
  const wheres: string[] = [];
  const params: (string | number)[] = [];

  // Review filter: admins may pick any state; anonymous visitors are locked
  // to accepted content only.
  const admin = c.get("admin");
  if (!admin || q.review === "accepted") {
    wheres.push(`p.review = 'accepted'`);
  } else if (q.review === "review" || q.review === "rejected") {
    wheres.push(`p.review = ?`);
    params.push(q.review);
  }
  // admin + review=all → no filter

  // Source filter: repos live in their own section, so the default timeline
  // excludes them. ?source=github|posts|manual|x picks one; all = everything.
  // The review/rejected queues always include every source.
  const srcParam = q.source;
  const isQueue = q.review === "review" || q.review === "rejected";
  if (srcParam === "posts") {
    wheres.push(`p.source != 'github'`);
  } else if (srcParam === "github") {
    wheres.push(`p.source = 'github'`);
  } else if (srcParam === "manual" || srcParam === "x" || srcParam === "web") {
    wheres.push(`p.source = ?`);
    params.push(srcParam);
  } else if (!srcParam && !isQueue) {
    wheres.push(`p.source != 'github'`);
  }

  if (category.length) {
    joins.push(`JOIN post_categories fpc ON fpc.post_id = p.id JOIN categories fc ON fc.id = fpc.category_id`);
    wheres.push(`fc.slug IN (${category.map(() => "?").join(",")})`);
    params.push(...category);
  }
  if (entity.length || type.length) {
    joins.push(`JOIN post_entities fpe ON fpe.post_id = p.id JOIN entities fe ON fe.id = fpe.entity_id`);
    if (entity.length) {
      wheres.push(`fe.id IN (${entity.map(() => "?").join(",")})`);
      params.push(...entity);
    }
    if (type.length) {
      wheres.push(`fe.type IN (${type.map(() => "?").join(",")})`);
      params.push(...type);
    }
  }
  if (status === "pending" || status === "analyzed" || status === "failed") {
    wheres.push(`p.status = ?`);
    params.push(status);
  }

  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
  const joinSql = [...new Set(joins)].join(" ");
  const order = `ORDER BY COALESCE(p.posted_at, p.created_at) ${sort}, p.id ${sort}`;

  const totalRow = (await db
    .prepare(`SELECT COUNT(DISTINCT p.id) AS n FROM posts p ${joinSql} ${whereSql}`)
    .get(...params)) as { n: number };

  const rows = (await db
    .prepare(`SELECT DISTINCT p.* FROM posts p ${joinSql} ${whereSql} ${order} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)) as unknown as PostRow[];

  return c.json({ items: await attachTags(rows), total: totalRow.n, limit, offset });
});

// ---------------------------------------------------------------------------
// Single post operations
// ---------------------------------------------------------------------------

postsRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  const row = (await activeStorage().prepare(`SELECT * FROM posts WHERE id = ?`).get(id)) as
    | PostRow
    | undefined;
  if (!row) return c.json({ error: "Post not found" }, 404);
  // Anonymous visitors can only open accepted posts
  if (!c.get("admin") && row.review !== "accepted") return c.json({ error: "Post not found" }, 404);
  return c.json(await attachTags([row]));
});

postsRoutes.patch("/:id", async (c) => {
  const db = activeStorage();
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

  const existing = await db.prepare(`SELECT id FROM posts WHERE id = ?`).get(id);
  if (!existing) return c.json({ error: "Post not found" }, 404);

  const b = await c.req.json<Record<string, unknown>>();
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (typeof b.review === "string" && ["review", "accepted", "rejected"].includes(b.review)) {
    fields.push(`review = ?`);
    values.push(b.review);
  }

  const strFields = ["title", "summary", "raw_text", "author_handle", "author_name", "post_url", "posted_at"] as const;
  for (const f of strFields) {
    if (f in b) {
      const v = b[f];
      fields.push(`${f} = ?`);
      values.push(typeof v === "string" ? v.trim().slice(0, 20_000) || null : null);
    }
  }
  fields.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);

  await db.prepare(`UPDATE posts SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
  const row = (await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id)) as PostRow;
  return c.json(await attachTags([row]));
});

postsRoutes.delete("/:id", async (c) => {
  const info = await activeStorage()
    .prepare(`DELETE FROM posts WHERE id = ?`)
    .run(Number(c.req.param("id")));
  if (info.changes === 0) return c.json({ error: "Post not found" }, 404);
  return c.json({ ok: true });
});

postsRoutes.post("/:id/review", async (c) => {
  const db = activeStorage();
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ review?: string }>().catch(() => ({}) as { review?: string });
  if (!Number.isInteger(id) || !b.review || !["review", "accepted", "rejected"].includes(b.review))
    return c.json({ error: "Valid review value required" }, 400);

  const exists = await db.prepare(`SELECT id FROM posts WHERE id = ?`).get(id);
  if (!exists) return c.json({ error: "Post not found" }, 404);

  await db
    .prepare(`UPDATE posts SET review = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .run(b.review as PostReview, id);
  const row = (await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id)) as PostRow;
  return c.json(await attachTags([row]));
});

postsRoutes.post("/:id/retry", async (c) => {
  const db = activeStorage();
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  const exists = await db.prepare(`SELECT id FROM posts WHERE id = ?`).get(id);
  if (!exists) return c.json({ error: "Post not found" }, 404);

  await db
    .prepare(
      `UPDATE posts SET status = 'pending', error = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    )
    .run(id);
  void analyzePost(id).catch(() => {});
  const row = (await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id)) as PostRow;
  return c.json(await attachTags([row]));
});

// ---------------------------------------------------------------------------
// Tag management
// ---------------------------------------------------------------------------

postsRoutes.post("/:id/categories", async (c) => {
  const db = activeStorage();
  const id = Number(c.req.param("id"));
  const { category_id } = await c.req.json<{ category_id?: number }>();
  if (!Number.isInteger(id) || !Number.isInteger(category_id))
    return c.json({ error: "id and category_id required" }, 400);

  const cat = await db.prepare(`SELECT id FROM categories WHERE id = ?`).get(category_id);
  if (!cat) return c.json({ error: "Category not found" }, 404);

  await db.prepare(`INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)`).run(id, category_id);
  await db.prepare(`UPDATE posts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(id);
  const row = (await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id)) as PostRow;
  return c.json(await attachTags([row]));
});

postsRoutes.delete("/:id/categories/:cid", async (c) => {
  const db = activeStorage();
  const id = Number(c.req.param("id"));
  const cid = Number(c.req.param("cid"));
  await db.prepare(`DELETE FROM post_categories WHERE post_id = ? AND category_id = ?`).run(id, cid);
  const row = (await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id)) as PostRow | undefined;
  if (!row) return c.json({ error: "Post not found" }, 404);
  return c.json(await attachTags([row]));
});

postsRoutes.post("/:id/entities", async (c) => {
  const db = activeStorage();
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ name?: string; type?: EntityTypeName }>();
  const name = (body.name ?? "").trim();
  const type = body.type;
  const validTypes: EntityTypeName[] = ["company", "model", "person", "technology", "product"];
  if (!Number.isInteger(id) || !name || !type || !validTypes.includes(type))
    return c.json({ error: "Valid name and type required" }, 400);

  const slug = slugify(name);
  await db
    .prepare(`INSERT INTO entities (type, name, slug) VALUES (?, ?, ?) ON CONFLICT(type, slug) DO NOTHING`)
    .run(type, name, slug);
  const ent = (await db.prepare(`SELECT id FROM entities WHERE type = ? AND slug = ?`).get(type, slug)) as {
    id: number;
  };
  await db.prepare(`INSERT OR IGNORE INTO post_entities (post_id, entity_id) VALUES (?, ?)`).run(id, ent.id);
  await db.prepare(`UPDATE posts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(id);

  const row = (await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id)) as PostRow;
  return c.json(await attachTags([row]));
});

postsRoutes.delete("/:id/entities/:eid", async (c) => {
  const db = activeStorage();
  const id = Number(c.req.param("id"));
  const eid = Number(c.req.param("eid"));
  await db.prepare(`DELETE FROM post_entities WHERE post_id = ? AND entity_id = ?`).run(id, eid);
  const row = (await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id)) as PostRow | undefined;
  if (!row) return c.json({ error: "Post not found" }, 404);
  return c.json(await attachTags([row]));
});

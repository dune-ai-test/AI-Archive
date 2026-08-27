import type { BatchItem, DbAdapter } from "./types";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const TAXONOMY: { slug: string; name: string; emoji: string }[] = [
  { slug: "llms", name: "LLMs", emoji: "🤖" },
  { slug: "research", name: "Research", emoji: "🧠" },
  { slug: "agents", name: "AI Agents", emoji: "🕵️" },
  { slug: "image-gen", name: "Image Generation", emoji: "🎨" },
  { slug: "video-gen", name: "Video Generation", emoji: "🎬" },
  { slug: "voice-audio", name: "Voice / Audio", emoji: "🎙️" },
  { slug: "ai-coding", name: "AI Coding", emoji: "💻" },
  { slug: "companies", name: "Companies", emoji: "🏢" },
  { slug: "tools", name: "Tools", emoji: "🧰" },
  { slug: "products", name: "Products", emoji: "📱" },
  { slug: "news", name: "News", emoji: "📰" },
  { slug: "papers", name: "Papers / Research", emoji: "📚" },
  { slug: "open-source", name: "Open Source", emoji: "🔓" },
];

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

export const SCHEMA_STATEMENTS: { name: string; sql: string }[] = [
  { name: "posts", sql: `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_text TEXT NOT NULL,
      author_handle TEXT,
      author_name TEXT,
      post_url TEXT,
      posted_at TEXT,
      title TEXT,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      analysis_json TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )` },
  { name: "categories", sql: `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT ''
    )` },
  { name: "entities", sql: `CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('company','model','person','technology','product')),
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      UNIQUE (type, slug)
    )` },
  { name: "post_categories", sql: `CREATE TABLE IF NOT EXISTS post_categories (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, category_id)
    )` },
  { name: "post_entities", sql: `CREATE TABLE IF NOT EXISTS post_entities (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, entity_id)
    )` },
  { name: "settings", sql: `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )` },
  { name: "connections", sql: `CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (${NOW})
    )` },
  { name: "repo_meta", sql: `CREATE TABLE IF NOT EXISTS repo_meta (
      post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      stars INTEGER NOT NULL DEFAULT 0,
      language TEXT,
      topics TEXT,
      pushed_at TEXT
    )` },
  { name: "admin_logins", sql: `CREATE TABLE IF NOT EXISTS admin_logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_agent TEXT,
      token TEXT,
      revoked INTEGER NOT NULL DEFAULT 0,
      ok INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (${NOW})
    )` },
  { name: "posts_fts", sql: `CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
      title, summary, raw_text, content='posts', content_rowid='id'
    )` },
  { name: "posts_fts_ai", sql: `CREATE TRIGGER IF NOT EXISTS posts_fts_ai AFTER INSERT ON posts BEGIN
      INSERT INTO posts_fts(rowid, title, summary, raw_text)
      VALUES (new.id, new.title, new.summary, new.raw_text);
    END` },
  { name: "posts_fts_ad", sql: `CREATE TRIGGER IF NOT EXISTS posts_fts_ad AFTER DELETE ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, title, summary, raw_text)
      VALUES ('delete', old.id, old.title, old.summary, old.raw_text);
    END` },
  { name: "posts_fts_au", sql: `CREATE TRIGGER IF NOT EXISTS posts_fts_au AFTER UPDATE OF title, summary, raw_text ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, title, summary, raw_text)
      VALUES ('delete', old.id, old.title, old.summary, old.raw_text);
      INSERT INTO posts_fts(rowid, title, summary, raw_text)
      VALUES (new.id, new.title, new.summary, new.raw_text);
    END` },
];

async function ensureColumn(a: DbAdapter, table: string, column: string, ddl: string): Promise<void> {
  try {
    await a.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`).run();
  } catch (err) {
    // Idempotent on both SQLite ("duplicate column name: x") and D1 REST errors.
    if (!/duplicate column/i.test(String((err as Error)?.message ?? err))) throw err;
  }
}

/**
 * Create the schema + seed + migrate. Safe to call repeatedly and on either backend.
 * DDL runs statement-by-statement so a remote failure points at the exact
 * statement that the backend rejected, and a final verification pass confirms
 * every object actually exists (guards against partially applied batches).
 */
export async function initAdapter(adapter: DbAdapter): Promise<void> {
  for (const { name, sql } of SCHEMA_STATEMENTS) {
    try {
      await adapter.prepare(sql).run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`schema statement '${name}' failed: ${msg}`);
    }
  }

  // Verify all schema objects exist on this backend before declaring it ready.
  const objects = (await adapter
    .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','trigger')`)
    .all()) as { name: string }[];
  const existing = new Set(objects.map((o) => o.name));
  const missing = SCHEMA_STATEMENTS.filter((s) => !existing.has(s.name)).map((s) => s.name);
  if (missing.length) {
    throw new Error(`schema verification failed — missing on backend: ${missing.join(", ")}`);
  }

  // Column migrations — legacy databases may predate these.
  try {
    await ensureColumn(adapter, "posts", "review", `TEXT NOT NULL DEFAULT 'accepted'`);
    await ensureColumn(adapter, "posts", "source", `TEXT NOT NULL DEFAULT 'manual'`);
  } catch {
    /* fresh database below will get columns via CREATE TABLE on next boot */
  }

  // Legacy admin_logins layout → rebuild (disposable data).
  try {
    await adapter.prepare(`SELECT id, user_agent, token FROM admin_logins LIMIT 1`).get();
  } catch (err) {
    if (/no such column/i.test(String((err as Error)?.message ?? err))) {
      await adapter.batch([
        { sql: `DROP TABLE admin_logins` },
        { sql: `CREATE TABLE admin_logins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_agent TEXT,
            token TEXT,
            revoked INTEGER NOT NULL DEFAULT 0,
            ok INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (${NOW})
          )` },
      ]);
    }
  }

  // Seed taxonomy
  const seedItems: BatchItem[] = TAXONOMY.map(
    (c): BatchItem => ({
      sql: `INSERT OR IGNORE INTO categories (slug, name, emoji) VALUES (?, ?, ?)`,
      params: [c.slug, c.name, c.emoji],
    })
  );
  await adapter.batch(seedItems);

  // Migrate legacy single-AI settings into the connections table (once).
  const n = (
    (await adapter.prepare(`SELECT COUNT(*) AS n FROM connections`).get()) as { n: number }
  ).n;
  if (!n) {
    const rows = (await adapter
      .prepare(`SELECT key, value FROM settings WHERE key IN ('ai_base_url','ai_api_key','ai_model')`)
      .all()) as { key: string; value: string | null }[];
    const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));
    const base = map.get("ai_base_url");
    const model = map.get("ai_model");
    if (base && model) {
      const res = await adapter
        .prepare(`INSERT INTO connections (name, base_url, api_key, model) VALUES ('Default', ?, ?, ?)`)
        .run(base, map.get("ai_api_key"), model);
      await adapter
        .prepare(
          `INSERT INTO settings (key, value) VALUES ('active_connection_id', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run(String(res.lastInsertRowid));
    }
  }
}

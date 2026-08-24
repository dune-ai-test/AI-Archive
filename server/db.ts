import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, "archive.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

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

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
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
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('company','model','person','technology','product')),
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      UNIQUE (type, slug)
    );

    CREATE TABLE IF NOT EXISTS post_categories (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS post_entities (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, entity_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS repo_meta (
      post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      stars INTEGER NOT NULL DEFAULT 0,
      language TEXT,
      topics TEXT,
      pushed_at TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
      title, summary, raw_text, content='posts', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS posts_fts_ai AFTER INSERT ON posts BEGIN
      INSERT INTO posts_fts(rowid, title, summary, raw_text)
      VALUES (new.id, new.title, new.summary, new.raw_text);
    END;

    CREATE TRIGGER IF NOT EXISTS posts_fts_ad AFTER DELETE ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, title, summary, raw_text)
      VALUES ('delete', old.id, old.title, old.summary, old.raw_text);
    END;

    CREATE TRIGGER IF NOT EXISTS posts_fts_au AFTER UPDATE OF title, summary, raw_text ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, title, summary, raw_text)
      VALUES ('delete', old.id, old.title, old.summary, old.raw_text);
      INSERT INTO posts_fts(rowid, title, summary, raw_text)
      VALUES (new.id, new.title, new.summary, new.raw_text);
    END;
  `);
}

function seedTaxonomy() {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO categories (slug, name, emoji) VALUES (?, ?, ?)`
  );
  for (const c of TAXONOMY) insert.run(c.slug, c.name, c.emoji);
}

function migrateLegacySettingsToConnections() {
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM connections`).get() as { n: number }).n;
  if (n > 0) return;
  const rows = db
    .prepare(`SELECT key, value FROM settings WHERE key IN ('ai_base_url','ai_api_key','ai_model')`)
    .all() as { key: string; value: string | null }[];
  const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  const base = map.get("ai_base_url");
  const model = map.get("ai_model");
  if (base && model) {
    const info = db
      .prepare(`INSERT INTO connections (name, base_url, api_key, model) VALUES ('Default', ?, ?, ?)`)
      .run(base, map.get("ai_api_key"), model);
    setSettingValue(
      "active_connection_id",
      String(info.lastInsertRowid)
    );
  }
}

function setSettingValue(key: string, value: string) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function ensureReviewColumn() {
  const cols = db.prepare(`PRAGMA table_info(posts)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "review")) {
    // Existing posts are treated as already accepted (visible in timeline)
    db.exec(`ALTER TABLE posts ADD COLUMN review TEXT NOT NULL DEFAULT 'accepted'`);
  }
}

function ensureSourceColumn() {
  const cols = db.prepare(`PRAGMA table_info(posts)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "source")) {
    db.exec(`ALTER TABLE posts ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`);
  }
}

initSchema();
seedTaxonomy();
migrateLegacySettingsToConnections();
ensureReviewColumn();
ensureSourceColumn();
console.log("[db] ready");

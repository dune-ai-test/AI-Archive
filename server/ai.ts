import { slugify } from "./db";
import { activeStorage } from "./storage";
import type { EntityTypeName, TestResult } from "../shared/types";

export const ENTITY_TYPES: EntityTypeName[] = [
  "company",
  "model",
  "person",
  "technology",
  "product",
];

// ---------------------------------------------------------------------------
// Connections (multiple saved AI endpoints; one active)
// ---------------------------------------------------------------------------

export interface ResolvedConfig {
  id: number | null;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
}

interface ConnRow {
  id: number;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
}

function rowToConfig(r: ConnRow): ResolvedConfig {
  return { id: r.id, name: r.name, base_url: r.base_url, api_key: r.api_key, model: r.model };
}

export async function getActiveConfig(): Promise<ResolvedConfig> {
  const db = activeStorage();
  const sid = (await db.prepare(`SELECT value FROM settings WHERE key = 'active_connection_id'`).get()) as
    | { value: string }
    | undefined;
  const id = sid?.value ? Number(sid.value) : null;
  let row: ConnRow | undefined;
  if (id != null && Number.isFinite(id)) {
    row = (await db.prepare(`SELECT * FROM connections WHERE id = ?`).get(id)) as ConnRow | undefined;
  }
  if (!row) {
    row = (await db.prepare(`SELECT * FROM connections ORDER BY id LIMIT 1`).get()) as
      | ConnRow
      | undefined;
  }
  return row ? rowToConfig(row) : { id: null, name: "Default", base_url: "", api_key: "", model: "" };
}

export async function getConfigById(id: number): Promise<ResolvedConfig | null> {
  const db = activeStorage();
  const row = (await db.prepare(`SELECT * FROM connections WHERE id = ?`).get(id)) as
    | ConnRow
    | undefined;
  return row ? rowToConfig(row) : null;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const CATEGORY_SLUGS = [
  "llms", "research", "agents", "image-gen", "video-gen", "voice-audio",
  "ai-coding", "companies", "tools", "products", "news", "papers", "open-source",
].join(", ");

const SYSTEM_PROMPT = `You are an AI-intelligence archivist. The user gives you a social media post (from X/Twitter). Extract structured metadata and reply with ONLY a JSON object, no markdown fences, matching exactly this schema:

{
  "title": string,          // short headline (max 12 words), sentence case
  "summary": string,        // neutral 1-3 sentence summary of the news/fact
  "categories": string[],   // 1-4 items from this list ONLY: ${CATEGORY_SLUGS}
  "entities": [             // 0-10 mentioned entities, deduplicated
    { "type": "company"|"model"|"person"|"technology"|"product", "name": string }
  ]
}

Rules:
- "model" = a specific AI model or model family (e.g. GPT-5, Claude, Llama 4).
- "company" = organizations (OpenAI, Anthropic, Google DeepMind...). Include the company behind a product.
- "person" = named individuals (founders, researchers, executives).
- "technology" = techniques/frameworks/benchmarks (transformers, RAG, MCP, SWE-bench).
- "product" = concrete products/tools/apps that are not models (ChatGPT desktop app, Cursor, Perplexity).
- If the post is not about AI at all, still summarize it faithfully and pick the closest categories.
- Never invent facts. Use names exactly as commonly written.`;

const REPO_SYSTEM_PROMPT = `You are an AI-intelligence archivist. The user gives you a GitHub repository's metadata (stars, language, topics) followed by its README. Extract structured metadata and reply with ONLY a JSON object, no markdown fences, matching exactly this schema:

{
  "title": string,
  "summary": string,
  "categories": string[],   // 1-4 items from this list ONLY: ${CATEGORY_SLUGS}
  "entities": [
    { "type": "company"|"model"|"person"|"technology"|"product", "name": string }
  ]
}

Rules:
- "title": clear descriptive headline (max 12 words) — what the project IS, not just its name.
- "summary": DETAILED, 3-6 sentences. Cover: what the project does, its standout features/capabilities found in the README, notable technical details (supported runtimes/frameworks/integrations/protocols), and why a developer should care. Be concrete and specific — never vague.
- Entities: link the repo to relevant orgs (owner company), models it relates to, technologies/benchmarks it implements.
- Never invent facts not present in the provided content.`;

function buildUserPrompt(post: {
  raw_text: string;
  author_handle?: string | null;
  author_name?: string | null;
  posted_at?: string | null;
}): string {
  const meta: string[] = [];
  if (post.author_handle || post.author_name)
    meta.push(`Author: ${post.author_name ?? ""} ${post.author_handle ?? ""}`.trim());
  if (post.posted_at) meta.push(`Posted at: ${post.posted_at}`);
  return `${meta.length ? meta.join("\n") + "\n\n" : ""}Post:\n"""\n${post.raw_text.slice(0, 8000)}\n"""`;
}

// ---------------------------------------------------------------------------
// Extraction result application
// ---------------------------------------------------------------------------

interface ExtractedPayload {
  title: string;
  summary: string;
  categories: string[];
  entities: { type: EntityTypeName; name: string }[];
}

function parseAiJson(text: string): ExtractedPayload {
  let raw = text.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI response contained no JSON object");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<ExtractedPayload>;

  const validSlugs = new Set(CATEGORY_SLUGS.split(", "));
  const categories = Array.isArray(parsed.categories)
    ? [...new Set(parsed.categories)].filter((c): c is string => typeof c === "string" && validSlugs.has(c)).slice(0, 4)
    : [];

  const seen = new Set<string>();
  const entities = Array.isArray(parsed.entities)
    ? parsed.entities
        .filter(
          (e): e is { type: EntityTypeName; name: string } =>
            e && typeof e.name === "string" && ENTITY_TYPES.includes(e.type)
        )
        .map((e) => ({ type: e.type, name: e.name.trim().slice(0, 80) }))
        .filter((e) => {
          const k = `${e.type}:${slugify(e.name)}`;
          if (!k.split(":")[1] || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 12)
    : [];

  return {
    title: String(parsed.title ?? "").trim().slice(0, 160),
    summary: String(parsed.summary ?? "").trim().slice(0, 1200),
    categories,
    entities,
  };
}

/** Applies extracted metadata in one atomic batch using subselect lookups. */
export async function applyAnalysis(postId: number, payload: ExtractedPayload): Promise<void> {
  const items: { sql: string; params?: unknown[] }[] = [
    { sql: `DELETE FROM post_categories WHERE post_id = ?`, params: [postId] },
    { sql: `DELETE FROM post_entities WHERE post_id = ?`, params: [postId] },
  ];

  for (const slug of payload.categories) {
    items.push({
      sql: `INSERT OR IGNORE INTO post_categories (post_id, category_id)
            VALUES (?, (SELECT id FROM categories WHERE slug = ?))`,
      params: [postId, slug],
    });
  }

  for (const e of payload.entities) {
    const slug = slugify(e.name);
    items.push({
      sql: `INSERT INTO entities (type, name, slug) VALUES (?, ?, ?)
            ON CONFLICT(type, slug) DO NOTHING`,
      params: [e.type, e.name, slug],
    });
    items.push({
      sql: `INSERT OR IGNORE INTO post_entities (post_id, entity_id)
            VALUES (?, (SELECT id FROM entities WHERE type = ? AND slug = ?))`,
      params: [postId, e.type, slug],
    });
  }

  items.push({
    sql: `UPDATE posts SET title = ?, summary = ?, status = 'analyzed', error = NULL,
          analysis_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?`,
    params: [payload.title, payload.summary, JSON.stringify(payload), postId],
  });

  await activeStorage().batch(items);
}

async function markFailed(postId: number, message: string): Promise<void> {
  await activeStorage()
    .prepare(
      `UPDATE posts SET status = 'failed', error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    )
    .run(message.slice(0, 500), postId);
}

// ---------------------------------------------------------------------------
// OpenAI-compatible chat call
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatResponse {
  choices?: {
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason?: string;
  }[];
  error?: { message?: string };
}

async function runChat(
  cfg: { base_url: string; api_key: string; model: string },
  messages: ChatMessage[],
  opts: { maxTokens?: number; timeoutMs?: number; jsonMode?: boolean } = {}
): Promise<string> {
  if (!cfg.base_url || !cfg.model) throw new Error("AI is not configured. Add a connection in Settings.");

  const base = cfg.base_url.replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

  // Adaptive state — some OpenAI-compatible providers/models differ:
  // - newer OpenAI models require max_completion_tokens instead of max_tokens
  // - some don't support response_format (json_object)
  // - reasoning models may return text in reasoning_content or nothing at all
  let tokenKey: "max_tokens" | "max_completion_tokens" = "max_tokens";
  let jsonMode = opts.jsonMode ?? true;

  const buildBody = () => ({
    model: cfg.model,
    messages,
    temperature: 0,
    [tokenKey]: opts.maxTokens ?? 1200,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  });

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(cfg.api_key ? { Authorization: `Bearer ${cfg.api_key}` } : {}),
        },
        body: JSON.stringify(buildBody()),
      });

      const text = await res.text();
      let data: ChatResponse;
      try {
        data = JSON.parse(text) as ChatResponse;
      } catch {
        throw new Error(`Endpoint returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
      }

      if (!res.ok) {
        const msg = data.error?.message ?? text.slice(0, 300);
        if (/max_completion_tokens/i.test(msg) && tokenKey === "max_tokens") {
          tokenKey = "max_completion_tokens";
          continue;
        }
        if (/response_format|json_object|json[_ ]mode/i.test(msg) && jsonMode) {
          jsonMode = false;
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${msg}`);
      }

      const message = data.choices?.[0]?.message;
      const content = (message?.content ?? "").trim();
      if (content) return content;

      // Some reasoning-style endpoints put output only in reasoning_content
      const reasoning = (message?.reasoning_content ?? "").trim();
      if (reasoning) return reasoning;

      // Forced JSON mode can make models emit nothing for non-JSON prompts → retry plain
      if (jsonMode) {
        jsonMode = false;
        continue;
      }

      throw new Error(
        "Endpoint returned an empty message. The model produced no visible output — try a different model."
      );
    }
    throw new Error("Endpoint kept failing after adaptive retries");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

export async function chatCompletion(
  messages: ChatMessage[],
  opts: { maxTokens?: number; timeoutMs?: number; jsonMode?: boolean } = {}
): Promise<string> {
  return runChat(await getActiveConfig(), messages, opts);
}

export async function analyzePost(postId: number): Promise<void> {
  const db = activeStorage();
  const post = (await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(postId)) as
    | { id: number; source?: string; raw_text: string; author_handle: string | null; author_name: string | null; posted_at: string | null }
    | undefined;
  if (!post) return;

  try {
    const isRepo = post.source === "github";
    const content = await chatCompletion(
      [
        { role: "system", content: isRepo ? REPO_SYSTEM_PROMPT : SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(post) },
      ],
      { maxTokens: isRepo ? 1600 : 1200 }
    );
    await applyAnalysis(postId, parseAiJson(content));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(postId, msg.includes("not configured") ? msg : `Analysis failed: ${msg}`);
  }
}

export async function testConfig(
  cfg: { base_url: string; api_key: string; model: string },
  timeoutMs = 20_000
): Promise<TestResult> {
  const started = Date.now();
  try {
    await runChat(cfg, [{ role: "user", content: "Reply with the single word: ok" }], {
      maxTokens: 200,
      timeoutMs,
      jsonMode: false,
    });
    return { ok: true, latency_ms: Date.now() - started, model: cfg.model };
  } catch (err) {
    return { ok: false, latency_ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
  }
}

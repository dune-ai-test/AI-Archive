import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "node:fs";
import path from "node:path";
import "./db";
import { postsRoutes } from "./routes/posts";
import { taxonomyRoutes } from "./routes/taxonomy";
import { settingsRoutes } from "./routes/settings";
import { searchRoutes } from "./routes/search";
import { connectionsRoutes } from "./routes/connections";
import { reposRoutes } from "./routes/repos";

export const app = new Hono<{
  Variables: { admin: boolean };
}>();

// ---------------------------------------------------------------------------
// Optional password protection — set APP_PASSWORD to split public / admin.
// Without it, everything is open (personal single-user mode).
// ---------------------------------------------------------------------------

const PASSWORD = process.env.APP_PASSWORD ?? "";

// Compute admin flag once for every API call
app.use("/api/*", async (c, next) => {
  const provided = c.req.header("x-auth-password") ?? c.req.query("password");
  c.set("admin", !PASSWORD || provided === PASSWORD);
  await next();
});

// Auth status + login (always public)
app.get("/api/auth", (c) => {
  return c.json({ required: Boolean(PASSWORD), authenticated: c.get("admin") });
});

app.post("/api/auth", async (c) => {
  if (!PASSWORD) return c.json({ ok: true });
  const body = await c.req.json<{ password?: string }>().catch(() => ({ password: "" }));
  if (body.password === PASSWORD) return c.json({ ok: true });
  return c.json({ error: "wrong password" }, 401);
});

// Guard: anonymous visitors may only READ accepted content.
// Everything else (writes, settings, connections, review queue) needs admin.
app.use("/api/*", async (c, next) => {
  if (c.get("admin")) return next();
  const path = c.req.path;
  const isPublicRead =
    c.req.method === "GET" &&
    (path === "/api/taxonomy" ||
      path.startsWith("/api/search") ||
      path.startsWith("/api/repos") ||
      path === "/api/health" ||
      path.startsWith("/api/posts"));
  if (isPublicRead) return next();
  return c.json({ error: "unauthorized" }, 401);
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.route("/api/posts", postsRoutes);
app.route("/api/taxonomy", taxonomyRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/connections", connectionsRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/repos", reposRoutes);

app.get("/api/health", (c) => c.json({ ok: true }));

app.onError((err, c) => {
  console.error(`[error] ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api")) return c.json({ error: "not found" }, 404);
  return c.text("Not found", 404);
});

// ---------------------------------------------------------------------------
// Static frontend (production) — serves ./dist with SPA fallback
// ---------------------------------------------------------------------------

const distDir = path.join(process.cwd(), "dist");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use("*", serveStatic({ root: path.relative(process.cwd(), distDir) || "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

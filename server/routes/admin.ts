import { Hono } from "hono";
import { activeStorage } from "../storage";

export const adminRoutes = new Hono<{
  Variables: { admin: boolean };
}>();

// Everything here requires admin (the public-read guard doesn't cover /api/admin)

async function counts(db: ReturnType<typeof activeStorage>) {
  return (await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM posts WHERE review='accepted' AND source!='github') AS posts,
        (SELECT COUNT(*) FROM posts WHERE review='accepted' AND source='github') AS repos,
        (SELECT COUNT(*) FROM posts WHERE review='review') AS pending,
        (SELECT COUNT(*) FROM posts WHERE review='rejected') AS rejected,
        (SELECT COUNT(*) FROM entities) AS entities,
        (SELECT COUNT(*) FROM post_categories) AS categories,
        (SELECT COUNT(*) FROM posts WHERE status='failed') AS failed,
        (SELECT COUNT(*) FROM admin_logins WHERE ok=1) AS logins`
    )
    .get()) as {
    posts: number;
    repos: number;
    pending: number;
    rejected: number;
    entities: number;
    categories: number;
    failed: number;
    logins: number;
  };
}

adminRoutes.get("/stats", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  const db = activeStorage();

  const countsRow = await counts(db);

  // Recent activity — newest posts with their lifecycle state
  const activity = await db
    .prepare(
      `SELECT id, title, raw_text, status, review, source, created_at
       FROM posts ORDER BY id DESC LIMIT 10`
    )
    .all();

  // Posts per week — last 8 weeks (Monday-start buckets)
  const rows = (await db
    .prepare(`SELECT created_at FROM posts WHERE created_at >= datetime('now', '-56 days')`)
    .all()) as { created_at: string }[];

  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7; // Monday = 0
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);

  const weeks: { start: Date; label: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - i * 7);
    weeks.push({
      start,
      label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    });
  }
  const weekStarts = weeks.map((w) => w.start.getTime());
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (t >= weekStarts[i]) {
        weeks[i].count += 1;
        break;
      }
    }
  }

  return c.json({
    counts: countsRow,
    activity,
    weekly: weeks.map(({ label, count }) => ({ label, count })),
  });
});

// Revoke one specific session by login-row id (never the caller's own)
adminRoutes.post("/logins/:id/revoke", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  const myToken = c.req.header("x-auth-token") ?? "";
  const target = (await activeStorage().prepare(`SELECT token, revoked FROM admin_logins WHERE id = ?`).get(id)) as
    | { token: string | null; revoked: number }
    | undefined;
  if (!target || !target.token || target.revoked) return c.json({ error: "No active session on this row" }, 404);
  if (target.token === myToken) return c.json({ error: "This is your current session" }, 400);
  await activeStorage().prepare(`UPDATE admin_logins SET revoked = 1 WHERE id = ?`).run(id);
  return c.json({ ok: true });
});

// Remove a single login-history entry
adminRoutes.delete("/logins/:id", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  const info = await activeStorage().prepare(`DELETE FROM admin_logins WHERE id = ?`).run(id);
  if (!info.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// Revoke every session token except the one making the request
adminRoutes.post("/sessions/logout-all", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  const keep = c.req.header("x-auth-token") ?? "";
  const info = await activeStorage()
    .prepare(`UPDATE admin_logins SET revoked = 1 WHERE token IS NOT NULL AND token != ?`)
    .run(keep);
  return c.json({ ok: true, revoked: info.changes });
});

adminRoutes.get("/logins", async (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  const db = activeStorage();
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);

  /** Short human label from a user-agent string (no IPs stored). */
  function describeDevice(ua: string): string {
    if (!ua) return "Unknown";
    const browser = /Edg\//.test(ua)
      ? "Edge"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
    const os = /iPhone/i.test(ua)
      ? "iPhone"
      : /iPad/i.test(ua)
        ? "iPad"
        : /Android/i.test(ua)
          ? "Android"
          : /Windows/i.test(ua)
            ? "Windows"
            : /Mac OS X|Macintosh/i.test(ua)
              ? "Mac"
              : /Linux/i.test(ua)
                ? "Linux"
                : "Unknown OS";
    return `${browser} · ${os}`;
  }

  const rows = (await db
    .prepare(`SELECT id, user_agent, token, revoked, ok, created_at FROM admin_logins ORDER BY id DESC LIMIT ?`)
    .all(limit)) as unknown as {
    id: number;
    user_agent: string;
    token: string | null;
    revoked: number;
    ok: number;
    created_at: string;
  }[];

  const myToken = c.req.header("x-auth-token") ?? "";

  const totals = (
    (await db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM admin_logins) AS total_all_time,
                (SELECT COUNT(*) FROM admin_logins WHERE ok=0) AS failed_total`
      )
      .get()) as { total_all_time: number; failed_total: number }
  );

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      ok: Boolean(r.ok),
      active: Boolean(r.ok && r.token && !r.revoked),
      current: Boolean(r.token) && r.token === myToken,
      revoked: Boolean(r.revoked),
      device: describeDevice(r.user_agent ?? ""),
      created_at: r.created_at,
    })),
    total_all_time: totals.total_all_time,
    failed_total: totals.failed_total,
  });
});

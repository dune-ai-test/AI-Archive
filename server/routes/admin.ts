import { Hono } from "hono";
import { db } from "../db";

export const adminRoutes = new Hono<{
  Variables: { admin: boolean };
}>();

// Everything here requires admin (the public-read guard doesn't cover /api/admin)

function count(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

adminRoutes.get("/stats", (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);

  const counts = {
    posts: count(`SELECT COUNT(*) AS n FROM posts WHERE review='accepted' AND source!='github'`),
    repos: count(`SELECT COUNT(*) AS n FROM posts WHERE review='accepted' AND source='github'`),
    pending: count(`SELECT COUNT(*) AS n FROM posts WHERE review='review'`),
    rejected: count(`SELECT COUNT(*) AS n FROM posts WHERE review='rejected'`),
    entities: count(`SELECT COUNT(*) AS n FROM entities`),
    categories: count(`SELECT COUNT(*) AS n FROM post_categories`),
    failed: count(`SELECT COUNT(*) AS n FROM posts WHERE status='failed'`),
    logins: count(`SELECT COUNT(*) AS n FROM admin_logins WHERE ok=1`),
  };

  // Recent activity — newest posts with their lifecycle state
  const activity = db
    .prepare(
      `SELECT id, title, raw_text, status, review, source, created_at
       FROM posts ORDER BY id DESC LIMIT 10`
    )
    .all();

  // Posts per week — last 8 weeks (Monday-start buckets)
  const rows = db
    .prepare(`SELECT created_at FROM posts WHERE created_at >= datetime('now', '-56 days')`)
    .all() as { created_at: string }[];

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
    counts,
    activity,
    weekly: weeks.map(({ label, count }) => ({ label, count })),
  });
});

// Revoke every session token except the one making the request
adminRoutes.post("/sessions/logout-all", (c) => {
  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
  const keep = c.req.header("x-auth-token") ?? "";
  const info = db
    .prepare(`UPDATE admin_logins SET revoked = 1 WHERE token IS NOT NULL AND token != ?`)
    .run(keep);
  return c.json({ ok: true, revoked: info.changes });
});

adminRoutes.get("/logins", (c) => {  if (!c.get("admin")) return c.json({ error: "unauthorized" }, 401);
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

  const rows = db
    .prepare(`SELECT id, user_agent, ok, created_at FROM admin_logins ORDER BY id DESC LIMIT ?`)
    .all(limit) as unknown as { id: number; user_agent: string; ok: number; created_at: string }[];

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      ok: Boolean(r.ok),
      device: describeDevice(r.user_agent ?? ""),
      created_at: r.created_at,
    })),
    total_all_time: count(`SELECT COUNT(*) AS n FROM admin_logins`),
    failed_total: count(`SELECT COUNT(*) AS n FROM admin_logins WHERE ok=0`),
  });
});

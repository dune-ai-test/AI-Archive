import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  type LucideIcon,
  AlertTriangle,
  Check,
  DatabaseZap,
  Github,
  History,
  Inbox,
  Layers,
  LogOut,
  Plus,
  Settings,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import RequestsPage from "./RequestsPage";
import { api } from "../api";
import AddPost from "./AddPost";
import SettingsPage from "./SettingsPage";

type Tab = "overview" | "requests" | "add" | "settings" | "logins";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: DatabaseZap },
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "add", label: "Add Post", icon: Plus },
  { id: "logins", label: "Logins", icon: Shield },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function SuperAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: Tab = TABS.some((t) => t.id === raw) ? (raw as Tab) : "overview";

  const setTab = (id: Tab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-full">
      {/* Header + tabs */}
      <div className="sticky top-0 z-10 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">
            Super Admin{" "}
            <span className="ml-1 align-middle text-[12px] font-normal text-faint">control center</span>
          </h1>
          <div className="flex items-center gap-0.5 overflow-x-auto rounded-[9px] bg-elevated p-[3px]">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-all ${
                  tab === id ? "bg-base text-ink shadow-sm" : "text-dim hover:text-ink"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div key={tab} className="fade-up">
        {tab === "overview" && <Overview />}
        {tab === "requests" && <RequestsPage />}
        {tab === "add" && <AddPost />}
        {tab === "logins" && <Logins />}
        {tab === "settings" && <SettingsPage />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview — stat cards, weekly chart, recent activity
// ---------------------------------------------------------------------------

interface StatsPayload {
  counts: {
    posts: number;
    repos: number;
    pending: number;
    rejected: number;
    entities: number;
    categories: number;
    failed: number;
    logins: number;
  };
  activity: {
    id: number;
    title: string | null;
    raw_text: string;
    status: string;
    review: string;
    source: string;
    created_at: string;
  }[];
  weekly: { label: string; count: number }[];
}

function Overview() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<StatsPayload>("/api/admin/stats").then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  if (!data) {
    return (
      <div className="mx-auto grid max-w-[1200px] animate-pulse grid-cols-2 gap-3 px-4 py-6 md:grid-cols-5 md:px-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const { counts, activity, weekly } = data;
  const maxWeek = Math.max(...weekly.map((w) => w.count), 1);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6">
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </span>
          <button onClick={() => window.location.reload()} className="shrink-0 rounded-md border border-danger/40 px-2.5 py-1 font-medium hover:bg-danger/10">
            Retry
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard to="/timeline" icon={History} value={counts.posts} label="Posts" />
        <StatCard to="/repos" icon={Github} value={counts.repos} label="Repositories" />
        <StatCard
          to="/superadmin?tab=requests"
          icon={Inbox}
          value={counts.pending}
          label="Pending"
          highlight={counts.pending > 0 ? "warn" : undefined}
        />
        <StatCard icon={Layers} value={counts.entities} label="Entities" />
        <StatCard
          icon={AlertTriangle}
          value={counts.failed}
          label="Failed"
          highlight={counts.failed > 0 ? "danger" : undefined}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Weekly chart */}
        <div className="rounded-xl border border-line bg-base p-5">
          <h3 className="mb-4 text-[13px] font-medium uppercase tracking-wider text-faint">
            Posts added · last 8 weeks
          </h3>
          <div className="flex h-36 items-end gap-2">
            {weekly.map((w) => (
              <div key={w.label} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[11px] font-medium text-dim">{w.count || ""}</span>
                <div
                  className={`w-full rounded-t-md transition-all ${w.count ? "bg-accent" : "bg-elevated"}`}
                  style={{ height: `${Math.max((w.count / maxWeek) * 100, 4)}%` }}
                  title={`${w.count} posts · week of ${w.label}`}
                />
                <span className="whitespace-nowrap text-[10px] text-faint">{w.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border border-line bg-base p-5">
          <h3 className="mb-4 text-[13px] font-medium uppercase tracking-wider text-faint">Recent activity</h3>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-faint">Nothing yet — add your first post.</p>
          ) : (
            <ul className="max-h-44 space-y-2.5 overflow-y-auto pr-1">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center gap-2.5 text-[13px]">
                  <SourceDot source={a.source} status={a.status} review={a.review} />
                  <Link to={`/post/${a.id}`} className="min-w-0 flex-1 truncate text-dim hover:text-ink">
                    {a.title ?? a.raw_text.slice(0, 60)}
                  </Link>
                  <StateBadge status={a.status} review={a.review} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Secondary stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <MiniStat label="Rejected" value={counts.rejected} />
        <MiniStat label="Category tags" value={counts.categories} />
        <MiniStat label="Admin logins" value={counts.logins} />
      </div>
    </div>
  );
}

function StatCard({
  to,
  icon: Icon,
  value,
  label,
  highlight,
}: {
  to?: string;
  icon: LucideIcon;
  value: number;
  label: string;
  highlight?: "warn" | "danger";
}) {
  const inner = (
    <>
      <Icon size={16} className={highlight === "warn" ? "text-warn" : highlight === "danger" ? "text-danger" : "text-accent-hi"} />
      <div className="mt-2 font-mono text-[22px] font-medium leading-none">{value.toLocaleString()}</div>
      <div className="mt-1 text-[12px] uppercase tracking-wide text-faint">{label}</div>
    </>
  );
  const cls = `block rounded-xl border border-line bg-base p-4 transition-colors hover:border-line-strong ${
    highlight === "warn" ? "border-warn/30" : highlight === "danger" ? "border-danger/30" : ""
  }`;
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between rounded-xl border border-line bg-base px-4 py-3">
      <span className="text-[12px] uppercase tracking-wide text-faint">{label}</span>
      <span className="font-mono text-[16px] font-medium">{value.toLocaleString()}</span>
    </div>
  );
}

function SourceDot({ source, status }: { source: string; status: string; review: string }) {
  if (status === "failed") return <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />;
  if (source === "github") return <Github size={13} className="shrink-0 text-dim" />;
  if (status === "pending") return <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-warn" />;
  return <Check size={13} strokeWidth={3} className="shrink-0 text-ok" />;
}

function StateBadge({ status, review }: { status: string; review: string }) {
  if (review === "rejected") return <span className="text-[11px] text-faint">rejected</span>;
  if (review === "review") return <span className="text-[11px] text-warn">in review</span>;
  if (status === "failed") return <span className="text-[11px] text-danger">failed</span>;
  return <span className="text-[11px] text-faint">accepted</span>;
}

// ---------------------------------------------------------------------------
// Logins — who authenticated as admin (device only, no IPs)
// ---------------------------------------------------------------------------

interface LoginRow {
  id: number;
  ok: boolean;
  active: boolean;
  current: boolean;
  revoked: boolean;
  device: string;
  created_at: string;
}

function Logins() {
  const [items, setItems] = useState<LoginRow[] | null>(null);
  const [logError, setLogError] = useState("");
  const [totals, setTotals] = useState<{ total_all_time: number; failed_total: number } | null>(null);

  const load = () => {
    api
      .get<{ items: LoginRow[]; total_all_time: number; failed_total: number }>("/api/admin/logins")
      .then((r) => {
        setItems(r.items);
        setTotals({ total_all_time: r.total_all_time, failed_total: r.failed_total });
      })
      .catch((e) => {
        setItems([]);
        setLogError(e instanceof Error ? e.message : "Failed to load logins");
      });
  };

  useEffect(load, []);

  const revoke = async (id: number) => {
    await api.post(`/api/admin/logins/${id}/revoke`).catch(() => {});
    load();
  };

  const removeEntry = async (id: number) => {
    await api.del(`/api/admin/logins/${id}`).catch(() => {});
    load();
  };

  if (items === null) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-6 md:px-6">
        <div className="skeleton h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 md:px-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Login activity</h2>
        {totals && (
          <span className="font-mono text-[12px] text-faint">
            {totals.total_all_time} total ·{" "}
            <span className={totals.failed_total > 0 ? "text-danger" : ""}>{totals.failed_total} failed</span>
          </span>
        )}
      </div>

      {logError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> {logError}
          </span>
          <button onClick={() => window.location.reload()} className="shrink-0 rounded-md border border-danger/40 px-2.5 py-1 font-medium hover:bg-danger/10">
            Retry
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
          <Shield size={28} className="mx-auto mb-3 text-faint" strokeWidth={1.5} />
          <p className="text-[13px] text-dim">No login attempts recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-base">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Device</th>
                <th className="px-4 py-2.5 text-right font-medium">Result</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className={`border-b border-line last:border-0 ${r.revoked ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5 text-dim">
                    {new Date(r.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5">{r.device}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-ok">
                        <Check size={12} strokeWidth={3} /> Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-danger">
                        <X size={12} strokeWidth={3} /> Failed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.current && (
                        <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[11px] font-medium text-accent-hi">This device</span>
                      )}
                      {r.active && !r.current && (
                        <button
                          onClick={() => revoke(r.id)}
                          title="Log out this device"
                          className="rounded-md border border-line p-1.5 text-dim transition-colors hover:border-warn/40 hover:text-warn"
                        >
                          <LogOut size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => removeEntry(r.id)}
                        title="Remove this entry"
                        className="rounded-md border border-line p-1.5 text-faint transition-colors hover:border-danger/40 hover:text-danger"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-faint">
        Every unlock attempt is recorded with time and device only — passwords and IP addresses are never stored.
      </p>
    </div>
  );
}


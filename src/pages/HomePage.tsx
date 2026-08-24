import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  DatabaseZap,
  Github,
  History,
  Inbox,
  Layers,
  LayoutGrid,
  Search,
  Shield,
  Sparkles,
} from "lucide-react";
import { api } from "../api";

interface Stats {
  posts: number;
  repos: number;
  pending: number | null;
}

export default function HomePage({ isAdmin = true }: { isAdmin?: boolean }) {
  const [stats, setStats] = useState<Stats>({ posts: 0, repos: 0, pending: null });

  useEffect(() => {
    api
      .get<{ total: number }>("/api/posts?source=posts&limit=1")
      .then((r) => setStats((s) => ({ ...s, posts: r.total })))
      .catch(() => {});
    api
      .get<{ total: number }>("/api/repos?limit=1")
      .then((r) => setStats((s) => ({ ...s, repos: r.total })))
      .catch(() => {});
    if (!isAdmin) return;
    api
      .get<{ total: number }>("/api/posts?review=review&limit=1")
      .then((r) => setStats((s) => ({ ...s, pending: r.total })))
      .catch(() => setStats((s) => ({ ...s, pending: null })));
  }, [isAdmin]);

  const features = [
    {
      icon: Sparkles,
      title: "AI does the filing",
      desc: "Paste any post — the model writes the summary, detects companies, models, people and technologies, and tags everything automatically.",
    },
    {
      icon: Layers,
      title: "Every source, one database",
      desc: "X posts, GitHub repositories with live stars and freshness, articles and embed code — all normalized into a single searchable timeline.",
    },
    {
      icon: Search,
      title: "Find anything in seconds",
      desc: "Full-text search across every summary and raw post, plus instant ⌘K lookup of companies, models and topics you follow.",
    },
  ];

  const sections = [
    { to: "/timeline", icon: History, label: "Timeline", desc: "The chronological feed" },
    { to: "/browse", icon: LayoutGrid, label: "Browse", desc: "Filter by category or entity" },
    { to: "/repos", icon: Github, label: "Repositories", desc: "Curated open source" },
    ...(isAdmin
      ? [{ to: "/superadmin?tab=requests", icon: Shield, label: "Super Admin", desc: "Review queue & settings" }]
      : []),
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px]"
        style={{
          background:
            "radial-gradient(700px 280px at 50% -60px, rgba(10,132,255,0.16), transparent 70%)",
        }}
      />

      {/* ------------------------------ Hero ------------------------------ */}
      <section className="relative mx-auto max-w-[900px] px-6 pb-16 pt-20 text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] font-medium text-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Personal AI intelligence archive
        </span>

        <h1 className="mx-auto max-w-[640px] text-[40px] font-semibold leading-[1.1] tracking-tight md:text-[52px]">
          Everything happening in AI,{" "}
          <span className="bg-gradient-to-r from-accent-hi via-et-model to-et-company bg-clip-text text-transparent">
            organized for you.
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-[520px] text-[16px] leading-relaxed text-dim">
          Stop losing track of launches, research and repos. Paste anything — AI extracts,
          summarizes and files it into a knowledge base that grows smarter every day.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/timeline"
            className="flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-medium text-white transition-colors hover:bg-accent-hi"
          >
            Explore the archive
            <ArrowRight size={15} />
          </Link>
          <Link
            to="/browse"
            className="flex h-11 items-center gap-2 rounded-xl border border-line bg-elevated px-6 text-sm font-medium text-dim transition-colors hover:border-line-strong hover:text-ink"
          >
            Browse database
          </Link>
        </div>

        {(stats.posts > 0 || stats.repos > 0) && (
          <div className="mt-10 flex items-center justify-center gap-8">
            <Stat value={stats.posts} label="posts archived" />
            <span className="h-8 w-px bg-line" />
            <Stat value={stats.repos} label="repos tracked" />
          </div>
        )}
      </section>

      {/* ---------------------------- Features ---------------------------- */}
      <section className="relative mx-auto max-w-[900px] px-6 pb-20">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-line bg-base p-6 transition-colors hover:border-line-strong">
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-subtle text-accent-hi">
                <Icon size={18} />
              </span>
              <h3 className="text-[15px] font-semibold">{title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-dim">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------- Jump to section -------------------------- */}
      <section className="relative mx-auto max-w-[900px] px-6 pb-20">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-faint">Jump back in</h2>
          <Link to="/timeline" className="flex items-center gap-1 text-[13px] text-accent-hi hover:underline">
            Open timeline <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {sections.map(({ to, icon: Icon, label, desc }) => (
            <Link
              key={label}
              to={to}
              className="group relative overflow-hidden rounded-xl border border-line bg-base p-4 transition-all duration-150 hover:-translate-y-px hover:border-line-strong"
            >
              <Icon size={18} className="mb-3 text-accent-hi" />
              <div className="text-sm font-semibold">{label}</div>
              <div className="mt-0.5 text-[12px] leading-relaxed text-faint">{desc}</div>
              {to.startsWith("/superadmin") && stats.pending !== null && stats.pending > 0 && (
                <span className="absolute right-3 top-3 rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn">
                  {stats.pending}
                </span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------ Footer ------------------------------ */}
      <footer className="relative border-t border-line py-8 text-center">
        <p className="flex items-center justify-center gap-2 text-[12px] text-faint">
          <DatabaseZap size={13} />
          Archive AI-X — your personal AI intelligence database
        </p>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-[22px] font-medium text-ink">{value.toLocaleString()}</div>
      <div className="mt-0.5 text-[12px] uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}

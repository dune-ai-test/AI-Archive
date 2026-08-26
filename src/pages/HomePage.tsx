import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { api } from "../api";

interface Stats {
  posts: number;
  repos: number;
  categories: number;
  pending: number | null;
}

interface RecentPost {
  id: number;
  title: string | null;
  raw_text: string;
  created_at: string;
}

export default function HomePage({ isAdmin = true }: { isAdmin?: boolean }) {
  const [stats, setStats] = useState<Stats>({ posts: 0, repos: 0, categories: 0, pending: null });
  const [recent, setRecent] = useState<RecentPost[]>([]);

  useEffect(() => {
    api
      .get<{ total: number }>("/api/posts?source=posts&limit=1")
      .then((r) => setStats((s) => ({ ...s, posts: r.total })))
      .catch(() => {});
    api
      .get<{ total: number }>("/api/repos?limit=1")
      .then((r) => setStats((s) => ({ ...s, repos: r.total })))
      .catch(() => {});
    api
      .get<{ categories: { count?: number }[] }>("/api/taxonomy?source=posts")
      .then((r) =>
        setStats((s) => ({
          ...s,
          categories: r.categories.filter((c) => (c.count ?? 0) > 0).length,
        }))
      )
      .catch(() => {});
    if (!isAdmin) return;
    api
      .get<{ total: number }>("/api/posts?review=review&limit=1")
      .then((r) => setStats((s) => ({ ...s, pending: r.total })))
      .catch(() => setStats((s) => ({ ...s, pending: null })));
    api
      .get<{ items: RecentPost[] }>("/api/posts?limit=5")
      .then((r) => setRecent(r.items))
      .catch(() => {});
  }, [isAdmin]);

  return (
    <div className="relative">
      {/* ============================ HERO ============================ */}
      <section className="mx-auto max-w-[1100px] px-6 pt-16 pb-12 md:px-10 md:pt-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-faint">
          Archive AI-X — a personal intelligence database
        </p>

        <h1 className="mt-7 max-w-[760px] text-[44px] font-semibold leading-[1.04] tracking-tight md:text-[64px]">
          The AI era,
          <br />
          properly archived.
        </h1>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-8">
          <p className="max-w-[430px] text-[15px] leading-relaxed text-dim">
            Every launch, model release and repository worth remembering — captured
            from X, GitHub and beyond, summarized by AI, and filed so you can
            actually find it again.
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/timeline"
              className="flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-medium text-white transition-colors hover:bg-accent-hi"
            >
              Open the timeline
              <ArrowUpRight size={15} />
            </Link>
            <Link
              to="/browse"
              className="flex h-11 items-center rounded-xl border border-line bg-elevated px-6 text-sm font-medium text-dim transition-colors hover:border-line-strong hover:text-ink"
            >
              Browse database
            </Link>
          </div>
        </div>

        {/* Ledger */}
        <div className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-none border border-line bg-line md:grid-cols-3">
          <LedgerCell value={String(stats.posts)} label="Posts archived" />
          <LedgerCell value={String(stats.repos)} label="Repositories tracked" />
          <LedgerCell value={String(stats.categories)} label="Categories" />
        </div>
      </section>

      {/* ===================== LATEST ADDITIONS ===================== */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1100px] px-6 py-12 md:px-10">
          <div className="mb-6 flex items-baseline justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-faint">
              Latest additions
            </p>
            <Link
              to="/timeline"
              className="group flex items-center gap-1 text-[13px] text-accent-hi hover:underline"
            >
              Full timeline <ArrowUpRight size={12} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="py-8 text-[14px] text-faint">
              Nothing archived yet. Paste your first post from the Super Admin console.
            </p>
          ) : (
            <ul>
              {recent.map((p, i) => (
                <li key={p.id} className="border-t border-line first:border-t-0">
                  <Link
                    to={`/post/${p.id}`}
                    className="group flex items-center gap-5 py-4 transition-colors hover:bg-surface"
                  >
                    <span className="w-8 shrink-0 font-mono text-[12px] text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] text-dim group-hover:text-ink">
                      {p.title ?? p.raw_text.slice(0, 90)}
                    </span>
                    <span className="hidden shrink-0 font-mono text-[12px] text-faint sm:block">
                      {(p.created_at ?? "").slice(0, 10)}
                    </span>
                    <ArrowUpRight
                      size={14}
                      className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ========================= HOW IT WORKS ========================= */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1100px] px-6 py-16 md:px-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-faint">How it works</p>

          <div className="mt-8">
            {[
              {
                n: "01",
                t: "Capture anything",
                d: "An X post, a GitHub repo, embed code or plain notes — paste it into one box. The source is detected automatically.",
              },
              {
                n: "02",
                t: "AI files it for you",
                d: "A summary gets written. Companies, models, people and technologies get extracted and linked. You review before it publishes.",
              },
              {
                n: "03",
                t: "Find it forever",
                d: "Full-text search across every summary and raw post, browsable by category, company, model or technology — years from now.",
              },
            ].map(({ n, t, d }) => (
              <div key={n} className="grid grid-cols-[48px_1fr] gap-4 border-t border-line py-7 md:grid-cols-[80px_260px_1fr] md:gap-8">
                <span className="font-mono text-[13px] text-faint">{n}</span>
                <h3 className="text-[17px] font-semibold leading-snug">{t}</h3>
                <p className="col-span-2 mt-1 text-[14px] leading-relaxed text-dim md:col-span-1 md:mt-0">
                  {d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================== SECTIONS ========================== */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1100px] px-6 py-16 md:px-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-faint">Inside the archive</p>
          <div className="mt-8 grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3">
            <SectionTile to="/timeline" title="Timeline" desc="Chronological feed, grouped by day." />
            <SectionTile to="/browse" title="Browse" desc="Filter by category, company or model." />
            <SectionTile to="/repos" title="Repositories" desc="GitHub projects with stars & freshness." />
          </div>
        </div>
      </section>

      {/* =========================== FOOTER =========================== */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-8 md:px-10">
          <p className="font-mono text-[12px] text-faint">© {new Date().getFullYear()} Archive AI-X</p>
          <p className="font-mono text-[12px] text-faint">
            Built by one curator{isAdmin && stats.pending !== null && stats.pending > 0
              ? ` · ${stats.pending} awaiting review`
              : ""}
          </p>
        </div>
      </footer>
    </div>
  );
}

function LedgerCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-base px-6 py-6">
      <div className="font-mono text-[30px] font-medium leading-none tracking-tight">{value}</div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-faint">{label}</div>
    </div>
  );
}

function SectionTile({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} className="group bg-base p-6 transition-colors hover:bg-elevated">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold">{title}</span>
        <ArrowUpRight
          size={15}
          className="text-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-hi"
        />
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-dim">{desc}</p>
    </Link>
  );
}

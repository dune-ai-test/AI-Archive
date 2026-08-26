import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ExternalLink, Github, Star, GitCommitHorizontal, Trash2 } from "lucide-react";
import { api } from "../api";
import { SkeletonCard } from "../components/PostCard";
import EmptyState from "../components/EmptyState";
import { CategoryList, CategoryChips, useSectionCategories } from "../components/Categories";
import { StatusBadge } from "../components/StatusBadge";

interface RepoItem {
  id: number;
  title: string | null;
  summary: string | null;
  raw_text: string;
  author_handle: string | null;
  post_url: string | null;
  status: "pending" | "analyzed" | "failed";
  review: string;
  created_at: string;
  meta: {
    full_name: string;
    stars: number;
    language: string | null;
    topics: string[];
    pushed_at: string | null;
  };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function ReposPage() {
  const [items, setItems] = useState<RepoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"recent" | "stars">("recent");
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    api
      .get<{ authenticated: boolean }>("/api/auth")
      .then((r) => setIsAdmin(r.authenticated))
      .catch(() => {});
  }, []);
  const cats = useSectionCategories("/repos");

  const setCategory = (slug: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (slug) next.set("category", slug);
    else next.delete("category");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    setLoading(true);
    const catQ = category ? `&category=${encodeURIComponent(category)}` : "";
    api
      .get<{ items: RepoItem[]; total: number }>(`/api/repos?sort=${sort}${catQ}`)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sort, category]);

  return (
    <div className="mx-auto flex max-w-[1200px] gap-6 px-4 py-6 md:px-6">
      {/* Category rail — desktop */}
      <div className="hidden w-[210px] shrink-0 self-start lg:block">
        <div className="sticky top-[72px]">
          <CategoryList cats={cats} activeSlug={category} onSelect={setCategory} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
      {/* Mobile category chips */}
      <CategoryChips cats={cats} activeSlug={category} onSelect={setCategory} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          Repositories <span className="ml-1 align-middle font-mono text-[13px] font-normal text-faint">{total}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-[9px] bg-elevated p-[3px]">
            {(["recent", "stars"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`rounded-[7px] px-3 py-1 text-[12px] font-medium transition-all ${
                  sort === s ? "bg-base text-ink shadow-sm" : "text-dim hover:text-ink"
                }`}
              >
                {s === "recent" ? "Recently added" : "Most stars"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Github}
          title="No repositories yet"
          hint="Paste any github.com/owner/repo link in Add Post — the README, stars and metadata are fetched automatically, then AI writes the summary."
          action={
            <Link
              to="/superadmin?tab=add"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hi"
            >
              Add a repo
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <RepoCard key={r.id} repo={r} isAdmin={isAdmin} onDeleted={() => api.get<{ items: RepoItem[]; total: number }>(`/api/repos?sort=${sort}${category ? `&category=${encodeURIComponent(category)}` : ""}`).then((x) => { setItems(x.items); setTotal(x.total); }).catch(() => {})} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

function RepoCard({
  repo,
  isAdmin,
  onDeleted,
}: {
  repo: RepoItem;
  isAdmin: boolean;
  onDeleted: () => void;
}) {
  const navigate = useNavigate();
  const m = repo.meta;
  const remove = async () => {
    await api.del(`/api/posts/${repo.id}`).catch(() => {});
    onDeleted();
  };
  return (
    <article
      onClick={() => navigate(`/post/${repo.id}`)}
      className="fade-up group relative cursor-pointer rounded-xl border border-line bg-base p-4 transition-all duration-150 hover:-translate-y-px hover:border-line-strong"
    >
      {isAdmin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            void remove();
          }}
          aria-label="Delete repository"
          title="Delete from archive"
          className="absolute right-3 top-3 rounded-md p-1.5 text-faint opacity-0 transition-all hover:bg-surface hover:text-danger focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      )}
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Github size={15} className="shrink-0 text-dim" />
        <a
          href={repo.post_url ?? undefined}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="truncate font-mono text-[14px] font-medium text-accent-hi hover:underline"
        >
          {m.full_name}
        </a>
        {repo.status !== "analyzed" && <StatusBadge status={repo.status} />}
        <span className="ml-auto flex items-center gap-2 text-[12px] text-faint">
          {m.pushed_at && (
            <span className="flex items-center gap-1" title="Last upstream push">
              <GitCommitHorizontal size={12} /> {timeAgo(m.pushed_at)}
            </span>
          )}
        </span>
      </div>

      {repo.title && <h3 className="text-[15px] font-semibold leading-snug text-ink">{repo.title}</h3>}
      {(repo.summary || (!repo.title && repo.raw_text)) && (
        <p className={`mt-1 text-[13px] leading-relaxed text-dim ${!repo.title ? "line-clamp-3" : ""}`}>
          {repo.summary ?? repo.raw_text.slice(0, 220)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-2.5 text-[12px] text-faint">
        <span className="flex items-center gap-1 font-medium text-dim">
          <Star size={12} className="text-warn" /> {formatStars(m.stars)}
        </span>
        {m.language && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-et-tech" />
            {m.language}
          </span>
        )}
        {m.topics.slice(0, 5).map((t) => (
          <span key={t} className="rounded-full bg-elevated px-2 py-0.5 font-mono text-[11px] text-faint">
            {t}
          </span>
        ))}
        {repo.post_url && (
          <a
            href={repo.post_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto hover:text-dim"
            aria-label="Open on GitHub"
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </article>
  );
}

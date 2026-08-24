import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SearchX } from "lucide-react";
import { api } from "../api";
import PostCard, { SkeletonCard } from "../components/PostCard";
import EmptyState from "../components/EmptyState";
import { Highlight } from "../components/Highlight";
import type { PostListItem } from "../../shared/types";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [input, setInput] = useState(q);
  const [items, setItems] = useState<PostListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!input.trim()) {
      setItems([]);
      setSearched("");
      return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      api
        .get<{ items: PostListItem[] }>(`/api/search?q=${encodeURIComponent(input)}&limit=50`)
        .then((r) => {
          setItems(r.items);
          setSearched(input.trim());
          setSearchParams(input.trim() ? { q: input.trim() } : {}, { replace: true });
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, setSearchParams]);

  const openPost = useCallback((id: number) => navigate(`/post/${id}`), [navigate]);

  return (
    <div className="mx-auto max-w-[860px] px-4 py-6 md:px-6">
      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search posts, companies, models…"
        className="h-12 w-full rounded-xl border border-line bg-elevated px-4 text-[15px] outline-none placeholder:text-faint focus:border-accent"
      />

      <div className="mb-4 mt-4 flex items-center justify-between">
        <span className="text-[13px] text-dim">
          {searched ? (
            <>
              Results for <span className="font-medium text-ink">"{searched}"</span> · {items.length}
            </>
          ) : (
            "Type to search your archive — titles, summaries, raw text and entity names."
          )}
        </span>
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : searched && items.length === 0 && !loading ? (
        <EmptyState
          icon={SearchX}
          title="No matches found"
          hint={`Nothing in the archive matches "${searched}". Try different keywords.`}
        />
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <SearchCard key={p.id} post={p} query={searched} onOpen={() => openPost(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchCard({
  post,
  query,
  onOpen,
}: {
  post: PostListItem;
  query: string;
  onOpen: () => void;
}) {
  const excerpt = useMemoExcerpt(post.raw_text, query);
  return (
    <article
      onClick={onOpen}
      className="fade-up cursor-pointer rounded-xl border border-line bg-elevated p-4 transition-all duration-150 hover:-translate-y-px hover:border-line-strong"
    >
      {post.title && (
        <h3 className="mb-1.5 text-base font-semibold leading-snug text-ink">
          <Highlight text={post.title} query={query} />
        </h3>
      )}
      {post.summary && (
        <p className="mb-2 line-clamp-2 text-[13px] leading-relaxed text-dim">
          <Highlight text={post.summary} query={query} />
        </p>
      )}
      <p className="mb-3 border-l-2 border-line pl-3 font-mono text-[12px] leading-relaxed text-faint">
        <Highlight text={excerpt} query={query} />
      </p>
      <footer className="flex items-center gap-2 text-[12px] text-faint">
        <span className="font-mono">{post.author_handle || post.author_name || "unknown"}</span>
        <span>·</span>
        <span>{(post.posted_at ?? post.created_at).slice(0, 10)}</span>
      </footer>
    </article>
  );
}

function useMemoExcerpt(text: string, query: string): string {
  if (!query.trim()) return text.slice(0, 160);
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase().split(/\s+/)[0]);
  if (idx === -1) return text.slice(0, 160);
  const start = Math.max(0, idx - 60);
  return (start > 0 ? "…" : "") + text.slice(start, idx + 120);
}

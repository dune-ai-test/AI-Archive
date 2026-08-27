import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import type { PostListItem } from "../../shared/types";
import { CategoryChip, EntityChip } from "./Chips";
import { StatusBadge } from "./StatusBadge";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function PostCard({ post }: { post: PostListItem }) {
  const navigate = useNavigate();
  const cats = post.categories ?? [];
  const ents = post.entities ?? [];
  const visible = ents.slice(0, 6);
  const extra = ents.length - visible.length;

  return (
    <article
      onClick={() => navigate(`/post/${post.id}`)}
      className="fade-up cursor-pointer rounded-xl border border-line bg-base p-4 transition-all duration-150 hover:-translate-y-px hover:border-line-strong"
    >
      {post.title ? (
        <h3 className="mb-1.5 text-base font-semibold leading-snug text-ink">{post.title}</h3>
      ) : (
        <h3 className="mb-1.5 line-clamp-2 text-base font-medium leading-snug text-dim">{post.raw_text}</h3>
      )}
      {post.summary && <p className="line-clamp-2 text-[13px] leading-relaxed text-dim">{post.summary}</p>}

      {(cats.length > 0 || ents.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {cats.map((c) => (
            <CategoryChip
              key={`c${c.id}`}
              category={c}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/?category=${c.slug}`);
              }}
            />
          ))}
          {visible.map((en) => (
            <EntityChip
              key={`e${en.id}`}
              entity={en}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/?entity=${en.id}`);
              }}
            />
          ))}
          {extra > 0 && (
            <span className="text-[12px] text-faint">+{extra} more</span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5 text-[12px] text-faint">
        <span className="font-mono">{post.author_handle || post.author_name || "unknown"}</span>
        <span>·</span>
        <span>{formatTime(post.posted_at ?? post.created_at)}</span>
        {post.post_url && (
          <a
            href={post.post_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Open source post"
            className="ml-0.5 rounded p-0.5 hover:text-dim"
          >
            <ExternalLink size={13} />
          </a>
        )}
        <span className="ml-auto">
          {post.status !== "analyzed" && <StatusBadge status={post.status} />}
        </span>
      </div>

      {post.status === "failed" && post.error && (
        <p className="mt-2 line-clamp-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-[12px] text-danger">{post.error}</p>
      )}
    </article>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-line bg-elevated p-4">
      <div className="skeleton mb-2 h-4 w-2/3" />
      <div className="skeleton mb-1 h-3 w-full" />
      <div className="skeleton mb-3 h-3 w-5/6" />
      <div className="flex gap-2">
        <div className="skeleton h-6 w-20 rounded-full" />
        <div className="skeleton h-6 w-24 rounded-full" />
        <div className="skeleton h-6 w-16 rounded-full" />
      </div>
      <div className="skeleton mt-3 h-3 w-40" />
    </div>
  );
}

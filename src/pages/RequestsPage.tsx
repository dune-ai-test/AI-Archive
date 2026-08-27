import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, Inbox, RefreshCw, X } from "lucide-react";
import { api } from "../api";
import { usePostList } from "../hooks/usePostList";
import PostCard, { SkeletonCard } from "../components/PostCard";
import EmptyState from "../components/EmptyState";
import { CategoryChip, EntityChip } from "../components/Chips";
import { StatusBadge } from "../components/StatusBadge";
import { invalidateTaxonomy } from "../components/CommandPalette";
import type { PostListItem } from "../../shared/types";

export default function RequestsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { items, total, loading, reload } = usePostList({ review: "review", limit: 100 }, refreshKey);
  const [busyId, setBusyId] = useState<number | null>(null);

  const act = async (id: number, review: "accepted" | "rejected") => {
    setBusyId(id);
    try {
      await api.patch(`/api/posts/${id}/review`, { review });
      invalidateTaxonomy();
      if (review === "accepted") setRefreshKey((k) => k + 1);
      else reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[860px] px-4 py-6 md:px-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Requests</h1>
        <span className="font-mono text-[12px] text-faint">
          {total} waiting · accept to publish on the timeline
        </span>
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests waiting"
          hint="Everything you analyze lands here first. Accept a post to add it to your timeline — or reject it to discard."
          action={
            <Link
              to="/superadmin?tab=add"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hi"
            >
              Add Post
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <RequestCard key={p.id} post={p} busy={busyId === p.id} onAccept={() => act(p.id, "accepted")} onReject={() => act(p.id, "rejected")} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({
  post,
  busy,
  onAccept,
  onReject,
  onChanged,
}: {
  post: PostListItem;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onChanged: () => void;
}) {
  const retry = async () => {
    await api.post(`/api/posts/${post.id}/retry`).catch(() => {});
    onChanged();
  };

  return (
    <article className="fade-up rounded-xl border border-line bg-base p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <StatusBadge status={post.status} />
        <span className="font-mono text-[11px] text-faint">
          {(post.posted_at ?? post.created_at).slice(0, 10)} · {post.author_handle || post.author_name || "unknown"}
          {post.post_url && (
            <a href={post.post_url} target="_blank" rel="noreferrer" aria-label="Open source post" className="ml-1.5 inline-block align-middle hover:text-dim">
              <ExternalLink size={12} />
            </a>
          )}
        </span>
      </div>

      {post.title ? (
        <Link to={`/post/${post.id}`} className="block text-base font-semibold leading-snug text-ink hover:text-accent-hi">
          {post.title}
        </Link>
      ) : (
        <Link to={`/post/${post.id}`} className="line-clamp-2 block text-sm font-medium leading-snug text-dim hover:text-accent-hi">
          {post.raw_text}
        </Link>
      )}
      {post.summary && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-dim">{post.summary}</p>}

      {((post.categories ?? []).length > 0 || (post.entities ?? []).length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {(post.categories ?? []).map((c) => (
            <CategoryChip key={`c${c.id}`} category={c} />
          ))}
          {(post.entities ?? []).slice(0, 6).map((en) => (
            <EntityChip key={`e${en.id}`} entity={en} />
          ))}
        </div>
      )}

      {post.status === "failed" && post.error && (
        <p className="mt-3 line-clamp-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-[12px] text-danger">{post.error}</p>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {post.status === "failed" ? (
          <>
            <button
              onClick={retry}
              disabled={busy}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-dim hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={13} /> Retry analysis
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-dim hover:border-line-strong hover:text-danger disabled:opacity-50"
            >
              <X size={13} /> Discard
            </button>
          </>
        ) : post.status === "analyzed" ? (
          <>
            <button
              onClick={onAccept}
              disabled={busy}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-ok/15 px-3 text-[13px] font-medium text-ok hover:bg-ok/25 disabled:opacity-50"
            >
              <Check size={14} strokeWidth={3} /> Accept
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-dim hover:border-line-strong hover:text-danger disabled:opacity-50"
            >
              <X size={13} /> Reject
            </button>
          </>
        ) : (
          <span className="text-[12px] text-faint">Analyzing… you can accept once it's done.</span>
        )}

        <Link to={`/post/${post.id}`} className="ml-auto text-[12px] text-faint hover:text-ink">
          View / edit →
        </Link>
      </div>
    </article>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  Check,
  ExternalLink,
  Github,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import { CategoryChip, EntityChip, ENTITY_TYPE_LABELS } from "../components/Chips";
import { invalidateTaxonomy, loadTaxonomy } from "../components/CommandPalette";
import { StatusBadge } from "../components/StatusBadge";
import type { Category, EntityTypeName, PostDetail, TaxonomyResponse } from "../../shared/types";

const ENTITY_TYPES: EntityTypeName[] = ["company", "model", "person", "technology", "product"];

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tax, setTax] = useState<TaxonomyResponse | null>(null);

  // edit form state
  const [form, setForm] = useState({ title: "", summary: "", raw_text: "" });
  // add-entity form
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityType, setNewEntityType] = useState<EntityTypeName>("company");
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(() => {
    if (!id) return;
    api
      .get<PostDetail>(`/api/posts/${id}`)
      .then((p) => {
        setPost(p);
        setNotFound(false);
      })
      .catch((e) => {
        if (e.status === 404) setNotFound(true);
      });
  }, [id]);

  useEffect(load, [load]);
  useEffect(() => {
    loadTaxonomy().then(setTax);
  }, []);

  const startEdit = () => {
    if (!post) return;
    setForm({ title: post.title ?? "", summary: post.summary ?? "", raw_text: post.raw_text });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!post) return;
    try {
      await api.patch(`/api/posts/${post.id}`, form);
      setEditing(false);
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeCategory = async (cid: number) => {
    if (!post) return;
    await api.del(`/api/posts/${post.id}/categories/${cid}`).catch(() => {});
    load();
  };

  const removeEntity = async (eid: number) => {
    if (!post) return;
    await api.del(`/api/posts/${post.id}/entities/${eid}`).catch(() => {});
    load();
  };

  const addCategory = async (cid: string) => {
    if (!post || !cid) return;
    try {
      await api.post(`/api/posts/${post.id}/categories`, { category_id: Number(cid) });
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const addEntity = async () => {
    if (!post || !newEntityName.trim()) return;
    try {
      await api.post(`/api/posts/${post.id}/entities`, { name: newEntityName.trim(), type: newEntityType });
      setNewEntityName("");
      setShowEntityForm(false);
      invalidateTaxonomy();
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const retryAnalysis = async () => {
    if (!post) return;
    setActionError("");
    try {
      await api.post(`/api/posts/${post.id}/retry`);
      // Poll until finished
      const timer = setInterval(async () => {
        const p = await api.get<PostDetail>(`/api/posts/${post.id}`);
        if (p.status !== "pending") {
          clearInterval(timer);
          setPost(p);
        }
      }, 1500);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const doDelete = async () => {
    if (!post) return;
    try {
      await api.del(`/api/posts/${post.id}`);
      invalidateTaxonomy();
      navigate("/");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-[800px] px-4 py-6 md:px-6">
        <EmptyState
          icon={AlertTriangle}
          title="Post not found"
          hint="It may have been deleted."
          action={
            <Link to="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hi">
              Back to timeline
            </Link>
          }
        />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-[800px] animate-pulse space-y-3 px-4 py-6 md:px-6">
        <div className="skeleton h-6 w-2/3" />
        <div className="skeleton h-3 w-1/3" />
        <div className="skeleton h-32 w-full rounded-xl" />
      </div>
    );
  }

  const usedCategoryIds = new Set(post.categories.map((c) => c.id));
  const availableCategories = (tax?.categories ?? []).filter(
    (c: Category) => !usedCategoryIds.has(c.id)
  );

  return (
    <div className="mx-auto max-w-[800px] px-4 py-6 md:px-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5 text-[13px] text-dim hover:text-ink">
          <ArrowLeft size={15} /> Back to timeline
        </Link>
        <div className="flex items-center gap-1.5">
          {!editing && (
            <>
              <button
                onClick={startEdit}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 text-[13px] text-dim hover:border-line-strong hover:text-ink"
              >
                <Pencil size={13} /> Edit
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((m) => !m)}
                  aria-label="More actions"
                  className="rounded-lg border border-line bg-elevated p-2 text-dim hover:border-line-strong hover:text-ink"
                >
                  <MoreHorizontal size={14} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-elevated shadow-xl">
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          void retryAnalysis();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-dim hover:bg-elevated hover:text-ink"
                      >
                        <RefreshCw size={13} /> Re-run AI analysis
                      </button>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          setConfirmDelete(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-danger hover:bg-danger/10"
                      >
                        <Trash2 size={13} /> Delete post
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          {editing && (
            <>
              <button
                onClick={() => setEditing(false)}
                className="h-8 rounded-lg border border-line bg-elevated px-3 text-[13px] text-dim hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="h-8 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hi"
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {post.status === "failed" && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          <span className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {post.error ?? "AI analysis failed."}
          </span>
          <button
            onClick={retryAnalysis}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-danger/40 px-2.5 py-1 font-medium hover:bg-danger/10"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {post.status === "pending" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-[13px] text-warn">
          <Loader2 size={14} className="animate-spin" /> AI analysis in progress…
        </div>
      )}

      {post.review === "review" && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3">
          <span className="text-[13px] text-warn">Waiting for your approval — not on the timeline yet.</span>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={async () => {
                await api.patch(`/api/posts/${post.id}/review`, { review: "accepted" }).catch(() => {});
                invalidateTaxonomy();
                load();
              }}
              className="flex items-center gap-1.5 rounded-md bg-ok/15 px-2.5 py-1 text-[12px] font-medium text-ok hover:bg-ok/25"
            >
              <Check size={12} strokeWidth={3} /> Accept
            </button>
            <button
              onClick={async () => {
                await api.patch(`/api/posts/${post.id}/review`, { review: "rejected" }).catch(() => {});
                navigate("/");
              }}
              className="flex items-center gap-1.5 rounded-md border border-danger/40 px-2.5 py-1 text-[12px] font-medium text-danger hover:bg-danger/10"
            >
              <X size={12} /> Reject
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-[13px] text-danger">{actionError}</p>
      )}

      {/* Title + meta */}
      {editing ? (
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Title"
          className="mb-3 h-11 w-full rounded-lg border border-line bg-elevated px-3 text-lg font-semibold outline-none focus:border-accent"
        />
      ) : (
        <h1 className="mb-2 text-xl font-semibold leading-snug">{post.title ?? "Untitled post"}</h1>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-faint">
        <span className="font-mono">{post.author_handle || post.author_name || "unknown author"}</span>
        {(post.posted_at ?? post.created_at) && <span>{(post.posted_at ?? post.created_at).slice(0, 10)}</span>}
        {post.post_url && (
          <a href={post.post_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-dim">
            View on x.com <ExternalLink size={12} />
          </a>
        )}
        <StatusBadge status={post.status} />
      </div>

      {/* Summary */}
      <section className="mb-6">
        <SectionLabel>Summary</SectionLabel>
        {editing ? (
          <textarea
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            rows={4}
            className="w-full resize-y rounded-lg border border-line bg-elevated p-3 text-sm leading-relaxed outline-none focus:border-accent"
          />
        ) : (
          <p className="text-[14px] leading-relaxed text-ink">{post.summary ?? <span className="text-faint">No summary yet.</span>}</p>
        )}
      </section>

      {/* Raw text — repos get a GitHub button instead */}
      {post.source === "github" && !editing && (
        <section className="mb-6">
          <SectionLabel>Repository</SectionLabel>
          <a
            href={post.post_url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-elevated text-sm font-medium text-accent-hi transition-colors hover:border-accent/50 hover:bg-accent-subtle"
          >
            <Github size={16} />
            Open repository on GitHub
            <ExternalLink size={13} />
          </a>
        </section>
      )}
      {post.source !== "github" && (
        <section className="mb-6">
          <SectionLabel>Raw post</SectionLabel>
          {editing ? (
            <textarea
              value={form.raw_text}
              onChange={(e) => setForm({ ...form, raw_text: e.target.value })}
              rows={8}
              className="w-full resize-y rounded-lg border border-line bg-base p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-accent"
            />
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg border border-line bg-base p-4 font-mono text-[13px] leading-relaxed text-dim">
              {post.raw_text}
            </pre>
          )}
        </section>
      )}

      {/* Tags */}
      <section className="mb-6">
        <SectionLabel>Tags</SectionLabel>

        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {post.categories.map((c) =>
            editing ? (
              <RemovableChip key={`c${c.id}`} onRemove={() => removeCategory(c.id)}>
                {c.emoji} {c.name}
              </RemovableChip>
            ) : (
              <CategoryChip key={`c${c.id}`} category={c} />
            )
          )}
          {post.categories.length === 0 && !editing && <span className="text-[13px] text-faint">None</span>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {post.entities.map((en) => (
            <EntityChip key={`e${en.id}`} entity={en} onRemove={editing ? () => removeEntity(en.id) : undefined} />
          ))}
          {post.entities.length === 0 && <span className="text-[13px] text-faint">None</span>}

          {editing && !showEntityForm && (
            <button
              onClick={() => setShowEntityForm(true)}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 text-[12px] text-faint hover:text-ink"
            >
              <Plus size={11} /> Add entity
            </button>
          )}
        </div>

        {editing && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              defaultValue=""
              onChange={(e) => void addCategory(e.target.value)}
              className="h-8 rounded-lg border border-line bg-elevated px-2 text-[12px] text-dim outline-none focus:border-accent"
            >
              <option value="">+ Add category…</option>
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>

            {showEntityForm && (
              <div className="flex items-center gap-2">
                <select
                  value={newEntityType}
                  onChange={(e) => setNewEntityType(e.target.value as EntityTypeName)}
                  className="h-8 rounded-lg border border-line bg-elevated px-2 text-[12px] text-dim outline-none focus:border-accent"
                >
                  {ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ENTITY_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  value={newEntityName}
                  onChange={(e) => setNewEntityName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addEntity()}
                  placeholder="Name…"
                  className="h-8 w-40 rounded-lg border border-line bg-elevated px-2 text-[12px] outline-none focus:border-accent"
                />
                <button
                  onClick={addEntity}
                  aria-label="Confirm add entity"
                  className="rounded-md bg-accent p-1.5 text-white hover:bg-accent-hi"
                >
                  <Check size={13} strokeWidth={3} />
                </button>
                <button
                  onClick={() => setShowEntityForm(false)}
                  aria-label="Cancel add entity"
                  className="rounded-md border border-line p-1.5 text-faint hover:text-ink"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Metadata */}
      <section>
        <SectionLabel>Metadata</SectionLabel>
        <dl className="grid grid-cols-[130px_1fr] gap-y-1.5 text-[13px]">
          <dt className="text-faint">Author</dt>
          <dd className="font-mono text-dim">{[post.author_name, post.author_handle].filter(Boolean).join(" ") || "—"}</dd>
          <dt className="text-faint">Posted at</dt>
          <dd className="text-dim">{post.posted_at ?? "—"}</dd>
          <dt className="text-faint">Source URL</dt>
          <dd className="truncate font-mono text-dim">{post.post_url ?? "—"}</dd>
          <dt className="text-faint">Added</dt>
          <dd className="text-dim">{post.created_at?.slice(0, 19).replace("T", " ")}</dd>
        </dl>
      </section>

      {/* Delete modal */}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this post?">
        <p className="mb-5 text-[13px] leading-relaxed text-dim">
          This permanently removes the post and its tags from your archive.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setConfirmDelete(false)}
            className="h-9 rounded-lg border border-line px-4 text-sm text-dim hover:border-line-strong hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={doDelete}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-danger px-4 text-sm font-medium text-black hover:brightness-110"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">{children}</div>
  );
}

function RemovableChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-accent-subtle pl-2.5 pr-1.5 text-[12px] font-medium text-accent-hi">
      {children}
      <button onClick={onRemove} aria-label="Remove" className="ml-0.5 text-faint hover:text-danger">
        ×
      </button>
    </span>
  );
}

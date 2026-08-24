import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpDown, DatabaseZap, Plus, X } from "lucide-react";
import PostCard, { SkeletonCard } from "../components/PostCard";
import EmptyState from "../components/EmptyState";
import { CategoryList, CategoryChips, useSectionCategories } from "../components/Categories";
import { groupByDay, usePostList } from "../hooks/usePostList";
import { ENTITY_TYPE_LABELS } from "../components/Chips";
import type { EntityTypeName } from "../../shared/types";

const TYPE_OPTIONS: { value: EntityTypeName; label: string }[] = [
  { value: "company", label: ENTITY_TYPE_LABELS.company },
  { value: "model", label: ENTITY_TYPE_LABELS.model },
  { value: "person", label: ENTITY_TYPE_LABELS.person },
  { value: "technology", label: ENTITY_TYPE_LABELS.technology },
];

export default function Timeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshKey, setRefreshKey] = useState(0);

  const category = searchParams.get("category") ?? "";
  const entity = searchParams.get("entity") ?? "";
  const type = searchParams.get("type") ?? "";
  const sort = (searchParams.get("sort") as "asc" | "desc") ?? "desc";

  const params = useMemo(
    () => ({
      category: category ? category.split(",") : undefined,
      entity: entity ? entity.split(",").map(Number) : undefined,
      type: type ? type.split(",") : undefined,
      sort,
      limit: 50,
    }),
    [category, entity, type, sort]
  );

  const { items, total, loading, error, reload, loadMore } = usePostList(params, refreshKey);
  const groups = groupByDay(items);
  const cats = useSectionCategories("/timeline");

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const hasFilters = Boolean(category || entity || type);

  return (
    <div className="mx-auto flex max-w-[1200px] gap-6 px-4 py-6 md:px-6">
      {/* Category rail — desktop */}
      <div className="hidden w-[210px] shrink-0 self-start lg:block">
        <div className="sticky top-[72px]">
          <CategoryList
            cats={cats}
            activeSlug={category}
            onSelect={(slug) => setParam("category", slug)}
          />
        </div>
      </div>

      <div className="min-w-0 flex-1">
      {/* Mobile category chips */}
      <CategoryChips cats={cats} activeSlug={category} onSelect={(slug) => setParam("category", slug)} />

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">

        <div className="flex items-center gap-0.5 rounded-[9px] bg-elevated p-[3px]">
          <button
            onClick={() => setParam("type", null)}
            className={`rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-all ${
              !type ? "bg-base text-ink shadow-sm" : "text-dim hover:text-ink"
            }`}
          >
            All
          </button>
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              onClick={() => setParam("type", t.value)}
              className={`rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-all ${
                type === t.value ? "bg-base text-ink shadow-sm" : "text-dim hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setParam("sort", sort === "desc" ? "asc" : "desc")}
          title="Toggle sort order"
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 text-[12px] text-dim hover:border-line-strong hover:text-ink"
        >
          <ArrowUpDown size={13} />
          {sort === "desc" ? "Newest" : "Oldest"}
        </button>

        {hasFilters && (
          <button
            onClick={() => {
              setSearchParams({}, { replace: true });
              setRefreshKey((k) => k + 1);
            }}
            className="flex h-9 items-center gap-1 rounded-lg px-2 text-[12px] text-faint hover:text-danger"
          >
            <X size={13} /> Clear filters
          </button>
        )}

        <span className="ml-auto font-mono text-[12px] text-faint">{total}</span>
      </div>

      {/* Active filter pills */}
      {hasFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {category &&
            category.split(",").map((slug) => (
              <Pill key={slug} label={slug} onRemove={() => setParam("category", null)} />
            ))}
          {entity && <Pill label={`#${entity}`} onRemove={() => setParam("entity", null)} />}
          {type && <Pill label={ENTITY_TYPE_LABELS[type as EntityTypeName] ?? type} onRemove={() => setParam("type", null)} />}
        </div>
      )}

      {error && <p className="rounded-lg bg-danger/10 px-4 py-3 text-[13px] text-danger">{error}</p>}

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={DatabaseZap}
            title="No posts match these filters"
            hint="Try removing a filter or browse a different category."
          />
        ) : (
          <EmptyState
            icon={DatabaseZap}
            title="Your intelligence archive is empty"
            hint="Paste your first AI post to start building the database. AI will summarize and categorize it automatically."
            action={
              <Link
                to="/superadmin?tab=add"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hi"
              >
                <Plus size={16} /> Add Post
              </Link>
            }
          />
        )
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.label + g.items[0].id} className="mb-6">
              <div className="mb-3 font-mono text-[13px] text-faint">── {g.label} ──</div>
              <div className="space-y-3">
                {g.items.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </div>
            </section>
          ))}

          {items.length < total && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="mx-auto mt-2 block rounded-lg border border-line bg-elevated px-4 py-2 text-[13px] text-dim hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              Load more ({total - items.length} remaining)
            </button>
          )}
        </>
      )}
      </div>
    </div>
  );
}

function Pill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-elevated pl-3 pr-1.5 text-[12px] text-dim">
      {label}
      <button onClick={onRemove} aria-label={`Remove ${label}`} className="rounded-full p-0.5 text-faint hover:text-danger">
        ×
      </button>
    </span>
  );
}

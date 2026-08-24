import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import PostCard, { SkeletonCard } from "../components/PostCard";
import EmptyState from "../components/EmptyState";
import { usePostList } from "../hooks/usePostList";
import { loadTaxonomy } from "../components/CommandPalette";
import { CategoryList, CategoryChips } from "../components/Categories";
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS } from "../components/Chips";
import type { EntityTypeName, TaxonomyResponse } from "../../shared/types";

const SECTION_ORDER: EntityTypeName[] = ["company", "model", "person", "technology", "product"];
const PREVIEW_COUNT = 10;

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tax, setTax] = useState<TaxonomyResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const category = searchParams.get("category") ?? "";
  const entity = searchParams.get("entity") ?? "";
  const [source, setSource] = useState<"all" | "posts" | "github">("all");

  const params = useMemo(
    () => ({
      category: category ? category.split(",") : undefined,
      entity: entity ? entity.split(",").map(Number) : undefined,
      source,
      limit: 50,
    }),
    [category, entity, source]
  );

  const { items, total, loading } = usePostList(params);
  const [refreshKey] = useState(0);

  useEffect(() => {
    loadTaxonomy(true).then(setTax);
  }, []);

  const toggleParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const entitiesByType = useMemo(() => {
    const map = new Map<EntityTypeName, TaxonomyResponse["entities"]>();
    for (const e of tax?.entities ?? []) {
      const list = map.get(e.type) ?? [];
      list.push(e);
      map.set(e.type, list);
    }
    return map;
  }, [tax]);

  return (
    <div className="mx-auto flex max-w-[1200px] gap-6 px-4 py-6 md:px-6">
      {/* Filter rail */}
      <aside className="sticky top-0 hidden h-[calc(100vh-7.5rem)] w-[260px] shrink-0 self-start overflow-y-auto pr-2 lg:block">
        <div className="mb-5">
          <CategoryList
            cats={tax?.categories ?? []}
            activeSlug={category}
            onSelect={(slug) => (slug ? toggleParam("category", slug) : setSearchParams({}, { replace: true }))}
          />
        </div>

        {SECTION_ORDER.map((type) => {
          const list = entitiesByType.get(type) ?? [];
          if (!list.length) return null;
          const isOpen = expanded[type];
          const shown = isOpen ? list : list.slice(0, PREVIEW_COUNT);
          return (
            <RailSection key={type} label={ENTITY_TYPE_LABELS[type]}>
              {shown.map((e) => (
                <button
                  key={e.id}
                  onClick={() => toggleParam("entity", String(e.id))}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    entity === String(e.id)
                      ? "bg-accent-subtle font-medium text-accent-hi"
                      : "text-dim hover:bg-elevated hover:text-ink"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ENTITY_TYPE_COLORS[e.type].dot}`} />
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <span className="font-mono text-[11px] text-faint">{e.count ?? 0}</span>
                </button>
              ))}
              {list.length > PREVIEW_COUNT && (
                <button
                  onClick={() => setExpanded((x) => ({ ...x, [type]: !isOpen }))}
                  className="mt-1 px-2.5 text-[12px] text-faint hover:text-dim"
                >
                  {isOpen ? "Show less" : `Show all (${list.length})`}
                </button>
              )}
            </RailSection>
          );
        })}
      </aside>

      {/* Results */}
      <div className="min-w-0 flex-1">
        {/* Mobile filter chips */}
        <CategoryChips
          cats={(tax?.categories ?? []).slice(0, 8)}
          activeSlug={category}
          onSelect={(slug) => (slug ? toggleParam("category", slug) : setSearchParams({}, { replace: true }))}
        />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Browse database</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-[9px] bg-elevated p-[3px]">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "posts", label: "Posts" },
                  { id: "github", label: "Repos" },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSource(s.id)}
                  className={`rounded-[7px] px-3 py-1 text-[12px] font-medium transition-all ${
                    source === s.id ? "bg-base text-ink shadow-sm" : "text-dim hover:text-ink"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="font-mono text-[12px] text-faint">{total}</span>
          </div>
        </div>

        {(category || entity) && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {category && (
              <ActivePill label={tax?.categories.find((c) => c.slug === category)?.name ?? category} onRemove={() => setSearchParams({}, { replace: true })} />
            )}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="Nothing here yet"
            hint={
              (category || entity)
                ? "No posts match this filter. Pick another item from the rail."
                : "Add posts first, then browse them by company, model or technology."
            }
            action={
              !(category || entity) && (
                <Link to="/superadmin?tab=add" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hi">
                  Add Post
                </Link>
              )
            }
          />
        ) : (
          <div className="space-y-3" data-refresh={refreshKey}>
            {items.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-faint">{label}</div>
      {children}
    </div>
  );
}

function ActivePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-elevated pl-3 pr-1.5 text-[12px] text-dim">
      {label}
      <button onClick={onRemove} aria-label={`Remove ${label}`} className="rounded-full p-0.5 text-faint hover:text-danger">
        ×
      </button>
    </span>
  );
}

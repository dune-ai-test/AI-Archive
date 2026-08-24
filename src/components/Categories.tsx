import { useEffect, useState } from "react";
import { api } from "../api";
import type { Category } from "../../shared/types";

/** Fetches categories scoped to a section ("posts" vs "github" counts). */
export function useSectionCategories(basePath: "/timeline" | "/repos"): Category[] {
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    const srcParam = basePath === "/repos" ? "github" : "posts";
    api
      .get<{ categories: Category[] }>(`/api/taxonomy?source=${srcParam}`)
      .then((r) => setCats(r.categories))
      .catch(() => {});
  }, [basePath]);
  return cats;
}

function Row({
  cat,
  active,
  onSelect,
}: {
  cat: Category | null;
  active: boolean;
  onSelect: (slug: string | null) => void;
}) {
  return (
    <button
      onClick={() => onSelect(active ? null : (cat?.slug ?? null))}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
        active ? "bg-elevated font-medium text-ink" : "text-dim hover:bg-elevated hover:text-ink"
      }`}
    >
      {cat && <span className="w-4 shrink-0 text-center text-[13px]">{cat.emoji}</span>}
      <span className="min-w-0 flex-1 truncate">{cat?.name ?? "All categories"}</span>
      {(cat?.count ?? 0) > 0 && (
        <span className={`font-mono text-[11px] ${active ? "text-dim" : "text-faint"}`}>{cat!.count}</span>
      )}
    </button>
  );
}

/** Desktop vertical list — place inside a left rail column. */
export function CategoryList({
  cats,
  activeSlug,
  onSelect,
}: {
  cats: Category[];
  activeSlug: string;
  onSelect: (slug: string | null) => void;
}) {
  return (
    <nav className="rounded-xl border border-line bg-surface p-2">
      <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wider text-faint">Categories</div>
      <Row cat={null} active={!activeSlug} onSelect={onSelect} />
      {cats.map((c) => (
        <Row key={c.slug} cat={c} active={activeSlug === c.slug} onSelect={onSelect} />
      ))}
    </nav>
  );
}

/** Mobile horizontal chip scroller. */
export function CategoryChips({
  cats,
  activeSlug,
  onSelect,
}: {
  cats: Category[];
  activeSlug: string;
  onSelect: (slug: string | null) => void;
}) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
      <Chip active={!activeSlug} onClick={() => onSelect(null)}>
        All
      </Chip>
      {cats.map((c) => (
        <Chip key={c.slug} active={activeSlug === c.slug} onClick={() => onSelect(c.slug)}>
          {c.emoji} {c.name}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
        active
          ? "border-accent/50 bg-accent-subtle font-medium text-accent-hi"
          : "border-line bg-elevated text-dim hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

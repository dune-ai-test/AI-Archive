import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Settings, LayoutGrid, Search, CornerDownLeft } from "lucide-react";
import { api } from "../api";
import type { PostListItem, TaxonomyResponse } from "../../shared/types";

interface Item {
  key: string;
  group: string;
  label: string;
  hint?: string;
  to: string;
}

let taxonomyCache: TaxonomyResponse | null = null;

export async function loadTaxonomy(force = false): Promise<TaxonomyResponse | null> {
  if (!taxonomyCache || force) {
    taxonomyCache = await api.get<TaxonomyResponse>("/api/taxonomy").catch(() => null);
  }
  return taxonomyCache;
}
export function invalidateTaxonomy() {
  taxonomyCache = null;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [posts, setPosts] = useState<PostListItem[]>([]);
  const [tax, setTax] = useState<TaxonomyResponse | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery("");
      setPosts([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
      loadTaxonomy().then(setTax);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (!query.trim()) {
        setPosts([]);
        return;
      }
      api
        .get<{ items: PostListItem[] }>(`/api/search?q=${encodeURIComponent(query)}&limit=5`)
        .then((r) => setPosts(r.items))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Item[] = [
      { key: "a1", group: "Actions", label: "Add new post", to: "/superadmin?tab=add" },
      { key: "a2", group: "Actions", label: "Browse database", to: "/browse" },
      { key: "a3", group: "Actions", label: "Open settings", to: "/superadmin?tab=settings" },
    ];

    for (const c of tax?.categories ?? []) {
      if (!q || c.name.toLowerCase().includes(q)) {
        out.push({
          key: `cat-${c.id}`,
          group: "Categories",
          label: `${c.emoji} ${c.name}`,
          hint: String(c.count ?? 0),
          to: `/?category=${c.slug}`,
        });
      }
    }

    for (const e of tax?.entities ?? []) {
      if (q && e.name.toLowerCase().includes(q)) {
        out.push({
          key: `ent-${e.id}`,
          group: e.type.charAt(0).toUpperCase() + e.type.slice(1) + "s",
          label: e.name,
          hint: String(e.count ?? 0),
          to: `/?entity=${e.id}`,
        });
      }
    }

    for (const p of posts) {
      out.push({
        key: `post-${p.id}`,
        group: "Posts",
        label: p.title ?? p.raw_text.slice(0, 70),
        hint: p.author_handle ?? undefined,
        to: `/post/${p.id}`,
      });
    }

    return out.slice(0, 14);
  }, [query, tax, posts]);

  const go = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      onClose();
      navigate(item.to);
    },
    [navigate, onClose]
  );

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="fade-up mx-auto mt-[15vh] w-full max-w-xl overflow-hidden rounded-xl border border-line bg-elevated shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                go(items[active]);
              }
            }}
            placeholder="Search or jump to…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-faint">esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-faint">No matches</p>
          )}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const icons: Record<string, typeof Plus> = {
              Actions: Plus,
              Categories: LayoutGrid,
              Posts: Search,
            };
            const Icon = icons[item.group];
            return (
              <div key={item.key}>
                {header && (
                  <div className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                    {header}
                  </div>
                )}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                    i === active ? "bg-accent-subtle text-ink" : "text-dim"
                  }`}
                >
                  <span className="w-4 shrink-0 text-center">
                    {i === active ? <CornerDownLeft size={13} /> : Icon ? <Icon size={13} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="font-mono text-[11px] text-faint">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

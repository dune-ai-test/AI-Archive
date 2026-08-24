import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "../api";
import type { Category } from "../../shared/types";

export default function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (slug: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<{ categories: Category[] }>("/api/taxonomy")
      .then((r) => setCats(r.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = cats.find((c) => c.slug === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 items-center gap-2 rounded-[9px] bg-elevated px-3 text-[13px] transition-colors ${
          current ? "text-ink" : "text-dim"
        } hover:text-ink`}
      >
        <span className="max-w-[160px] truncate">
          {current ? `${current.emoji} ${current.name}` : "All categories"}
        </span>
        <ChevronDown size={13} className={`text-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 max-h-[320px] w-60 overflow-y-auto rounded-xl border border-line bg-elevated p-1 shadow-xl">
          <Row
            active={!value}
            label="All categories"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          />
          {cats.map((c) => (
            <Row
              key={c.slug}
              active={value === c.slug}
              emoji={c.emoji}
              label={c.name}
              count={c.count}
              onClick={() => {
                onChange(c.slug);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  active,
  label,
  emoji,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  emoji?: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
        active ? "bg-base font-medium text-ink shadow-sm" : "text-dim hover:bg-surface hover:text-ink"
      }`}
    >
      {emoji !== undefined && <span className="w-4 shrink-0 text-center">{emoji}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {(count ?? 0) > 0 && <span className="font-mono text-[11px] text-faint">{count}</span>}
    </button>
  );
}
